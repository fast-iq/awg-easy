export default definePermissionEventHandler(
  'clients',
  'delete',
  async ({ event, user, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    await Database.clients.delete(client.id);
    await WireGuard.saveConfig();

    logAudit(event, user, 'client.deleted', client.name, {
      clientId: client.id,
    });

    return { success: true };
  }
);
