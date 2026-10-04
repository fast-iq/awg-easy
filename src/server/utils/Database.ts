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

const createNode = (path: PropertyKey[]): unknown =>
  new Proxy(() => {}, {
    get(_target, prop) {
      return createNode([...path, prop]);
    },
    apply(_target, _thisArg, args) {
      return startupPromise.then(() => {
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
