export default definePermissionEventHandler(
  'clients',
  'update',
  async ({ event, user, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    await Database.clients.toggle(client.id, false);
    await WireGuard.saveConfig();

    logAudit(event, user, 'client.disabled', client.name, {
      clientId: client.id,
    });

    return { success: true };
  }
);
