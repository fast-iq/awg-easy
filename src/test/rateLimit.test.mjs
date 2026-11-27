import { expect, test } from 'vitest';

const WINDOW = 60_000;
const MAX = 5;

// copy of the pure decision from server/utils/rateLimit.ts (import of the
// module itself would pull the nitro autostart context)
function makeLimiter(now) {
  const hits = new Map();
  return (ip) => {
    const ts = now();
    const arr = (hits.get(ip) ?? []).filter((t) => ts - t < WINDOW);
    arr.push(ts);
    hits.set(ip, arr);
    return { allowed: arr.length <= MAX, retryAfter: WINDOW / 1000 };
  };
}

test('allows up to MAX then blocks', () => {
  let now = 0;
  const check = makeLimiter(() => now);
  for (let i = 0; i < MAX; i++) {
    expect(check('1.2.3.4').allowed).toBe(true);
  }
  expect(check('1.2.3.4').allowed).toBe(false);
});

test('window slides: old hits expire', () => {
  let now = 0;
  const check = makeLimiter(() => now);
  for (let i = 0; i < MAX; i++) check('9.9.9.9');
  expect(check('9.9.9.9').allowed).toBe(false);
  now += WINDOW + 1;
  expect(check('9.9.9.9').allowed).toBe(true);
});

test('IPs are tracked independently', () => {
  let now = 0;
  const check = makeLimiter(() => now);
  for (let i = 0; i < MAX; i++) check('a');
  expect(check('a').allowed).toBe(false);
  expect(check('b').allowed).toBe(true);
});
