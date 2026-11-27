/**
 * Audit actions — shared between server (recording) and UI (filtering).
 * Keep in sync with audit calls in server/api/**.
 */
export const AUDIT_ACTIONS = [
  'login',
  'login_failed',
  'logout',
  'client.created',
  'client.updated',
  'client.deleted',
  'client.enabled',
  'client.disabled',
  'client.otp_link_created',
  'user.created',
  'user.updated',
  'user.deleted',
  'user.password_changed',
  'user.totp_enabled',
  'user.totp_disabled',
  'admin.general_updated',
  'admin.interface_updated',
  'admin.interface_restarted',
  'admin.cidr_updated',
  'admin.hooks_updated',
  'admin.config_updated',
  'admin.backup_exported',
  'admin.migration_imported',
  'monitor.block_status_changed',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditLogEntryType = {
  id: number;
  ts: string;
  userId: number | null;
  username: string;
  action: string;
  target: string;
  details: Record<string, unknown> | null;
  ip: string;
};
