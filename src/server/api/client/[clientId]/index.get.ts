export default definePermissionEventHandler(
  'clients',
  'view',
  async ({ event, checkPermissions }) => {
    const result = await getAuthorizedClient(event, checkPermissions);

    // data can be undefined if the client is disabled
    const data = await WireGuard.dumpByPublicKey(result.publicKey);
    if (!data) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to dump client data',
      });
    }

    return {
      ...result,
      endpoint: data.endpoint,
    };
  }
);
