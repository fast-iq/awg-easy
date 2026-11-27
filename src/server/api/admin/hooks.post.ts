import { HooksUpdateSchema } from '#db/repositories/hooks/types';

export default definePermissionEventHandler(
  'admin',
  'any',
  async ({ event, user }) => {
    const data = await readValidatedBody(
      event,
      validateZod(HooksUpdateSchema, event)
    );
    await Database.hooks.update(data);
    await WireGuard.saveConfig();
    logAudit(event, user, 'admin.hooks_updated');
    return { success: true };
  }
);
