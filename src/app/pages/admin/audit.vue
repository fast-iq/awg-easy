<template>
  <main>
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <BaseSelect v-model="action" :options="actionOptions" class="w-72" />
      <BaseSecondaryButton :disabled="offset === 0" @click="prevPage">
        {{ $t('admin.audit.prev') }}
      </BaseSecondaryButton>
      <BaseSecondaryButton :disabled="!hasNext" @click="nextPage">
        {{ $t('admin.audit.next') }}
      </BaseSecondaryButton>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="text-gray-500 dark:text-neutral-300">
          <tr>
            <th class="p-2">{{ $t('admin.audit.time') }}</th>
            <th class="p-2">{{ $t('admin.audit.user') }}</th>
            <th class="p-2">{{ $t('admin.audit.action') }}</th>
            <th class="p-2">{{ $t('admin.audit.target') }}</th>
            <th class="p-2">{{ $t('admin.audit.ip') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in entries"
            :key="entry.id"
            class="border-t border-gray-200 dark:border-neutral-600"
          >
            <td class="p-2 whitespace-nowrap">{{ formatTs(entry.ts) }}</td>
            <td class="p-2">{{ entry.username }}</td>
            <td class="p-2 whitespace-nowrap">
              {{ actionLabel(entry.action) }}
            </td>
            <td class="p-2">
              {{ entry.target || '—' }}
              <span
                v-if="entry.details"
                class="text-gray-400 dark:text-neutral-400"
              >
                {{ formatDetails(entry.details) }}
              </span>
            </td>
            <td class="p-2 whitespace-nowrap">{{ entry.ip || '—' }}</td>
          </tr>
          <tr v-if="!entries || entries.length === 0">
            <td colspan="5" class="p-4 text-center text-gray-500">
              {{ $t('admin.audit.empty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<script setup lang="ts">
import { AUDIT_ACTIONS } from '#shared/utils/audit';

const { t } = useI18n();

const PAGE_SIZE = 50;

const action = ref('all');
const offset = ref(0);

const actionOptions = computed(() => [
  { value: 'all', label: t('admin.audit.allActions') },
  ...AUDIT_ACTIONS.map((a) => ({ value: a, label: actionLabel(a) })),
]);

const { data: entries } = await useFetch('/api/admin/audit', {
  query: computed(() => ({
    limit: PAGE_SIZE,
    offset: offset.value,
    ...(action.value !== 'all' ? { action: action.value } : {}),
  })),
  watch: [action],
});

// an extra row beyond the page means there is a next page; the API has no
// count endpoint on purpose (append-only log, cheap limit+1 is enough)
const hasNext = computed(() => (entries.value?.length ?? 0) >= PAGE_SIZE);

watch(action, () => {
  offset.value = 0;
});

function prevPage() {
  offset.value = Math.max(0, offset.value - PAGE_SIZE);
}

function nextPage() {
  offset.value += PAGE_SIZE;
}

function actionLabel(action: string) {
  return t(`admin.audit.actions.${action.replaceAll('.', '_')}`);
}

function formatTs(ts: string) {
  // SQLite CURRENT_TIMESTAMP is UTC without timezone marker
  return new Date(`${ts}Z`).toLocaleString();
}

function formatDetails(details: Record<string, unknown>) {
  const fields = details.fields;
  if (Array.isArray(fields)) {
    return `(${fields.join(', ')})`;
  }
  const id = details.clientId ?? details.userId;
  return id !== undefined ? `(#${String(id)})` : '';
}
</script>
