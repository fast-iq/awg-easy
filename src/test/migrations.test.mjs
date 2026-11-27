// Runs every migration SQL against a fresh temp SQLite DB.
// 0002 must contain ONLY the new ALTER — drizzle-kit regenerates AWG column
// ALTERs (meta snapshots lag the manually edited 0000_short_skin.sql), which
// would crash `migrate()` on a live DB with duplicate-column errors.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const MIGRATIONS_DIR = new URL(
  '../server/database/migrations/',
  import.meta.url
);

const files = [
  '0000_short_skin.sql',
  '0001_classy_the_stranger.sql',
  '0002_cooing_the_anarchist.sql',
  '0003_big_purple_man.sql',
];

function applyAll() {
  const db = new DatabaseSync(':memory:');
  for (const file of files) {
    const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed) db.exec(trimmed);
    }
  }
  return db;
}

test('all migrations apply cleanly to a fresh database', () => {
  const db = applyAll();
  expect(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all()
      .map((r) => r.name)
  ).toEqual(
    expect.arrayContaining([
      'clients_table',
      'general_table',
      'hooks_table',
      'interfaces_table',
      'one_time_links_table',
      'user_configs_table',
      'users_table',
    ])
  );
  db.close();
});

test('0002 adds auto_delete_expired_clients default false', () => {
  const db = applyAll();
  const cols = db.prepare('PRAGMA table_info(general_table)').all();
  expect(cols.map((c) => c.name)).toContain('auto_delete_expired_clients');
  db.exec(
    "INSERT INTO general_table (setup_step, session_password, session_timeout, metrics_prometheus, metrics_json) VALUES (1, 'x', 3600, 0, 0)"
  );
  const row = db
    .prepare('SELECT auto_delete_expired_clients AS v FROM general_table')
    .get();
  expect(Number(row.v)).toBe(0);
  db.close();
});

test('AWG columns exist without 0002 re-adding them', () => {
  const db = applyAll();
  const cols = db
    .prepare('PRAGMA table_info(interfaces_table)')
    .all()
    .map((c) => c.name);
  for (const c of [
    'jc',
    'jmin',
    'jmax',
    's1',
    's2',
    's3',
    's4',
    'h1',
    'h2',
    'h3',
    'h4',
    'i1',
    'i2',
    'i3',
    'i4',
    'i5',
    'j1',
    'j2',
    'j3',
    'itime',
  ]) {
    expect(cols).toContain(c);
  }
  db.close();
});

test('migrations are idempotent-safe to read (journal lists all three)', () => {
  const journal = JSON.parse(
    readFileSync(new URL('meta/_journal.json', MIGRATIONS_DIR), 'utf8')
  );
  expect(journal.entries.map((e) => e.tag)).toEqual(
    files.map((f) => f.replace('.sql', ''))
  );
});
