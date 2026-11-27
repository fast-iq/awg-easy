export default definePermissionEventHandler(
  'clients',
  'update',
  async ({ event, user, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    await Database.oneTimeLinks.generate(client.id);

    logAudit(event, user, 'client.otp_link_created', client.name, {
      clientId: client.id,
    });

    return { success: true };
  }
);
