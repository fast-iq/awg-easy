export default definePermissionEventHandler(
  'admin',
  'any',
  async ({ event, user }) => {
    await WireGuard.Restart();

    logAudit(event, user, 'admin.interface_restarted');
    return { success: true };
  }
);
