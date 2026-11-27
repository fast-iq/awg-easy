export default definePermissionEventHandler(
  'users',
  'update',
  async ({ event, user }) => {
    const { userId } = await getValidatedRouterParams(
      event,
      validateZod(UserAdminIdSchema, event)
    );

    const data = await readValidatedBody(
      event,
      validateZod(UserAdminUpdateSchema, event)
    );

    const target = await Database.users.get(userId);
    if (!target) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' });
    }

    // never allow removing the last active admin via role change or disable
    const losesAdminPower =
      target.role === roles.ADMIN &&
      target.enabled &&
      (data.role !== roles.ADMIN || !data.enabled);

    if (
      losesAdminPower &&
      (await Database.users.countActiveAdmins(userId)) === 0
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot demote or disable the last active admin',
      });
    }

    await Database.users.update(userId, data.name, data.email);

    if (data.role !== target.role) {
      await Database.users.updateRole(userId, data.role);
    }

    if (data.enabled !== target.enabled) {
      await Database.users.toggle(userId, data.enabled);
    }

    if (data.password) {
      await Database.users.setPassword(userId, data.password);
    }

    logAudit(event, user, 'user.updated', target.username, {
      userId,
      fields: [
        'name',
        'email',
        ...(data.role !== target.role ? ['role'] : []),
        ...(data.enabled !== target.enabled ? ['enabled'] : []),
        ...(data.password ? ['password'] : []),
      ],
    });

    return { success: true };
  }
);
