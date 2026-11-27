// Force an immediate registry block check (bypasses the daily gate).
export default definePermissionEventHandler('admin', 'any', async () => {
  return await runBlockMonitorCheck(true);
});
