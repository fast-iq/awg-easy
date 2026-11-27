import { ClientUpdateSchema } from '#db/repositories/client/types';

export default definePermissionEventHandler(
  'clients',
  'update',
  async ({ event, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    const data = await readValidatedBody(
      event,
      validateZod(ClientUpdateSchema, event)
    );

    await Database.clients.update(client.id, data);
    await WireGuard.saveConfig();

    return { success: true };
  }
);
