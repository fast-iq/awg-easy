// Registry block-risk pure logic (shared/utils/blockrisk) + streaming dump
// parsers (server/utils/blockMonitor scanZipDump/scanRangesText).
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { build } from 'esbuild';
import { zipSync, strToU8 } from 'fflate';

// blockMonitor.ts uses nitro auto-imports (#shared alias, Database/logAudit
// globals). esbuild resolves the alias; the globals stay free identifiers —
// the exported scan functions never touch them.
const outDir = mkdtempSync(join(tmpdir(), 'awg-blockrisk-'));
await build({
  entryPoints: [resolve(import.meta.dirname, '../shared/utils/blockrisk.ts')],
  bundle: true,
  format: 'esm',
  outfile: join(outDir, 'blockrisk.mjs'),
  logLevel: 'silent',
});
await build({
  entryPoints: [
    resolve(import.meta.dirname, '../server/utils/blockMonitor.ts'),
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['node:*'],
  alias: {
    '#shared/utils/blockrisk': resolve(
      import.meta.dirname,
      '../shared/utils/blockrisk.ts'
    ),
  },
  outfile: join(outDir, 'blockmonitor.mjs'),
  logLevel: 'silent',
});

const { createScanState, scanLine, levelOf, isIPv4String, cidrToRange } =
  await import(join(outDir, 'blockrisk.mjs'));
const { scanRangesText, scanZipDump } = await import(
  join(outDir, 'blockmonitor.mjs')
);

function streamFromText(text) {
  const bytes = strToU8(text);
  return new ReadableStream({
    start(controller) {
      // two chunks to exercise the line-carry logic
      const mid = Math.floor(bytes.length / 2);
      controller.enqueue(bytes.slice(0, mid));
      controller.enqueue(bytes.slice(mid));
      controller.close();
    },
  });
}

test('IPv4 parsing and CIDR ranges', () => {
  expect(isIPv4String('157.228.160.86')).toBe(true);
  expect(isIPv4String('999.1.1.1')).toBe(false);
  expect(isIPv4String('2001:db8::1')).toBe(false);
  expect(cidrToRange('1.2.3.0/24')).toEqual({
    first: 16909056,
    last: 16909311,
    prefix: 24,
  });
});

test('clean /24 scans as ok, saturated /24 raises the level', () => {
  const mk = (lines) => {
    const state = createScanState('157.228.160.86');
    for (const l of lines) scanLine(state, l);
    return state;
  };
  expect(levelOf(mk(['8.8.8.8', '2001:db8::1', 'header,comma']))).toBe('ok');
  expect(
    levelOf(
      mk(
        Array.from({ length: 20 }, (_, i) => `157.228.160.${i}`).concat(
          '1.1.1.1'
        )
      )
    )
  ).toBe('watch');
  expect(
    levelOf(mk(Array.from({ length: 70 }, (_, i) => `157.228.160.${i}`)))
  ).toBe('high');
  // exact hit = blocked regardless of saturation
  expect(levelOf(mk(['157.228.160.86']))).toBe('blocked');
  // covering /24 or wider = blocked
  expect(levelOf(mk(['157.228.160.0/24']))).toBe('blocked');
  expect(levelOf(mk(['157.228.0.0/16']))).toBe('blocked');
  // a /23 entry covers the /24 fully (prefix <= 24 rule) => blocked
  const s = mk(['157.228.160.0/23']);
  expect(s.wholeRangeBlocked).toBe(true);
  expect(s.blockedInSlash24).toBe(256);
  expect(levelOf(s)).toBe('blocked');
});

test('scanRangesText parses IP/CIDR lines from a plain list', async () => {
  const text = [
    '# comment',
    '8.8.8.8',
    '203.0.113.0/24',
    '157.228.160.50',
    '157.228.160.51',
    '',
  ].join('\n');
  const res = await scanRangesText(streamFromText(text), '157.228.160.86');
  expect(res.inRegistry).toBe(false);
  expect(res.count).toBe(2);
  expect(res.level).toBe('ok');

  const hit = await scanRangesText(
    streamFromText('157.228.160.86\n'),
    '157.228.160.86'
  );
  expect(hit.inRegistry).toBe(true);
  expect(hit.level).toBe('blocked');
});

test('scanZipDump streams the csv member of a zip archive', async () => {
  const csv = ['8.8.8.8', '157.228.160.10', '157.228.160.11'].join('\n');
  const zipped = zipSync({ 'ips.csv': strToU8(csv) });
  const stream = new ReadableStream({
    start(controller) {
      // odd chunking exercises the zip parser across boundaries
      for (let i = 0; i < zipped.length; i += 7) {
        controller.enqueue(zipped.slice(i, i + 7));
      }
      controller.close();
    },
  });
  const res = await scanZipDump(stream, '157.228.160.86');
  expect(res.inRegistry).toBe(false);
  expect(res.count).toBe(2);
  expect(res.level).toBe('ok');
});

test('scanZipDump finds csv among other members and rejects non-ipv4', async () => {
  const zipped = zipSync({
    'README.txt': strToU8('docs'),
    'ips.csv': strToU8('157.228.160.0/24'),
  });
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(zipped);
      c.close();
    },
  });
  const res = await scanZipDump(stream, '157.228.160.86');
  expect(res.whole).toBe(true);
  expect(res.level).toBe('blocked');

  await expect(
    scanZipDump(
      new ReadableStream({
        start(c) {
          c.enqueue(zipSync({ 'a.csv': strToU8('') }));
          c.close();
        },
      }),
      'example.com'
    )
  ).rejects.toThrow('not an IPv4');
});

// keep the migrations journal in sync check (0004 registered)
test('migration 0004 adds block_monitor column', () => {
  const sql = readFileSync(
    new URL(
      '../server/database/migrations/0004_naive_wallow.sql',
      import.meta.url
    ),
    'utf8'
  );
  expect(sql).toContain('general_table');
  expect(sql).toContain('block_monitor');
  // must be the ONLY statement (drizzle drift guard, cf. 0002 lesson)
  expect(sql.split('--> statement-breakpoint').length).toBe(1);
});
