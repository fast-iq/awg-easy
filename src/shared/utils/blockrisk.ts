// Pure logic for the registry-based block monitor (data from the unified
// Russian blocked-information registry, reestr.rublacklist.net mirrors).
// No network/DB here: unit-testable, reused by the UI badge.

export type BlockLevel = 'unknown' | 'ok' | 'watch' | 'high' | 'blocked';

export type BlockStatusType = {
  /** last SUCCESSFUL check (UTC ISO); stale status keeps the old timestamp */
  checkedAt: string;
  /** public IPv4 that was checked */
  ip: string;
  /** configured server host as clients see it (may be a domain) */
  host: string;
  level: BlockLevel;
  /** exact IP (or a CIDR containing it) is listed in the registry */
  inRegistry: boolean | null;
  /** a listed CIDR with prefix <= 24 covers the whole /24 */
  wholeRangeBlocked: boolean;
  /** distinct blocked IPs inside the checked /24 (null = no data) */
  blockedInSlash24: number | null;
  /** which data source produced the result */
  source: 'dump' | 'ranges' | null;
  /** last fetch/parse error; the previous result stays visible when set */
  error: string | null;
};

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function ipToNumber(ip: string): number | null {
  const m = V4.exec(ip.trim());
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! * 256 + parts[1]!) * 256 + parts[2]!) * 256 + parts[3]!;
}

export function isIPv4String(value: string): boolean {
  return ipToNumber(value) !== null;
}

/** first three octets of an IPv4 ("1.2.3" for 1.2.3.4), null if invalid */
export function slash24Of(ip: string): string | null {
  const n = ipToNumber(ip);
  if (n === null) return null;
  return `${Math.floor(n / 2 ** 16)}.${Math.floor(n / 2 ** 8) % 256}.${Math.floor(n / 2 ** 16) % 256}`;
}

type CidrRange = { first: number; last: number; prefix: number } | null;

/** IPv4 CIDR (or bare IP = /32) to numeric range; null for anything else */
export function cidrToRange(entry: string): CidrRange {
  const text = entry.trim();
  const [ipPart, prefixPart] = text.split('/');
  if (ipPart === undefined) return null;
  const base = ipToNumber(ipPart);
  if (base === null) return null;
  if (prefixPart === undefined) {
    return { first: base, last: base, prefix: 32 };
  }
  const prefix = Number(prefixPart);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const size = 2 ** (32 - prefix);
  const first = Math.floor(base / size) * size;
  return { first, last: first + size - 1, prefix };
}

/** state accumulated while streaming a registry dump */
export type RangeScanState = {
  slash24: string; // "a.b.c"
  ipNum: number;
  rangeFirst: number;
  rangeLast: number;
  inRegistry: boolean;
  wholeRangeBlocked: boolean;
  /** count of blocked addresses inside the /24, capped at 256 */
  blockedInSlash24: number;
};

export function createScanState(ip: string): RangeScanState | null {
  const ipNum = ipToNumber(ip);
  const slash24 = slash24Of(ip);
  if (ipNum === null || slash24 === null) return null;
  return {
    slash24,
    ipNum,
    rangeFirst: Math.floor(ipNum / 256) * 256,
    rangeLast: Math.floor(ipNum / 256) * 256 + 255,
    inRegistry: false,
    wholeRangeBlocked: false,
    blockedInSlash24: 0,
  };
}

/** feed one registry line (IP, CIDR, IPv6, CSV header, comment) into state */
export function scanLine(state: RangeScanState, line: string): void {
  const entry = line.trim().split(',')[0]!.trim();
  if (!entry || entry.startsWith('#') || !entry.includes('.')) return;
  // fast reject lines that cannot be IPv4 for this /24
  const range = cidrToRange(entry);
  if (range === null) return;
  if (range.last < state.rangeFirst || range.first > state.rangeLast) return;
  if (range.prefix <= 24) state.wholeRangeBlocked = true;
  if (range.first <= state.ipNum && range.last >= state.ipNum) {
    state.inRegistry = true;
  }
  // overlap size between the entry and the /24 (exact IPs, sub-CIDRs, ...)
  const overlap =
    Math.min(range.last, state.rangeLast) -
    Math.max(range.first, state.rangeFirst) +
    1;
  state.blockedInSlash24 = Math.min(256, state.blockedInSlash24 + overlap);
}

export function levelOf(state: RangeScanState): BlockLevel {
  if (state.inRegistry || state.wholeRangeBlocked) return 'blocked';
  if (state.blockedInSlash24 >= 64) return 'high';
  if (state.blockedInSlash24 >= 16) return 'watch';
  return 'ok';
}

/** color family for UI badges */
export function levelColor(level: BlockLevel): string {
  switch (level) {
    case 'blocked':
      return 'bg-red-600 text-white';
    case 'high':
      return 'bg-orange-500 text-white';
    case 'watch':
      return 'bg-yellow-400 text-black';
    case 'ok':
      return 'bg-green-600 text-white';
    default:
      return 'bg-gray-400 text-white';
  }
}
