import { desc, eq, sql } from 'drizzle-orm';
import { auditLog } from './schema';
import type { AuditLogEntryType } from './types';
import type { DBType } from '#db/sqlite';

type NewAuditEntry = {
  userId: number | null;
  username: string;
  action: string;
  target?: string;
  details?: Record<string, unknown> | null;
  ip?: string;
};

function createPreparedStatement(db: DBType) {
  return {
    insert: db
      .insert(auditLog)
      .values({
        userId: sql.placeholder('userId'),
        username: sql.placeholder('username'),
        action: sql.placeholder('action'),
        target: sql.placeholder('target'),
        details: sql.placeholder('details'),
        ip: sql.placeholder('ip'),
      })
      .prepare(),
    list: db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.id))
      .limit(sql.placeholder('limit'))
      .offset(sql.placeholder('offset'))
      .prepare(),
    listByAction: db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, sql.placeholder('action')))
      .orderBy(desc(auditLog.id))
      .limit(sql.placeholder('limit'))
      .offset(sql.placeholder('offset'))
      .prepare(),
  };
}

export class AuditService {
  #statements: ReturnType<typeof createPreparedStatement>;
  #db: DBType;

  constructor(db: DBType) {
    this.#statements = createPreparedStatement(db);
    this.#db = db;
  }

  async create(entry: NewAuditEntry) {
    await this.#statements.insert.execute({
      userId: entry.userId,
      username: entry.username,
      action: entry.action,
      target: entry.target ?? '',
      details: entry.details ?? null,
      ip: entry.ip ?? '',
    });
  }

  async list(opts: { limit: number; offset: number; action?: string }) {
    if (opts.action) {
      return (await this.#statements.listByAction.execute({
        action: opts.action,
        limit: opts.limit,
        offset: opts.offset,
      })) as AuditLogEntryType[];
    }
    return (await this.#statements.list.execute({
      limit: opts.limit,
      offset: opts.offset,
    })) as AuditLogEntryType[];
  }

  /** keep the table bounded; audit is operational, not archival */
  async prune(days: number) {
    const safeDays = Math.max(1, Math.trunc(days));
    await this.#db
      .delete(auditLog)
      .where(
        sql`${auditLog.ts} < datetime('now', '-' || ${safeDays} || ' day')`
      );
  }
}
