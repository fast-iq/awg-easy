<template>
  <main v-if="data">
    <FormElement @submit.prevent="submit">
      <FormGroup>
        <FormNumberField
          id="session"
          v-model="data.sessionTimeout"
          :label="$t('admin.general.sessionTimeout')"
          :description="$t('admin.general.sessionTimeoutDesc')"
        />
        <FormSwitchField
          id="autoDeleteExpiredClients"
          v-model="data.autoDeleteExpiredClients"
          :label="$t('admin.general.autoDeleteExpired')"
          :description="$t('admin.general.autoDeleteExpiredDesc')"
        />
      </FormGroup>
      <FormGroup>
        <FormHeading>{{ $t('admin.general.metrics') }}</FormHeading>
        <FormNullTextField
          id="password"
          v-model="data.metricsPassword"
          :label="$t('admin.general.metricsPassword')"
          :description="$t('admin.general.metricsPasswordDesc')"
        />
        <FormSwitchField
          id="prometheus"
          v-model="data.metricsPrometheus"
          :label="$t('admin.general.prometheus')"
          :description="$t('admin.general.prometheusDesc')"
        />
        <FormSwitchField
          id="json"
          v-model="data.metricsJson"
          :label="$t('admin.general.json')"
          :description="$t('admin.general.jsonDesc')"
        />
      </FormGroup>
      <FormGroup>
        <FormHeading>{{ $t('form.actions') }}</FormHeading>
        <FormPrimaryActionField type="submit" :label="$t('form.save')" />
        <FormSecondaryActionField :label="$t('form.revert')" @click="revert" />
      </FormGroup>
      <FormGroup>
        <FormHeading>{{ $t('admin.general.backup') }}</FormHeading>
        <a href="/api/admin/backup" download>
          <BaseSecondaryButton as="span">
            {{ $t('admin.general.downloadBackup') }}
          </BaseSecondaryButton>
        </a>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ $t('admin.general.backupDesc') }}
        </p>
      </FormGroup>
      <FormGroup>
        <FormHeading>{{ $t('admin.blockStatus.label') }}</FormHeading>
        <div class="flex flex-wrap items-center gap-3">
          <span
            class="rounded px-2 py-1 text-sm font-semibold"
            :class="levelClass"
          >
            {{ $t(`admin.blockStatus.levels.${status?.level ?? 'unknown'}`) }}
          </span>
          <BaseSecondaryButton
            type="button"
            :disabled="checking"
            @click="checkNow"
          >
            {{ $t('admin.blockStatus.checkNow') }}
          </BaseSecondaryButton>
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          <p>
            <template v-if="status?.checkedAt">
              {{ new Date(status.checkedAt).toLocaleString() }} ·
              {{ status.ip || status.host }} ·
              {{
                $t('admin.blockStatus.in24', {
                  n: status.blockedInSlash24 ?? '—',
                })
              }}
            </template>
            <template v-else>{{ $t('admin.blockStatus.never') }}</template>
          </p>
          <p v-if="status?.error" class="text-red-500">
            {{ status.error }}
          </p>
        </div>
      </FormGroup>
    </FormElement>
  </main>
</template>

<script setup lang="ts">
import { levelColor } from '#shared/utils/blockrisk';

const { data: _data, refresh } = await useFetch(`/api/admin/general`, {
  method: 'get',
});
const data = toRef(_data.value);

const { data: status, refresh: refreshStatus } = await useFetch(
  `/api/admin/block-status`,
  { method: 'get' }
);
const checking = ref(false);
const levelClass = computed(
  () => levelColor(status.value?.level ?? 'unknown') as string
);

async function checkNow() {
  checking.value = true;
  try {
    await $fetch('/api/admin/block-status', { method: 'post' });
  } finally {
    await refreshStatus();
    checking.value = false;
  }
}

const _submit = useSubmit(
  `/api/admin/general`,
  {
    method: 'post',
  },
  { revert }
);

function submit() {
  return _submit(data.value);
}

async function revert() {
  await refresh();
  data.value = toRef(_data.value).value;
}
</script>
