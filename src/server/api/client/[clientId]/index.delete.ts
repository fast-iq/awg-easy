export default definePermissionEventHandler(
  'clients',
  'delete',
  async ({ event, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    await Database.clients.delete(client.id);
    await WireGuard.saveConfig();

    return { success: true };
  }
);
