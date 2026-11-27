// Audit log table: schema smoke test + retention (prune) semantics,
// mirroring AuditService SQL against the real migration 0003.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const MIG = new URL('../server/database/migrations/', import.meta.url);

function freshDb() {
  const db = new DatabaseSync(':memory:');
  const sql = readFileSync(new URL('0003_big_purple_man.sql', MIG), 'utf8');
  db.exec(sql);
  return db;
}

test('audit_log_table accepts a typical entry and lists newest first', () => {
  const db = freshDb();
  const ins = db.prepare(
    `INSERT INTO audit_log_table (user_id, username, action, target, details, ip)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  ins.run(1, 'admin', 'client.created', 'laptop', '{"clientId":7}', '1.2.3.4');
  ins.run(null, 'anonymous', 'login_failed', 'admin', null, '9.9.9.9');

  const rows = db
    .prepare('SELECT * FROM audit_log_table ORDER BY ts DESC, id DESC')
    .all();
  expect(rows.length).toBe(2);
  expect(rows[0].username).toBe('anonymous');
  expect(rows[0].details).toBeNull();
  expect(rows[1].action).toBe('client.created');
});

test('prune deletes only rows older than the retention cutoff', () => {
  const db = freshDb();
  const ins = db.prepare(
    `INSERT INTO audit_log_table (username, action, ts) VALUES (?, ?, ?)`
  );
  ins.run('admin', 'login', '2000-01-01 00:00:00'); // ancient
  ins.run('admin', 'login', '2999-01-01 00:00:00'); // future, kept

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  db.prepare('DELETE FROM audit_log_table WHERE ts < ?').run(cutoff);

  const rows = db
    .prepare('SELECT username, action, ts FROM audit_log_table')
    .all();
  expect(rows.length).toBe(1);
  expect(rows[0].ts).toBe('2999-01-01 00:00:00');
});
