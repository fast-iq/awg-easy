import { sql } from 'drizzle-orm';
import { sqliteTable, text, int } from 'drizzle-orm/sqlite-core';

export const general = sqliteTable('general_table', {
  id: int().primaryKey({ autoIncrement: false }).default(1),

  setupStep: int('setup_step').notNull(),

  sessionPassword: text('session_password').notNull(),
  sessionTimeout: int('session_timeout').notNull(),

  metricsPrometheus: int('metrics_prometheus', { mode: 'boolean' }).notNull(),
  metricsJson: int('metrics_json', { mode: 'boolean' }).notNull(),
  metricsPassword: text('metrics_password'),

  // cron: delete expired clients instead of only disabling them
  autoDeleteExpiredClients: int('auto_delete_expired_clients', {
    mode: 'boolean',
  })
    .notNull()
    .default(false),

  // registry block-monitor status (written by server/utils/blockMonitor only)
  blockMonitor: text('block_monitor', { mode: 'json' }).$type<
    import('#shared/utils/blockrisk').BlockStatusType | null
  >(),

  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`)
    .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});
