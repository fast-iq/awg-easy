<template>
  <main>
    <Panel>
      <PanelHead>
        <PanelHeadTitle :text="$t('pages.clients')" />
        <PanelHeadBoat>
          <ClientsSearch />
          <ClientsSort />
          <ClientsExport />
          <ClientsNew />
        </PanelHeadBoat>
      </PanelHead>

      <div>
        <ClientsList
          v-if="clientsStore.clients && clientsStore.clients.length > 0"
        />
      </div>
      <ClientsEmpty
        v-if="clientsStore.clients && clientsStore.clients.length === 0"
      />
      <div
        v-if="clientsStore.clients === null"
        class="p-5 text-gray-200 dark:text-red-300"
      >
        <IconsLoading class="mx-auto w-5 animate-spin" />
      </div>
    </Panel>
  </main>
</template>

<script setup lang="ts">
const authStore = useAuthStore();
authStore.update();

const globalStore = useGlobalStore();
const clientsStore = useClientsStore();

// TODO?: use hover card to show more detailed info without leaving the page
// or do something like a accordion

const intervalId = ref<NodeJS.Timeout | null>(null);

clientsStore.refresh().catch(console.error);

onMounted(() => {
  // SSE is the primary live source; the interval below is a fallback that
  // only polls while SSE is down (proxy issues, disconnects, etc.)
  clientsStore.connectSSE();
  intervalId.value = setInterval(() => {
    if (clientsStore.sseActive) {
      return;
    }
    clientsStore
      .refresh({
        updateCharts: globalStore.uiShowCharts,
      })
      .catch(console.error);
  }, 1000);
});

onUnmounted(() => {
  clientsStore.disconnectSSE();
  if (intervalId.value !== null) {
    clearInterval(intervalId.value);
    intervalId.value = null;
  }
});
</script>
