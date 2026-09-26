import { ClientCreateSchema } from '#db/repositories/client/types';

export default definePermissionEventHandler(
  'clients',
  'create',
  async ({ event, user }) => {
    const { name, expiresAt } = await readValidatedBody(
      event,
      validateZod(ClientCreateSchema, event)
    );

    const result = await Database.clients.create({
      name,
      expiresAt,
      userId: user.id,
    });
    await WireGuard.saveConfig();

    const clientId = result[0]!.clientId;
    return { success: true, clientId };
  }
);
