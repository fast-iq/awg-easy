import { InterfaceCidrUpdateSchema } from '#db/repositories/interface/types';

export default definePermissionEventHandler(
  'admin',
  'any',
  async ({ event, user }) => {
    const data = await readValidatedBody(
      event,
      validateZod(InterfaceCidrUpdateSchema, event)
    );

    await Database.interfaces.updateCidr(data);
    await WireGuard.saveConfig();
    logAudit(event, user, 'admin.cidr_updated', '', {
      fields: Object.keys(data),
    });
    return { success: true };
  }
);
