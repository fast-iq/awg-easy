import { expect, test } from 'vitest';
import isCidr from 'is-cidr';

// mirrors isValidRouteTarget from server/utils/types.ts (kept in sync manually:
// importing it directly would pull the whole nitro auto-import context)
const BLOCKED = new Set(['0.0.0.0/0', '::/0']);
const isValidRouteTarget = (v) =>
  !BLOCKED.has(v) && (isCidr(v) !== 0 || isCidr(`${v}/32`) !== 0);

test('accepts valid IPv4 CIDR and bare addresses', () => {
  expect(isValidRouteTarget('192.168.77.0/24')).toBe(true);
  expect(isValidRouteTarget('10.8.0.0/24')).toBe(true);
  expect(isValidRouteTarget('192.168.1.50')).toBe(true);
});

test('accepts valid IPv6', () => {
  expect(isValidRouteTarget('fdcc:ad94:bacf:61a4::cafe:0/112')).toBe(true);
  expect(isValidRouteTarget('fd00::1')).toBe(true);
});

test('blocks default routes', () => {
  expect(isValidRouteTarget('0.0.0.0/0')).toBe(false);
  expect(isValidRouteTarget('::/0')).toBe(false);
});

test('rejects garbage (would break `ip route` shell command)', () => {
  expect(isValidRouteTarget('999.1.1.1')).toBe(false);
  expect(isValidRouteTarget('192.168.1.')).toBe(false);
  expect(isValidRouteTarget('192.168.1.0/99')).toBe(false);
  expect(isValidRouteTarget('abc')).toBe(false);
  expect(isValidRouteTarget('')).toBe(false);
  expect(isValidRouteTarget('10.0.0.0/8; rm -rf /')).toBe(false);
});
