import { defineStore } from 'pinia';
import { sha256 } from 'js-sha256';
import type { TypedInternalResponse } from 'nitropack/types';

type WGClientReturn = TypedInternalResponse<
  '/api/client',
  unknown,
  'get'
>[number];

export type LocalClient = WGClientReturn & {
  avatar?: string;
  transferMax?: number;
} & Omit<ClientPersist, 'transferRxPrevious' | 'transferTxPrevious'>;

export type ClientPersist = {
  transferRxHistory: number[];
  transferRxPrevious: number;
  transferRxCurrent: number;
  transferRxSeries: { name: string; data: number[] }[];
  hoverRx?: unknown;
  transferTxHistory: number[];
  transferTxPrevious: number;
  transferTxCurrent: number;
  transferTxSeries: { name: string; data: number[] }[];
  hoverTx?: unknown;
};

export const useClientsStore = defineStore('Clients', () => {
  const globalStore = useGlobalStore();
  const allClients = ref<null | LocalClient[]>(null);
  const clientsPersist = ref<Record<string, ClientPersist>>({});

  const searchParams = ref({
    filter: undefined as string | undefined,
  });

  /**
   * Search and sort run on the full snapshot client-side: the SSE stream
   * always carries every (visible to this user) client, so filtering never
   * needs a round trip. Mirrors the backend LIKE filter: name, IPv4, IPv6.
   */
  const clients = computed(() => {
    let list = allClients.value;
    if (list === null) {
      return null;
    }
    const filter = searchParams.value.filter;
    if (filter) {
      const needle = filter.toLowerCase();
      list = list.filter((client) =>
        [client.name, client.ipv4Address, client.ipv6Address].some((value) =>
          value?.toLowerCase().includes(needle)
        )
      );
    }
    const direction = globalStore.sortClient ? 1 : -1;
    return [...list].sort((a, b) => direction * a.name.localeCompare(b.name));
  });

  const { data: _clients, refresh: _refresh } = useFetch('/api/client', {
    method: 'get',
  });

  // TODO: rewrite
  function applyData(
    data: undefined | WGClientReturn[],
    { updateCharts = false } = {}
  ) {
    const transformedClients = data?.map((client) => {
      let avatar = undefined;
      if (client.name.includes('@') && client.name.includes('.')) {
        avatar = `https://gravatar.com/avatar/${sha256(client.name.toLowerCase().trim())}.jpg`;
      }

      if (!clientsPersist.value[client.id]) {
        clientsPersist.value[client.id] = {
          transferRxHistory: Array(50).fill(0),
          transferRxPrevious: client.transferRx ?? 0,
          transferTxHistory: Array(50).fill(0),
          transferTxPrevious: client.transferTx ?? 0,
          transferRxCurrent: 0,
          transferTxCurrent: 0,
          transferRxSeries: [],
          transferTxSeries: [],
        };
      }

      // We know that this can't be undefined
      const clientPersist = clientsPersist.value[client.id]!;

      clientPersist.transferRxCurrent =
        (client.transferRx ?? 0) - clientPersist.transferRxPrevious;

      clientPersist.transferRxPrevious = client.transferRx ?? 0;

      clientPersist.transferTxCurrent =
        (client.transferTx ?? 0) - clientPersist.transferTxPrevious;

      clientPersist.transferTxPrevious = client.transferTx ?? 0;

      let transferMax = undefined;

      if (updateCharts) {
        clientPersist.transferRxHistory.push(clientPersist.transferRxCurrent);
        clientPersist.transferRxHistory.shift();

        clientPersist.transferTxHistory.push(clientPersist.transferTxCurrent);
        clientPersist.transferTxHistory.shift();

        clientPersist.transferTxSeries = [
          {
            name: 'Tx',
            data: clientPersist.transferTxHistory,
          },
        ];

        clientPersist.transferRxSeries = [
          {
            name: 'Rx',
            data: clientPersist.transferRxHistory,
          },
        ];

        transferMax = Math.max(
          ...clientPersist.transferTxHistory,
          ...clientPersist.transferRxHistory
        );
      }

      return {
        ...client,
        avatar,
        transferTxHistory: clientPersist.transferTxHistory,
        transferRxHistory: clientPersist.transferRxHistory,
        transferMax,
        transferTxSeries: clientPersist.transferTxSeries,
        transferRxSeries: clientPersist.transferRxSeries,
        transferTxCurrent: clientPersist.transferTxCurrent,
        transferRxCurrent: clientPersist.transferRxCurrent,
        hoverTx: clientPersist.hoverTx,
        hoverRx: clientPersist.hoverRx,
      };
    });

    allClients.value = transformedClients ?? null;
  }

  async function refresh({ updateCharts = false } = {}) {
    await _refresh();
    applyData(_clients.value, { updateCharts });
  }

  // ---- SSE (primary live source; REST refresh stays as the fallback) ----

  const sseActive = ref(false);
  let source: EventSource | null = null;

  function connectSSE() {
    if (source !== null || typeof EventSource === 'undefined') {
      return;
    }
    source = new EventSource('/api/sse');
    source.onopen = () => {
      sseActive.value = true;
    };
    source.onmessage = (message) => {
      sseActive.value = true;
      try {
        const data = JSON.parse(message.data) as WGClientReturn[];
        applyData(data, { updateCharts: globalStore.uiShowCharts });
      } catch (err) {
        console.error('SSE payload parse failed', err);
      }
    };
    source.onerror = () => {
      // browser reconnects automatically; poll in the meantime
      sseActive.value = false;
    };
  }

  function disconnectSSE() {
    if (source !== null) {
      source.close();
      source = null;
    }
    sseActive.value = false;
  }

  function setSearchQuery(filter: string) {
    searchParams.value.filter = filter || undefined;
  }

  return {
    clients,
    clientsPersist,
    refresh,
    _clients,
    setSearchQuery,
    sseActive,
    connectSSE,
    disconnectSSE,
  };
});
