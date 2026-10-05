import fs from 'node:fs/promises';
import debug from 'debug';
import { encodeQR } from 'qr';
import type { InterfaceType } from '#db/repositories/interface/types';

const WG_DEBUG = debug('WireGuard');

type DumpEntry = Awaited<ReturnType<typeof wg.dump>>[number];

type ClientWithDump = {
  publicKey: string;
  latestHandshakeAt: Date | null;
  endpoint: string | null;
  transferRx: number | null;
  transferTx: number | null;
};

/**
 * Merge `wg show dump` data into client objects.
 * Uses a Map by publicKey to keep this O(clients + dump) instead of O(n^2).
 */
function applyDumpToClients(clients: ClientWithDump[], dump: DumpEntry[]) {
  const byPublicKey = new Map<string, ClientWithDump>();
  for (const client of clients) {
    byPublicKey.set(client.publicKey, client);
  }

  for (const entry of dump) {
    const client = byPublicKey.get(entry.publicKey);
    if (!client) {
      continue;
    }

    client.latestHandshakeAt = entry.latestHandshakeAt;
    client.endpoint = entry.endpoint;
    client.transferRx = entry.transferRx;
    client.transferTx = entry.transferTx;
  }
}

class WireGuard {
  /**
   * Save and sync config
   */
  async saveConfig() {
    const wgInterface = await Database.interfaces.get();
    await this.#saveWireguardConfig(wgInterface);
    await this.#syncWireguardConfig(wgInterface);
    await this.#ensureSiteRoutes(wgInterface);
  }

