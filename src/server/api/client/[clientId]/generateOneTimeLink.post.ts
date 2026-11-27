export default definePermissionEventHandler(
  'clients',
  'update',
  async ({ event, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    await Database.oneTimeLinks.generate(client.id);

    return { success: true };
  }
);
