<template>
  <BasePrimaryButton @click="toggleSort">
    <IconsArrowDown
      v-if="globalStore.sortClient === true"
      class="w-4 md:mr-2"
    />
    <IconsArrowUp v-else class="w-4 md:mr-2" />
    <span class="text-sm max-md:hidden"> {{ $t('client.sort') }}</span>
  </BasePrimaryButton>
</template>

<script setup lang="ts">
const globalStore = useGlobalStore();

function toggleSort() {
  // sorting happens in the store's computed — no refetch needed
  globalStore.sortClient = !globalStore.sortClient;
}
</script>
