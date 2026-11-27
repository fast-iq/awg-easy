import type { H3Event } from 'h3';
import type { UserType } from '#db/repositories/user/types';

/**
 * Record an audit entry. Fire-and-forget by design: an audit write failure
 * must never break or leak into the primary operation (priority: keep the
 * app working). Errors are surfaced in the server log instead.
 *
 * Prefer calling AFTER the operation succeeded (so failures are not logged
 * as performed); login_failed is intentionally logged on failure paths.
 */
export function logAudit(
  event: H3Event,
  user: Pick<UserType, 'id' | 'username'> | null,
  action: string,
  target = '',
  details?: Record<string, unknown> | null
) {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? '';
  void Database.audit
    .create({
      userId: user?.id ?? null,
      username: user?.username ?? 'anonymous',
      action,
      target,
      details: details ?? null,
      ip,
    })
    .catch((err: unknown) => {
      console.warn(`Audit write failed (${action}):`, err);
    });
}
