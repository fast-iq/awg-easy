<template>
  <main v-if="users">
    <AdminUserCreateDialog @create="createUser">
      <BasePrimaryButton>{{ $t('admin.users.createUser') }}</BasePrimaryButton>
    </AdminUserCreateDialog>

    <div class="mt-6 flex flex-col gap-3">
      <div
        v-for="user in users"
        :key="user.id"
        class="flex flex-wrap items-center gap-4 rounded-lg bg-gray-100 p-4 dark:bg-neutral-600"
      >
        <div class="min-w-40 flex-1">
          <div class="font-semibold dark:text-neutral-100">
            {{ user.username }}
            <span v-if="!user.enabled" class="text-sm text-red-500">
              ({{ $t('admin.users.enabled') }}: {{ $t('general.no') }})
            </span>
          </div>
          <div class="text-sm text-gray-500 dark:text-neutral-300">
            {{ user.name }} · {{ user.email ?? '—' }}
          </div>
          <div class="text-sm text-gray-500 dark:text-neutral-300">
            {{ roleLabel(user.role) }} · {{ $t('admin.users.clients') }}:
            {{ user.clientCount }} · {{ $t('admin.users.twoFactor') }}:
            {{ user.totpVerified ? $t('general.yes') : $t('general.no') }}
          </div>
        </div>

        <AdminUserEditDialog :user="user" @save="saveUser">
          <BaseSecondaryButton>
            {{ $t('admin.users.editUser') }}
          </BaseSecondaryButton>
        </AdminUserEditDialog>

        <AdminUserDeleteDialog @delete="deleteUser(user.id)">
          <BaseSecondaryButton>
            {{ $t('admin.users.deleteUser') }}
          </BaseSecondaryButton>
        </AdminUserDeleteDialog>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { FetchError } from 'ofetch';
import { roles } from '#shared/utils/permissions';

const { t } = useI18n();
const toast = useToast();

const { data: users, refresh } = await useFetch('/api/admin/users', {
  method: 'get',
});

function roleLabel(role: number) {
  return role === roles.ADMIN
    ? t('admin.users.roleAdmin')
    : t('admin.users.roleClient');
}

// useSubmit with a static URL; update/delete need the id at call time
async function postTo(
  id: string,
  body?: Record<string, unknown>,
  method: 'post' | 'delete' = 'post'
) {
  try {
    await $fetch(id === '' ? '/api/admin/users' : `/api/admin/users/${id}`, {
      method,
      body,
    });
    toast.showToast({ type: 'success' });
    await refresh();
  } catch (e) {
    if (e instanceof FetchError) {
      toast.showToast({
        type: 'error',
        message: e.data?.message ?? e.data?.statusMessage,
      });
    } else {
      console.error(e);
    }
  }
}

function createUser(payload: {
  username: string;
  password: string;
  role: number;
}) {
  return postTo('', payload);
}

function saveUser(payload: {
  id: number;
  name: string;
  email: string | null;
  role: number;
  enabled: boolean;
  password: string;
}) {
  const { id, ...body } = payload;
  return postTo(String(id), body);
}

function deleteUser(id: number) {
  return postTo(String(id), undefined, 'delete');
}
</script>
