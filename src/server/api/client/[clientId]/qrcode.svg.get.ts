export default definePermissionEventHandler(
  'clients',
  'view',
  async ({ event, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    const svg = await WireGuard.getClientQRCodeSVG({ clientId: client.id });

    setHeader(event, 'Content-Type', 'image/svg+xml');
    return svg;
  }
);
