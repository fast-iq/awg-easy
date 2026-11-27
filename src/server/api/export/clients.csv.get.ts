/**
 * CSV cell guard: quote everything; prefix spreadsheet formula
 * triggers (=, +, -, @, tab, CR) with an apostrophe (formula injection).
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replaceAll('"', '""')}"`;
}

export default definePermissionEventHandler(
  'clients',
  'view',
  async ({ event, user, checkPermissions }) => {
    const clients =
      user.role === roles.ADMIN
        ? await WireGuard.getAllClients()
        : await WireGuard.getClientsForUser(user.id);

    for (const client of clients) {
      checkPermissions({ id: client.id, userId: client.userId });
    }
    if (clients.length === 0) {
      // permission checker still must run for an empty result set
      checkPermissions({ id: 0, userId: user.id });
    }

    const header = [
      'name',
      'enabled',
      'ipv4Address',
      'ipv6Address',
      'createdAt',
      'expiresAt',
      'latestHandshakeAt',
      'endpoint',
      'transferRx',
      'transferTx',
    ];

    const rows = clients.map((client) =>
      [
        client.name,
        client.enabled,
        client.ipv4Address,
        client.ipv6Address,
        client.createdAt?.toISOString?.() ?? client.createdAt,
        client.expiresAt,
        client.latestHandshakeAt?.toISOString?.() ?? '',
        client.endpoint ?? '',
        client.transferRx ?? 0,
        client.transferTx ?? 0,
      ]
        .map(csvCell)
        .join(',')
    );

    const csv = [header.map(csvCell).join(','), ...rows].join('\r\n');

    setHeader(
      event,
      'Content-Disposition',
      'attachment; filename="awg-easy-clients.csv"'
    );
    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8');

    return csv;
  }
);
