import { and, eq, gt, inArray, sql } from 'drizzle-orm';

import { trafficCounter, trafficDaily } from './schema';
import type { TrafficDayType } from './types';
import type { DBType } from '#db/sqlite';

/** UTC 'YYYY-MM-DD' cutoff `days` back from now (ISO strings sort lexically) */
function cutoff(days: number) {
  const safeDays = Math.max(1, Math.trunc(days));
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export class TrafficService {
  #db: DBType;

  constructor(db: DBType) {
    this.#db = db;
  }

  /**
   * Accumulate per-minute kernel counter samples into daily totals.
   *
   * WireGuard counters are cumulative since the peer was (re)added, so the
   * delta against the previously stored counter is what actually moved since
   * the last sample. A counter *below* the stored baseline means the kernel
   * counters were reset (interface restart / peer removal) — in that case the
   * current value itself is the new traffic. First-ever sample only sets the
   * baseline (delta against an unknown start would be meaningless).
   */
  async accumulate(
    samples: { clientId: number; tx: number; rx: number }[],
    date: string
  ) {
    if (samples.length === 0) return;

    const previous = await this.#db
      .select()
      .from(trafficCounter)
      .where(
        inArray(
          trafficCounter.clientId,
          samples.map((s) => s.clientId)
        )
      );
    const previousMap = new Map(previous.map((p) => [p.clientId, p]));

    for (const sample of samples) {
      if (!Number.isFinite(sample.tx) || !Number.isFinite(sample.rx)) {
        continue;
      }

      const prev = previousMap.get(sample.clientId);
      let dtx = 0;
      let drx = 0;
      if (prev !== undefined) {
        dtx = sample.tx >= prev.tx ? sample.tx - prev.tx : sample.tx;
        drx = sample.rx >= prev.rx ? sample.rx - prev.rx : sample.rx;
      }

      await this.#db
        .insert(trafficCounter)
        .values({ clientId: sample.clientId, tx: sample.tx, rx: sample.rx })
        .onConflictDoUpdate({
          target: trafficCounter.clientId,
          set: { tx: sample.tx, rx: sample.rx },
        });

      if (dtx > 0 || drx > 0) {
        await this.#db
          .insert(trafficDaily)
          .values({ clientId: sample.clientId, date, tx: dtx, rx: drx })
          .onConflictDoUpdate({
            target: [trafficDaily.clientId, trafficDaily.date],
            set: {
              tx: sql`${trafficDaily.tx} + ${dtx}`,
              rx: sql`${trafficDaily.rx} + ${drx}`,
            },
          });
      }
    }
  }

  /** daily rows for one client, ascending, limited to the last `days` */
  async list(clientId: number, days: number): Promise<TrafficDayType[]> {
    return await this.#db
      .select()
      .from(trafficDaily)
      .where(
        and(
          eq(trafficDaily.clientId, clientId),
          gt(trafficDaily.date, cutoff(days))
        )
      )
      .orderBy(trafficDaily.date);
  }

  /** sum over ALL retained history for one client */
  async totals(clientId: number) {
    const rows = await this.#db
      .select({
        tx: sql`coalesce(sum(${trafficDaily.tx}), 0)`,
        rx: sql`coalesce(sum(${trafficDaily.rx}), 0)`,
      })
      .from(trafficDaily)
      .where(eq(trafficDaily.clientId, clientId));
    const row = rows[0];
    return { tx: Number(row?.tx ?? 0), rx: Number(row?.rx ?? 0) };
  }

  /** every row for one UTC day (dashboard "today" badges) */
  async listByDate(date: string): Promise<TrafficDayType[]> {
    return await this.#db
      .select()
      .from(trafficDaily)
      .where(eq(trafficDaily.date, date));
  }

  /** keep history bounded; day rows are tiny but unbounded is unbounded */
  async prune(days: number) {
    await this.#db
      .delete(trafficDaily)
      .where(sql`${trafficDaily.date} < ${cutoff(days)}`);
  }
}
