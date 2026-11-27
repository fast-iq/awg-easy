import { promises as dnsPromises } from 'node:dns';
import { Unzip, UnzipInflate } from 'fflate';
import {
  createScanState,
  isIPv4String,
  levelOf,
  scanLine,
  type BlockLevel,
  type BlockStatusType,
} from '#shared/utils/blockrisk';

/**
 * Registry block monitor: once a day (or on demand from the admin UI) checks
 * whether the server's public IP is listed in the unified Russian blocked
 * information registry and how saturated the server's /24 is with blocked
 * neighbours (early warning that the range is being mass-blocked).
 *
 * Data sources (mirrors of reestr.rublacklist.net, no auth required):
 *  - full IP dump csv.zip  (exact IPs + CIDRs: coverage + /24 saturation)
 *  - blocked-ranges text list (small fallback; coverage-focused)
 * The registry service has known outages: on error the previously stored
 * status is KEPT (with the error noted), so the UI never shows a false "ok".
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DUMP_URL = 'https://data.rublacklist.net/api/v3/ips/csv.zip';
const RANGES_URL = 'https://ip-ranges.rublacklist.net/';
const MAX_DUMP_BYTES = 200 * 1024 * 1024;

type ScanResult = {
  inRegistry: boolean;
  whole: boolean;
  count: number;
  level: BlockLevel;
};

let lastCheckAt = 0;
let running = false;

function finishScan(state: ReturnType<typeof createScanState>): ScanResult {
  return {
    inRegistry: state!.inRegistry,
    whole: state!.wholeRangeBlocked,
    count: state!.blockedInSlash24,
    level: levelOf(state!),
  };
}

/** feed a byte/text line-stream into the scanner (decoder kept across chunks) */
function makeFeeder(state: ReturnType<typeof createScanState>) {
  const decoder = new TextDecoder();
  let carry = '';
  return (data: Uint8Array | string, final: boolean) => {
    if (typeof data === 'string') {
      carry += data;
    } else {
      carry += decoder.decode(data, { stream: !final });
    }
    const lines = carry.split('\n');
    carry = lines.pop() ?? '';
    for (const line of lines) scanLine(state!, line);
    if (final) {
      scanLine(state!, carry);
      carry = '';
    }
  };
}

/** stream the .csv member of the zip dump through the scanner (exported for tests) */
export function scanZipDump(
  body: ReadableStream<Uint8Array>,
  ip: string
): Promise<ScanResult> {
  return new Promise<ScanResult>((resolve, reject) => {
    const state = createScanState(ip);
    if (!state) {
      reject(new Error(`not an IPv4 address: ${ip}`));
      return;
    }
    const feed = makeFeeder(state);
    let csvFinalized = false;

    const unzip = new Unzip();
    // zip entries are DEFLATE-compressed (type 8) — register the decoder
    unzip.register(UnzipInflate);
    unzip.onfile = (file) => {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        // drain without parsing (handler args: err, data, final)
        file.ondata = () => {};
        file.start();
        return;
      }
      // UnzipInflate already expands entries: ondata delivers plaintext
      file.ondata = (err, data, final) => {
        if (err) {
          reject(err);
          return;
        }
        if (data.length || final) feed(data, final);
        if (final) csvFinalized = true;
      };
      file.start();
    };

    const reader = body.getReader();
    let total = 0;
    const pump = async (): Promise<void> => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_DUMP_BYTES) {
          await reader.cancel();
          reject(new Error(`dump exceeds ${MAX_DUMP_BYTES} bytes`));
          return;
        }
        // fflate signals malformed-archive errors by throwing from push()
        try {
          unzip.push(value, false);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
          return;
        }
      }
      try {
        unzip.push(new Uint8Array(0), true);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      // a zip with no csv member (or one that never finalized) is an error
      if (!csvFinalized) {
        reject(new Error('no csv member found in dump archive'));
        return;
      }
      resolve(finishScan(state));
    };
    pump().catch(reject);
  });
}

