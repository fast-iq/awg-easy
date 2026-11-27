export default definePermissionEventHandler(
  'users',
  'delete',
  async ({ event, user }) => {
    const { userId } = await getValidatedRouterParams(
      event,
      validateZod(UserAdminIdSchema, event)
    );

    const target = await Database.users.get(userId);
    if (!target) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' });
    }

    if (target.id === user.id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot delete yourself',
      });
    }

    if (
      target.role === roles.ADMIN &&
      (await Database.users.countActiveAdmins(target.id)) === 0
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot delete the last active admin',
      });
    }

    const clients = await Database.clients.getForUser(target.id);
    if (clients.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: `User still owns ${clients.length} client(s). Delete or reassign them first.`,
      });
    }

    await Database.users.delete(target.id);

    logAudit(event, user, 'user.deleted', target.username, { userId });

    return { success: true };
  }
);
