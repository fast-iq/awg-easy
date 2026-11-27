// The SSR renderer hardcodes the "x-powered-by: Nuxt" response header
// (renderer.mjs) and there is no config switch for it. ZAP flags it as
// information disclosure (rule 10037), so strip it from every rendered
// response via the runtime render hook.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response) => {
    if (response.headers) delete response.headers['x-powered-by'];
  });
});
