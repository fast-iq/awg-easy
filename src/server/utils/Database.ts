/**
 * Changing the Database Provider
 * This design allows for easy swapping of different database implementations.
 */
import { connect, type DBServiceType } from '#db/sqlite';

let provider = null as never as DBServiceType;

const connectPromise: Promise<void> = connect().then((db) => {
  provider = db;
});

void connectPromise
  .then(async () => {
    // Don't block API availability if the interface can't start
    // (e.g. no kernel module, missing device). The UI stays usable,
    // and `wg up` errors are surfaced in logs / on client operations.
    try {
      await WireGuard.Startup();
    } catch (err) {
      console.error('Failed to start WireGuard interface:', err);
    }
  })
  .catch((err) => {
    console.error('Database startup failed:', err);
  });

const createNode = (path: PropertyKey[]): unknown =>
  new Proxy(() => {}, {
    get(_target, prop) {
      return createNode([...path, prop]);
    },
    apply(_target, _thisArg, args) {
      // WireGuard.Startup() runs after connect() and calls Database.* itself,
      // so callers must wait only for connectPromise - waiting for a promise
      // that includes the caller's own execution would deadlock.
      const ready = provider ? Promise.resolve() : connectPromise;
      return ready.then(() => {
        const real = provider as unknown as Record<PropertyKey, unknown>;
        let scope: Record<PropertyKey, unknown> = real;
        for (const key of path.slice(0, -1)) {
          scope = scope[key] as Record<PropertyKey, unknown>;
        }
        const fn = scope[path[path.length - 1] as PropertyKey];
        if (typeof fn !== 'function') {
          throw new TypeError(
            `Database.${path.map(String).join('.')} is not a function`
          );
        }
        return (fn as (...a: unknown[]) => unknown).apply(scope, args);
      });
    },
  });

export default createNode([]) as unknown as DBServiceType;
