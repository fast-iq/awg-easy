import { ClientUpdateSchema } from '#db/repositories/client/types';

export default definePermissionEventHandler(
  'clients',
  'update',
  async ({ event, user, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    const data = await readValidatedBody(
      event,
      validateZod(ClientUpdateSchema, event)
    );

    await Database.clients.update(client.id, data);
    await WireGuard.saveConfig();

    logAudit(event, user, 'client.updated', client.name, {
      clientId: client.id,
      fields: Object.keys(data),
    });

    return { success: true };
  }
);
