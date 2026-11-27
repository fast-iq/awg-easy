export default definePermissionEventHandler(
  'clients',
  'update',
  async ({ event, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    await Database.clients.toggle(client.id, false);
    await WireGuard.saveConfig();

    return { success: true };
  }
);
