import { UserConfigUpdateSchema } from '#db/repositories/userConfig/types';

export default definePermissionEventHandler(
  'admin',
  'any',
  async ({ event, user }) => {
    const data = await readValidatedBody(
      event,
      validateZod(UserConfigUpdateSchema, event)
    );
    await Database.userConfigs.update(data);
    await WireGuard.saveConfig();
    logAudit(event, user, 'admin.config_updated', '', {
      fields: Object.keys(data),
    });
    return { success: true };
  }
);
