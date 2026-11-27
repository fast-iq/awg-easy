export default definePermissionEventHandler('users', 'view', async () => {
  const users = await Database.users.getAll();

  // never expose password hashes or TOTP secrets; add owned client count
  return Promise.all(
    users.map(async ({ password: _password, totpKey: _totpKey, ...safe }) => ({
      ...safe,
      clientCount: (await Database.clients.getForUser(safe.id)).length,
    }))
  );
});
