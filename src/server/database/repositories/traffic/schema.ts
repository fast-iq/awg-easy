import {
  index,
  int,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

import { client } from '../client/schema';

/**
 * Per-client per-UTC-day traffic totals, accumulated by the cron job from
 * kernel counter deltas. `tx`/`rx` follow the `wg show dump` column names,
 * same as the live `transferTx`/`transferRx` fields in the UI.
 */
export const trafficDaily = sqliteTable(
  'traffic_daily_table',
  {
    clientId: int('client_id')
      .notNull()
      .references(() => client.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    /** UTC calendar day, 'YYYY-MM-DD' */
    date: text().notNull(),
    tx: int().notNull().default(0),
    rx: int().notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.clientId, table.date] }),
    index('traffic_daily_date_idx').on(table.date),
  ]
);

/**
 * Last-seen cumulative kernel counters per client. Kept separate from
 * traffic_daily because sampling is only correct against the immediately
 * previous sample, and the baseline must survive container restarts.
 */
export const trafficCounter = sqliteTable('traffic_counter_table', {
  clientId: int('client_id')
    .primaryKey()
    .references(() => client.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),
  tx: int().notNull(),
  rx: int().notNull(),
});
