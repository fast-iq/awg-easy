/**
 * Simple in-memory sliding-window rate limiter, keyed by IP.
 * Good enough for a single-instance VPN admin panel (no Redis needed).
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Max requests allowed within the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  /** Seconds until a slot frees up (only meaningful when limited) */
  retryAfterSec: number;
}

function prune(key: string, now: number, windowMs: number) {
  const bucket = buckets.get(key);
  if (!bucket) return;
  const cutoff = now - windowMs;
  // drop timestamps outside the window
  while (bucket.timestamps.length > 0 && bucket.timestamps[0]! <= cutoff) {
    bucket.timestamps.shift();
  }
  if (bucket.timestamps.length === 0) {
    buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  prune(key, now, windowMs);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0]!;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + windowMs - now) / 1000)
    );
    return { limited: true, remaining: 0, retryAfterSec };
  }

  bucket.timestamps.push(now);
  return {
    limited: false,
    remaining: limit - bucket.timestamps.length,
    retryAfterSec: 0,
  };
}

/** Periodically drop stale buckets so the map doesn't grow unbounded. */
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    const oldest = bucket.timestamps[0];
    if (oldest === undefined || oldest <= now - CLEANUP_INTERVAL_MS) {
      buckets.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();
