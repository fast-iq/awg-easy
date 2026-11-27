export default definePermissionEventHandler(
  'users',
  'create',
  async ({ event, user }) => {
    const { username, password, role } = await readValidatedBody(
      event,
      validateZod(UserAdminCreateSchema, event)
    );

    try {
      await Database.users.create(username, password, role);
    } catch (e) {
      if (e instanceof Error && e.message === 'User already exists') {
        throw createError({
          statusCode: 400,
          statusMessage: 'User already exists',
        });
      }
      throw e;
    }

    logAudit(event, user, 'user.created', username, { role });
    return { success: true };
  }
);
