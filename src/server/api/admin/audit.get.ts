import { z } from 'zod';
import { AUDIT_ACTIONS } from '#shared/utils/audit';

const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(80),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.enum(AUDIT_ACTIONS).optional(),
});

export default definePermissionEventHandler(
  'admin',
  'any',
  async ({ event }) => {
    const { limit, offset, action } = await getValidatedQuery(
      event,
      validateZod(AuditQuerySchema, event)
    );

    return Database.audit.list({ limit, offset, action });
  }
);
