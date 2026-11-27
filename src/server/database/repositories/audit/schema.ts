import { sql } from 'drizzle-orm';
import { index, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Audit trail of administrative/security events.
 *
 * Deliberately denormalised: `username` is a snapshot and `userId` has no
 * foreign key, so the history survives user deletion. Rows are append-only —
 * nothing in the app updates them; retention is a plain time cutoff.
 */
export const auditLog = sqliteTable(
  'audit_log_table',
  {
    id: int().primaryKey({ autoIncrement: true }),
    ts: text()
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    userId: int('user_id'),
    username: text().notNull(),
    /** one of AuditAction (shared/utils/audit) */
    action: text().notNull(),
    /** short human-readable subject, e.g. client name or target user name */
    target: text().notNull().default(''),
    /** extra structured context (ids, changed fields); JSON */
    details: text({ mode: 'json' }).$type<Record<string, unknown> | null>(),
    ip: text().notNull().default(''),
  },
  (table) => [
    index('audit_log_ts_idx').on(table.ts),
    index('audit_log_action_idx').on(table.action),
  ]
);
