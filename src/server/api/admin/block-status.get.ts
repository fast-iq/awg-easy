export default definePermissionEventHandler(
  'admin',
  'any',
  async () => await Database.general.getBlockMonitor()
);