  /**
   * Install kernel routes for site-to-site subnets (serverAllowedIps).
   *
   * wg-quick adds routes for peer AllowedIPs only on `up`, but saveConfig
   * syncs peers live via syncconf — without this the subnet would be
   * accepted cryptographically yet unroutable until an interface restart.
   */
  async #ensureSiteRoutes(wgInterface: InterfaceType) {
    const clients = await Database.clients.getAll();
    for (const client of clients) {
      if (!client.enabled) {
        continue;
      }
      for (const cidr of client.serverAllowedIps ?? []) {
        try {
          await wg.routeReplace(cidr, wgInterface.name);
        } catch (err) {
          console.warn(
            `Failed to add route ${cidr} for client ${client.id}: ${err}`
          );
        }
      }
    }
  }

  /**
   * Generates and saves WireGuard config from database
   *
   * Make sure to pass an updated InterfaceType object
   */
  async #saveWireguardConfig(wgInterface: InterfaceType) {
    const clients = await Database.clients.getAll();
    const hooks = await Database.hooks.get();

    const result = [];
    result.push(
      wg.generateServerInterface(wgInterface, hooks, {
        enableIpv6: !WG_ENV.DISABLE_IPV6,
      })
    );

    for (const client of clients) {
      if (!client.enabled) {
        continue;
      }
      result.push(
        wg.generateServerPeer(client, {
          enableIpv6: !WG_ENV.DISABLE_IPV6,
        })
      );
    }

    result.push('');

    WG_DEBUG('Saving Config...');
    await fs.writeFile(
      `/etc/wireguard/${wgInterface.name}.conf`,
      result.join('\n\n'),
      {
        mode: 0o600,
      }
    );
    WG_DEBUG('Config saved successfully.');
  }

  async #syncWireguardConfig(wgInterface: InterfaceType) {
    WG_DEBUG('Syncing Config...');
    await wg.sync(wgInterface.name);
    WG_DEBUG('Config synced successfully.');
  }

  async getClientsForUser(userId: ID, filter?: string, sort?: 'asc' | 'desc') {
    const wgInterface = await Database.interfaces.get();

    let dbClients;
    if (filter?.trim()) {
      dbClients = await Database.clients.getForUserFiltered(userId, filter);
    } else {
      dbClients = await Database.clients.getForUser(userId);
    }

    return this.#attachDump(wgInterface, dbClients, sort);
  }

  async dumpByPublicKey(publicKey: string) {
    const wgInterface = await Database.interfaces.get();

    const dump = await wg.dump(wgInterface.name);
    const clientDump = dump.find(
      ({ publicKey: dumpPublicKey }) => dumpPublicKey === publicKey
    );

    return clientDump;
  }

  async getAllClients(filter?: string, sort?: 'asc' | 'desc') {
    const wgInterface = await Database.interfaces.get();

    let dbClients;
    if (filter?.trim()) {
      dbClients = await Database.clients.getAllPublicFiltered(filter);
    } else {
      dbClients = await Database.clients.getAllPublic();
    }

    return this.#attachDump(wgInterface, dbClients, sort);
  }

  /**
   * Merge `wg show dump` data into clients and sort by name.
   */
  async #attachDump<T extends { name: string; publicKey: string }>(
    wgInterface: InterfaceType,
    dbClients: T[],
    sort?: 'asc' | 'desc'
  ) {
    const clients = dbClients.map((client) => ({
      ...client,
      latestHandshakeAt: null as Date | null,
      endpoint: null as string | null,
      transferRx: null as number | null,
      transferTx: null as number | null,
    }));

    const dump = await wg.dump(wgInterface.name);
    applyDumpToClients(clients, dump);

    clients.sort((a, b) =>
      sort === 'desc'
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name)
    );

    return clients;
  }

  async getClientConfiguration({ clientId }: { clientId: ID }) {
    const wgInterface = await Database.interfaces.get();
    const userConfig = await Database.userConfigs.get();

    const client = await Database.clients.get(clientId);

    if (!client) {
      throw new Error('Client not found');
    }

    return wg.generateClientConfig(wgInterface, userConfig, client, {
      enableIpv6: !WG_ENV.DISABLE_IPV6,
    });
  }
  async getClientQRCodeSVG({ clientId }: { clientId: ID }) {
    const config = await this.getClientConfiguration({ clientId });

    // AmneziaWG configs can exceed 2.9 KB (the I1 decoy template alone is
    // ~2.4 KB) while QR capacity at the strongest ECC is only 1273 bytes.
    // Try progressively weaker error correction first; as a last resort drop
    // the I1-I5 decoy templates — they are sender-local decoration, do not
    // need to match the server and never affect the handshake.
    const eccLevels = ['high', 'medium', 'quartile', 'low'] as const;
    const tryEncode = (data: string): string | null => {
      for (const ecc of eccLevels) {
        try {
          return encodeQR(data, 'svg', { ecc, scale: 2, encoding: 'byte' });
        } catch {
          // capacity overflow — try a weaker error correction level
        }
      }
      return null;
    };

    const svg =
      tryEncode(config) ?? tryEncode(config.replace(/^I[1-5] = .*$/gm, ''));
    if (svg === null) {
      throw new Error('Client configuration is too large for a QR code');
    }
    return svg;
  }

  cleanClientFilename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_=+.-]/g, '-')
      .replace(/(-{2,}|-$)/g, '-')
      .replace(/-$/, '')
      .substring(0, 32);
  }

  async Startup() {
    WG_DEBUG('Starting WireGuard...');
    // let as it has to refetch if keys change
    let wgInterface = await Database.interfaces.get();

    // default interface has no keys
    if (
      wgInterface.privateKey === '---default---' &&
      wgInterface.publicKey === '---default---'
    ) {
      WG_DEBUG('Generating new Wireguard Keys...');
      const privateKey = await wg.generatePrivateKey();
      const publicKey = await wg.getPublicKey(privateKey);

      await Database.interfaces.updateKeyPair(privateKey, publicKey);
      wgInterface = await Database.interfaces.get();
      WG_DEBUG('New Wireguard Keys generated successfully.');
    }
    WG_DEBUG(`Starting Wireguard Interface ${wgInterface.name}...`);
    await this.#saveWireguardConfig(wgInterface);
    await wg.down(wgInterface.name).catch(() => {});
    await wg.up(wgInterface.name).catch((err) => {
      if (
        err &&
        err.message &&
        err.message.includes(`Cannot find device "${wgInterface.name}"`)
      ) {
        throw new Error(
          `WireGuard exited with the error: Cannot find device "${wgInterface.name}"\nThis usually means that your host's kernel does not support WireGuard!`,
          { cause: err.message }
        );
      }

      throw err;
    });
    await this.#syncWireguardConfig(wgInterface);
    WG_DEBUG(`Wireguard Interface ${wgInterface.name} started successfully.`);

    WG_DEBUG('Starting Cron Job...');
    await this.startCronJob();
    WG_DEBUG('Cron Job started successfully.');
  }

  // TODO: handle as worker_thread
  async startCronJob() {
    setIntervalImmediately(() => {
      this.cronJob().catch((err) => {
        WG_DEBUG('Running Cron Job failed.');
        console.error(err);
      });
    }, 60 * 1000);
  }

  // Shutdown wireguard
  async Shutdown() {
    const wgInterface = await Database.interfaces.get();
    await wg.down(wgInterface.name).catch(() => {});
  }

  async Restart() {
    const wgInterface = await Database.interfaces.get();
    await wg.restart(wgInterface.name);
  }

  async cronJob() {
    const clients = await Database.clients.getAll();
    let needsSave = false;
    // Expires Feature
    for (const client of clients) {
      if (client.enabled !== true) continue;
      if (
        client.expiresAt !== null &&
        new Date() > new Date(client.expiresAt)
      ) {
        WG_DEBUG(`Client ${client.id} expired.`);
        await Database.clients.toggle(client.id, false);
        needsSave = true;
      }
    }
    // One Time Link Feature
    for (const client of clients) {
      if (
        client.oneTimeLink !== null &&
        new Date() > new Date(client.oneTimeLink.expiresAt)
      ) {
        WG_DEBUG(`OneTimeLink for Client ${client.id} expired.`);
        await Database.oneTimeLinks.delete(client.id);
        // otl does not need wireguard sync
      }
    }

    if (needsSave) {
      await this.saveConfig();
    }
  }
}

if (OLD_ENV.PASSWORD || OLD_ENV.PASSWORD_HASH) {
  throw new Error(
    `
You are using an invalid Configuration for awg-easy
Please follow the instructions on https://fast-iq.github.io/awg-easy/latest/advanced/migrate/from-14-to-15/ to migrate
`
  );
}

// TODO: make static or object

export default new WireGuard();
