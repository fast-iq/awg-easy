import type { ZodSchema } from 'zod';
import z from 'zod';
import type { H3Event, EventHandlerRequest } from 'h3';
import isCidr from 'is-cidr';
import { roles } from '#shared/utils/permissions';

export type ID = number;

/**
 * return the string as is
 *
 * used for i18n ally
 */
export const t = (v: string) => v;

export const safeStringRefine = z
  .string()
  .refine(
    (v) => v !== '__proto__' && v !== 'constructor' && v !== 'prototype',
    { message: t('zod.stringMalformed') }
  );

/**
 * Default routes must never be delegated to a single peer.
 */
const BLOCKED_ROUTE_TARGETS = new Set(['0.0.0.0/0', '::/0']);

/**
 * Accepts a CIDR block or a bare IPv4/IPv6 address — both are valid
 * WireGuard AllowedIPs / `ip route` targets. Used for Server Allowed IPs,
 * which end up in shell commands (`ip route replace`), so it must be strict.
 */
export const isValidRouteTarget = (v: string): boolean =>
  !BLOCKED_ROUTE_TARGETS.has(v) && (isCidr(v) !== 0 || isCidr(`${v}/32`) !== 0);

/**
 * WireGuard public/private key: 32 bytes base64 (44 chars ending with '=')
 */
export const WireGuardKeySchema = z
  .string({ message: t('zod.stringMalformed') })
  .regex(/^[A-Za-z0-9+/]{43}=$/, t('zod.stringMalformed'));

export const EnabledSchema = z.boolean({ message: t('zod.enabled') });

export const MtuSchema = z
  .number({ message: t('zod.mtu') })
  // min for IPv6 is 1280, but we allow lower for IPv4
  .min(1024, { message: t('zod.mtu') })
  .max(9000, { message: t('zod.mtu') });

export const PortSchema = z
  .number({ message: t('zod.port') })
  .min(1, { message: t('zod.port') })
  .max(65535, { message: t('zod.port') });

export const PersistentKeepaliveSchema = z
  .number({ message: t('zod.persistentKeepalive') })
  .min(0, t('zod.persistentKeepalive'))
  .max(65535, t('zod.persistentKeepalive'));

export const AddressSchema = z
  .string({ message: t('zod.address') })
  .min(1, { message: t('zod.address') })
  .pipe(safeStringRefine);

export const DnsSchema = z.array(AddressSchema, { message: t('zod.dns') });

export const AllowedIpsSchema = z
  .array(AddressSchema, { message: t('zod.allowedIps') })
  .min(1, { message: t('zod.allowedIps') });

export const FileSchema = z.object({
  file: z.string({ message: t('zod.file') }),
});

export const HookSchema = z
  .string({ message: t('zod.hook') })
  .pipe(safeStringRefine);

export const schemaForType =
  <T>() =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <S extends z.ZodType<T, any, any>>(arg: S) => {
    return arg;
  };

export function validateZod<T>(
  schema: ZodSchema<T>,
  event: H3Event<EventHandlerRequest>
) {
  return async (data: unknown) => {
    try {
      return await schema.parseAsync(data);
    } catch (error) {
      let message = 'Unexpected Error';
      if (error instanceof z.ZodError) {
        try {
          const t = await useTranslation(event);

          message = error.issues
            .map((v) => {
              let m = v.message;

              if (t) {
                let newMessage = null;
                if (v.message.startsWith('zod.')) {
                  switch (v.code) {
                    case 'too_small':
                      switch (v.origin) {
                        case 'string':
                          newMessage = t('zod.generic.stringMin', [
                            t(v.message),
                            v.minimum,
                          ]);
                          break;
                        case 'number':
                          newMessage = t('zod.generic.numberMin', [
                            t(v.message),
                            v.minimum,
                          ]);
                          break;
                      }
                      break;
                    case 'invalid_type': {
                      if (v.input === null || v.input === undefined) {
                        newMessage = t('zod.generic.required', [
                          v.path.join('.'),
                        ]);
                      } else {
                        switch (v.expected) {
                          case 'string':
                            newMessage = t('zod.generic.validString', [
                              t(v.message),
                            ]);
                            break;
                          case 'boolean':
                            newMessage = t('zod.generic.validBoolean', [
                              t(v.message),
                            ]);
                            break;
                          case 'number':
                            newMessage = t('zod.generic.validNumber', [
                              t(v.message),
                            ]);
                            break;
                          case 'array':
                            newMessage = t('zod.generic.validArray', [
                              t(v.message),
                            ]);
                            break;
                        }
                      }
                      break;
                    }
                  }
                }
                if (newMessage) {
                  m = newMessage;
                } else {
                  m = t(v.message);
                }
              }

              return m;
            })
            .join('; ');
        } catch {
          message = error.issues
            .map((v) => {
              const path = v.path.join('.') || 'form';
              if (v.code === 'too_small') {
                return `${path}: ${v.message} (min ${v.minimum})`;
              }
              if (v.code === 'invalid_type') {
                return v.input === null || v.input === undefined
                  ? `${path}: ${v.message} (required)`
                  : `${path}: ${v.message} (expected ${v.expected})`;
              }
              return `${path}: ${v.message}`;
            })
            .join('; ');
        }
        console.warn(`Validation failed (${event.path}): ${message}`);
      } else if (error instanceof Error) {
        message = `${message}: ${error.message}`;
        console.error(`Validation failed (${event.path}): ${message}`);
      }
      const err = new Error(message);
      if (error instanceof Error) {
        err.cause = error;
      }
      throw err;
    }
  };
}

/**
 * exhaustive check
 */
export function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}

const adminUsername = z
  .string({ message: t('zod.user.username') })
  .min(2, t('zod.user.username'))
  .pipe(safeStringRefine);

const adminPassword = z
  .string({ message: t('zod.user.password') })
  .min(10, t('zod.user.password'))
  .pipe(safeStringRefine);

const adminName = z
  .string({ message: t('zod.user.name') })
  .min(1, t('zod.user.name'))
  .pipe(safeStringRefine);

const adminEmail = z
  .string({ message: t('zod.user.email') })
  .min(5, t('zod.user.email'))
  .email({ message: t('zod.user.emailInvalid') })
  .pipe(safeStringRefine)
  .nullable();

const adminRole = z.union([z.literal(roles.ADMIN), z.literal(roles.CLIENT)], {
  message: t('zod.user.role'),
});

export const UserAdminIdSchema = z.object({
  userId: z.coerce.number({ message: t('zod.user.id') }),
});

export const UserAdminCreateSchema = z.object({
  username: adminUsername,
  password: adminPassword,
  role: adminRole,
});

export const UserAdminUpdateSchema = z.object({
  name: adminName,
  email: adminEmail,
  role: adminRole,
  enabled: EnabledSchema,
  // optional: absent or empty string means "keep current password"
  password: adminPassword.optional().or(z.literal('')),
});
