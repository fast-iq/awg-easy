export default definePermissionEventHandler(
  'clients',
  'update',
  async ({ event, user, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    await Database.clients.toggle(client.id, true);
    await WireGuard.saveConfig();

    logAudit(event, user, 'client.enabled', client.name, {
      clientId: client.id,
    });

    return { success: true };
  }
);
