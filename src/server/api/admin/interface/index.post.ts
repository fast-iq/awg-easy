import { InterfaceUpdateSchema } from '#db/repositories/interface/types';

export default definePermissionEventHandler(
  'admin',
  'any',
  async ({ event, user }) => {
    const data = await readValidatedBody(
      event,
      validateZod(InterfaceUpdateSchema, event)
    );
    await Database.interfaces.update(data);
    await WireGuard.saveConfig();
    logAudit(event, user, 'admin.interface_updated', '', {
      fields: Object.keys(data),
    });
    return { success: true };
  }
);
