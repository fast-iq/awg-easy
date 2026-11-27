import { GeneralUpdateSchema } from '#db/repositories/general/types';

export default definePermissionEventHandler(
  'admin',
  'any',
  async ({ event, user }) => {
    const data = await readValidatedBody(
      event,
      validateZod(GeneralUpdateSchema, event)
    );
    await Database.general.update(data);
    logAudit(event, user, 'admin.general_updated', '', {
      fields: Object.keys(data),
    });
    return { success: true };
  }
);
