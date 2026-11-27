import { TrafficQuerySchema } from '#db/repositories/traffic/types';

export default definePermissionEventHandler(
  'clients',
  'view',
  async ({ event, checkPermissions }) => {
    const client = await getAuthorizedClient(event, checkPermissions);

    const { days } = await getValidatedQuery(
      event,
      validateZod(TrafficQuerySchema, event)
    );

    const [history, totals] = await Promise.all([
      Database.traffic.list(client.id, days),
      Database.traffic.totals(client.id),
    ]);

    return { history, totals };
  }
);
