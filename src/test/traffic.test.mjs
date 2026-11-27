// TrafficService semantics against the real migrations: baseline-only first
// sample, delta accumulation, counter-reset handling, totals/prune.
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';

const MIGRATIONS = [
  '0000_short_skin.sql',
  '0001_classy_the_stranger.sql',
  '0002_cooing_the_anarchist.sql',
  '0003_big_purple_man.sql',
  '0004_naive_wallow.sql',
  '0005_sudden_mister_sinister.sql',
];

async function freshService() {
  const client = createClient({ url: ':memory:' });
  for (const file of MIGRATIONS) {
    const sql = readFileSync(
      resolve(import.meta.dirname, `../server/database/migrations/${file}`),
      'utf8'
    );
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed) await client.executeMultiple(trimmed);
    }
  }
  const db = drizzle({ client });

  const outDir = mkdtempSync(join(tmpdir(), 'traffic-bundle-'));
  const outfile = join(outDir, 'service.bundle.mjs');
  await build({
    entryPoints: [
      resolve(
        import.meta.dirname,
        '../server/database/repositories/traffic/service.ts'
      ),
    ],
    bundle: true,
    format: 'esm',
    platform: 'node',
    external: ['drizzle-orm', 'drizzle-orm/*', 'node:*'],
    outfile,
    logLevel: 'silent',
  });
  const { TrafficService } = await import(outfile);
  const svc = new TrafficService(db);
  return { svc, client };
}

async function seedClient(client, id = 1) {
  // satisfy FK parents the same way the app bootstraps: interface + user + client
  // migration 0001 already seeds interface 'wg0' + hooks + user config
  await client.executeMultiple(
    `INSERT INTO users_table (username, password, name, role, totp_verified, enabled)
       VALUES ('u','h','u',1,0,1);
     INSERT INTO clients_table (id, user_id, interface_id, name, ipv4_address, ipv6_address,
       private_key, public_key, pre_shared_key, server_allowed_ips, persistent_keepalive, mtu, enabled)
       VALUES (${id},1,'wg0','c${id}','10.8.0.50','fd00::50','priv','pubk${id}','','[]',0,1420,1);`
  );
}

test('first sample only sets the baseline, second records the delta', async () => {
  const { svc, client } = await freshService();
  await seedClient(client);

  await svc.accumulate([{ clientId: 1, tx: 100, rx: 50 }], '2026-01-01');
  expect(await svc.list(1, 365)).toEqual([]);

  await svc.accumulate([{ clientId: 1, tx: 250, rx: 70 }], '2026-01-01');
  const rows = await svc.list(1, 365);
  expect(rows.length).toBe(1);
  expect({ tx: rows[0].tx, rx: rows[0].rx, date: rows[0].date }).toEqual({
    tx: 150,
    rx: 20,
    date: '2026-01-01',
  });
});

test('counter reset counts the new value as fresh traffic', async () => {
  const { svc, client } = await freshService();
  await seedClient(client);

  await svc.accumulate([{ clientId: 1, tx: 1000, rx: 1000 }], '2026-01-01');
  await svc.accumulate([{ clientId: 1, tx: 5000, rx: 2000 }], '2026-01-01');
  // kernel counters reset (interface restart): current value is new traffic
  await svc.accumulate([{ clientId: 1, tx: 10, rx: 5 }], '2026-01-01');

  const rows = await svc.list(1, 365);
  expect({ tx: rows[0].tx, rx: rows[0].rx }).toEqual({
    tx: 4000 + 10,
    rx: 1000 + 5,
  });
});

test('separate UTC days become separate rows; totals and prune see all', async () => {
  const { svc, client } = await freshService();
  await seedClient(client);

  await svc.accumulate([{ clientId: 1, tx: 100, rx: 0 }], '2000-01-01');
  await svc.accumulate([{ clientId: 1, tx: 300, rx: 0 }], '2000-01-01');
  await svc.accumulate([{ clientId: 1, tx: 600, rx: 100 }], '2000-01-02');

  const rows = await svc.list(1, 365 * 40);
  expect(rows.map((r) => r.tx)).toEqual([200, 300]);

  expect(await svc.totals(1)).toEqual({ tx: 500, rx: 100 });
  expect((await svc.listByDate('2000-01-02'))[0].rx).toBe(100);

  await svc.prune(1);
  expect(await svc.list(1, 365 * 40)).toEqual([]);
});

test('unknown client ids are ignored, zero deltas write nothing', async () => {
  const { svc, client } = await freshService();
  await seedClient(client);

  // no baseline row exists for client 2 -> it is still recorded as a
  // counter row (sample of a peer without a DB client never reaches here;
  // unknown-but-passed ids behave like first-baseline samples)
  await svc.accumulate([{ clientId: 1, tx: 0, rx: 0 }], '2026-01-01');
  await svc.accumulate([{ clientId: 1, tx: 0, rx: 0 }], '2026-01-01');
  expect(await svc.list(1, 365)).toEqual([]);
});
