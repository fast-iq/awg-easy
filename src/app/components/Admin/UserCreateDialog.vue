<template>
  <BaseDialog :trigger-class="triggerClass">
    <template #trigger><slot /></template>
    <template #title>{{ $t('admin.users.createUser') }}</template>
    <template #description>
      <FormGroup>
        <FormTextField
          id="create-user-username"
          v-model="username"
          :label="$t('admin.users.username')"
        />
        <FormPasswordField
          id="create-user-password"
          v-model="password"
          autocomplete="new-password"
          :label="$t('general.password')"
        />
        <div class="flex items-center gap-2">
          <FormLabel for="create-user-role">
            {{ $t('admin.users.role') }}
          </FormLabel>
          <select
            id="create-user-role"
            v-model="role"
            class="h-8 rounded bg-gray-200 px-3 text-sm leading-none dark:bg-neutral-500 dark:text-neutral-200"
          >
            <option :value="ROLE_ADMIN">
              {{ $t('admin.users.roleAdmin') }}
            </option>
            <option :value="ROLE_CLIENT">
              {{ $t('admin.users.roleClient') }}
            </option>
          </select>
        </div>
      </FormGroup>
    </template>
    <template #actions>
      <DialogClose as-child>
        <BaseSecondaryButton>{{ $t('dialog.cancel') }}</BaseSecondaryButton>
      </DialogClose>
      <DialogClose as-child>
        <BasePrimaryButton
          @click="$emit('create', { username, password, role })"
        >
          {{ $t('dialog.create') }}
        </BasePrimaryButton>
      </DialogClose>
    </template>
  </BaseDialog>
</template>

<script lang="ts" setup>
import { roles } from '#shared/utils/permissions';

defineEmits(['create']);
defineProps<{ triggerClass?: string }>();

const ROLE_ADMIN = roles.ADMIN;
const ROLE_CLIENT = roles.CLIENT;

const username = ref('');
const password = ref('');
const role = ref<number>(roles.CLIENT);
</script>
