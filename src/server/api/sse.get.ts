export default definePermissionEventHandler(
  'clients',
  'custom',
  async ({ event, user }) => {
    const isAdmin = user.role === roles.ADMIN;
    const encoder = new TextEncoder();

    let poll: ReturnType<typeof setInterval> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream({
      start(controller) {
        let lastSnapshot = '';
        let closed = false;

        const enqueue = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        };

        const push = async () => {
          try {
            const clients = isAdmin
              ? await WireGuard.getAllClients()
              : await WireGuard.getClientsForUser(user.id);
            const snapshot = JSON.stringify(clients);
            if (snapshot !== lastSnapshot) {
              lastSnapshot = snapshot;
              enqueue(`data: ${snapshot}\n\n`);
            }
          } catch (err) {
            console.warn(`SSE client snapshot failed: ${err}`);
          }
        };

        poll = setInterval(() => void push(), 1000);
        heartbeat = setInterval(() => enqueue(': ping\n\n'), 15 * 1000);
        void push();
      },
      cancel() {
        if (poll !== undefined) clearInterval(poll);
        if (heartbeat !== undefined) clearInterval(heartbeat);
      },
    });

    setHeader(event, 'Content-Type', 'text/event-stream');
    setHeader(event, 'Cache-Control', 'no-cache');
    setHeader(event, 'X-Accel-Buffering', 'no');

    return stream;
  }
);
