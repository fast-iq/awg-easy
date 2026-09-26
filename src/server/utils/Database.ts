/**
 * Changing the Database Provider
 * This design allows for easy swapping of different database implementations.
 */
import { connect, type DBServiceType } from '#db/sqlite';

let provider = null as never as DBServiceType;

const startupPromise: Promise<void> = (async () => {
  const db = await connect();
  provider = db;
  // Don't block API availability if the interface can't start
  // (e.g. no kernel module, missing device). The UI stays usable,
  // and `wg up` errors are surfaced in logs / on client operations.
  try {
    await WireGuard.Startup();
  } catch (err) {
    console.error('Failed to start WireGuard interface:', err);
  }
})();

export default new Proxy(
  {},
  {
    get(_target, prop) {
      // Wait for the real provider instead of crashing with a raw error.
      // This makes early requests (e.g. /api/session right after boot) fail
      // with a clear 503 instead of an unhandled "Database not yet initialized".
      return (...args: unknown[]) =>
        startupPromise.then(() => {
          const real = provider as unknown as Record<PropertyKey, unknown>;
          const value = real[prop];
          if (typeof value === 'function') {
            return (value as (...a: unknown[]) => unknown).apply(real, args);
          }
          return value;
        });
    },
  }
) as DBServiceType;
