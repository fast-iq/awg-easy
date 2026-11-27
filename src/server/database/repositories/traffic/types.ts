import { z } from 'zod';

import type { trafficDaily } from './schema';

export type TrafficDayType = typeof trafficDaily.$inferSelect;

export const TrafficQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