/** plain-text CIDR/IP-per-line fallback list (exported for tests) */
export async function scanRangesText(
  body: ReadableStream<Uint8Array>,
  ip: string
): Promise<ScanResult> {
  const state = createScanState(ip);
  if (!state) throw new Error(`not an IPv4 address: ${ip}`);
  const feed = makeFeeder(state);
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    feed(value, false);
  }
  feed(new Uint8Array(0), true);
  return finishScan(state);
}

async function fetchUrl(url: string): Promise<Response> {
  return await fetch(url, {
    signal: AbortSignal.timeout(10 * 60 * 1000),
    headers: { 'User-Agent': 'awg-easy/monitor' },
  });
}

/**
 * Run a registry check for the configured server host. `force` bypasses the
 * daily gate (admin "check now"). Never throws: errors land on the status and
 * the previous result stays visible (stale-but-real beats a false "ok").
 */
export async function runBlockMonitorCheck(
  force = false
): Promise<BlockStatusType> {
  const previous = await Database.general.getBlockMonitor();

  if (running) {
    return (
      previous ?? {
        checkedAt: '',
        ip: '',
        host: '',
        level: 'unknown',
        inRegistry: null,
        wholeRangeBlocked: false,
        blockedInSlash24: null,
        source: null,
        error: 'another check is already running',
      }
    );
  }
  if (!force && previous && Date.now() - lastCheckAt < DAY_MS) {
    return previous;
  }

  const userConfig = await Database.userConfigs.get();
  const host = userConfig?.host ?? '';
  const status: BlockStatusType = previous
    ? { ...previous }
    : {
        checkedAt: '',
        ip: '',
        host,
        level: 'unknown',
        inRegistry: null,
        wholeRangeBlocked: false,
        blockedInSlash24: null,
        source: null,
        error: null,
      };

  if (!host) {
    status.error = 'server host is not configured yet';
    await Database.general.setBlockMonitor(status);
    return status;
  }

  running = true;
  lastCheckAt = Date.now();
  try {
    let ip = host;
    if (!isIPv4String(host)) {
      ip = (await dnsPromises.lookup(host, { family: 4 })).address;
    }
    status.ip = ip;
    status.host = host;

    let scanned: ScanResult;
    let source: 'dump' | 'ranges';
    try {
      const dumpRes = await fetchUrl(DUMP_URL);
      if (!dumpRes.ok || !dumpRes.body) {
        throw new Error(`dump HTTP ${dumpRes.status}`);
      }
      scanned = await scanZipDump(dumpRes.body as never, ip);
      source = 'dump';
    } catch (dumpError) {
      const res = await fetchUrl(RANGES_URL);
      if (!res.ok || !res.body) {
        throw new Error(
          `dump failed (${dumpError instanceof Error ? dumpError.message : String(dumpError)}); ranges HTTP ${res.status}`,
          { cause: dumpError }
        );
      }
      scanned = await scanRangesText(res.body as never, ip);
      source = 'ranges';
    }

    status.checkedAt = new Date().toISOString();
    status.inRegistry = scanned.inRegistry;
    status.wholeRangeBlocked = scanned.whole;
    // ranges list is CIDR-only: saturation count would be an undercount
    status.blockedInSlash24 = source === 'dump' ? scanned.count : null;
    status.level = scanned.level;
    status.source = source;
    status.error = null;

    if (previous && previous.level !== status.level) {
      logAudit(null, null, 'monitor.block_status_changed', ip, {
        from: previous.level,
        to: status.level,
        blockedInSlash24: status.blockedInSlash24,
      });
    }
  } catch (e) {
    status.error = e instanceof Error ? e.message : String(e);
    // keep previous data/level visible
  } finally {
    running = false;
  }

  await Database.general.setBlockMonitor(status);
  return status;
}

/** daily entry point from the WireGuard cron cycle (fire-and-forget) */
export function blockMonitorDailyTick() {
  void runBlockMonitorCheck(false).catch(() => {
    /* outcome is persisted on the status itself */
  });
}
