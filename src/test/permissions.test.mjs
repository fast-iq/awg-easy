import { expect, test } from 'vitest';
import {
  roles,
  hasPermissions,
  hasPermissionsWithData,
} from '../shared/utils/permissions.js';

const admin = { id: 1, role: roles.ADMIN };
const client1 = { id: 2, role: roles.CLIENT };
const client2 = { id: 3, role: roles.CLIENT };

const own = { id: 10, userId: 2 };
const foreign = { id: 11, userId: 3 };

test('admin has full access to clients', () => {
  for (const action of ['view', 'create', 'update', 'delete', 'custom']) {
    expect(hasPermissions(admin, 'clients', action, own)).toBe(true);
    expect(hasPermissions(admin, 'clients', action, foreign)).toBe(true);
  }
  expect(hasPermissions(admin, 'admin', 'any')).toBe(true);
});

test('client role only accesses own clients', () => {
  expect(hasPermissions(client1, 'clients', 'view', own)).toBe(true);
  expect(hasPermissions(client1, 'clients', 'update', own)).toBe(true);
  expect(hasPermissions(client1, 'clients', 'delete', own)).toBe(true);
  expect(hasPermissions(client1, 'clients', 'view', foreign)).toBe(false);
  expect(hasPermissions(client1, 'clients', 'update', foreign)).toBe(false);
  expect(hasPermissions(client1, 'clients', 'delete', foreign)).toBe(false);
  expect(hasPermissions(client1, 'clients', 'create', own)).toBe(false);
  expect(hasPermissions(client1, 'admin', 'any')).toBe(false);
});

test('me resource: only self-update', () => {
  expect(hasPermissions(client1, 'me', 'update', client1)).toBe(true);
  expect(hasPermissions(admin, 'me', 'update', admin)).toBe(true);
  // `me` is self-only even for an admin (admin panel uses the users resource)
  expect(hasPermissions(admin, 'me', 'update', client1)).toBe(false);
  expect(hasPermissions(client1, 'me', 'update', client2)).toBe(false);
});

test('users resource is admin-only', () => {
  for (const action of ['view', 'create', 'update', 'delete']) {
    expect(hasPermissions(admin, 'users', action)).toBe(true);
    expect(hasPermissions(client1, 'users', action)).toBe(false);
  }
});

test('hasPermissionsWithData enforces that check() ran', () => {
  const denied = hasPermissionsWithData(client1, 'clients', 'view');
  expect(() => denied.check(foreign)).toThrow('Permission denied');
  // boolean permission: checked by the wrapper before handler runs
  const boolean = hasPermissionsWithData(client1, 'admin', 'any');
  expect(boolean.isBoolean()).toBe(true);
  expect(() => boolean.check()).toThrow('Permission denied');
});
