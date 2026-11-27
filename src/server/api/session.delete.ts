export default defineEventHandler(async (event) => {
  const session = await useWGSession(event);
  const sessionId = session.id;

  if (sessionId === undefined) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Not logged in',
    });
  }

  await session.clear();

  const logoutUser = session.data.userId
    ? await Database.users.get(session.data.userId).catch(() => null)
    : null;
  logAudit(event, logoutUser, 'logout');

  SERVER_DEBUG(`Deleted Session: ${sessionId}`);
  return { success: true };
});
