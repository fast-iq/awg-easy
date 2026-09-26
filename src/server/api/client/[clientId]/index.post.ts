import {
  ClientGetSchema,
  ClientUpdateSchema,
} from '#db/repositories/client/types';

export default definePermissionEventHandler(
  'clients',
  'update',
  async ({ event, checkPermissions }) => {
    const { clientId } = await getValidatedRouterParams(
      event,
      validateZod(ClientGetSchema, event)
    );

    const data = await readValidatedBody(
      event,
      validateZod(ClientUpdateSchema, event)
    );

    const client = await Database.clients.get(clientId);

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found',
      });
    }

    checkPermissions(client);

    await Database.clients.update(clientId, data);
    await WireGuard.saveConfig();

    return { success: true };
  }
);
