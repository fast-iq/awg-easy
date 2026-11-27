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

    // Flush headers right away with an SSE comment preamble. Without this,
    // the response stays unflushed until the first client snapshot succeeds
    // — and while the WireGuard interface is still starting (or failed to
    // start), `wg show` throws, no chunk is ever enqueued, and clients /
    // health probes never observe the stream as connected. EventSource
    // ignores comment lines, so the data protocol is unchanged.
    const reader = stream.getReader();
    return new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(': connected\n\n'));
      },
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) controller.close();
          else if (value) controller.enqueue(value);
        } catch (err) {
          controller.error(err);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
  }
);
