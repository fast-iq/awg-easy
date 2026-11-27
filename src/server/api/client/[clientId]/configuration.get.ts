export default definePermissionEventHandler(
  'clients',
  'view',
  async ({ event, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    const config = await WireGuard.getClientConfiguration({
      clientId: client.id,
    });

    setHeader(
      event,
      'Content-Disposition',
      `attachment; filename="${WireGuard.cleanClientFilename(client.name) || client.id}.conf"`
    );

    setHeader(event, 'Content-Type', 'text/plain');
    return config;
  }
);
