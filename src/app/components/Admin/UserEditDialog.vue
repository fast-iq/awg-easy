<template>
  <BaseDialog :trigger-class="triggerClass">
    <template #trigger><slot /></template>
    <template #title>{{ $t('admin.users.editUser') }}</template>
    <template #description>
      <FormGroup>
        <FormTextField
          id="edit-user-name"
          v-model="name"
          :label="$t('admin.users.name')"
        />
        <FormNullTextField
          id="edit-user-email"
          v-model="email"
          :label="$t('admin.users.email')"
        />
        <div class="flex items-center gap-2">
          <FormLabel for="edit-user-role">
            {{ $t('admin.users.role') }}
          </FormLabel>
          <select
            id="edit-user-role"
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
        <FormSwitchField
          id="edit-user-enabled"
          v-model="enabled"
          :label="$t('admin.users.enabled')"
        />
        <FormPasswordField
          id="edit-user-password"
          v-model="password"
          autocomplete="new-password"
          :label="$t('admin.users.newPassword')"
        />
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ $t('admin.users.newPasswordDesc') }}
        </p>
      </FormGroup>
    </template>
    <template #actions>
      <DialogClose as-child>
        <BaseSecondaryButton>{{ $t('dialog.cancel') }}</BaseSecondaryButton>
      </DialogClose>
      <DialogClose as-child>
        <BasePrimaryButton
          @click="
            $emit('save', { id: user.id, name, email, role, enabled, password })
          "
        >
          {{ $t('form.save') }}
        </BasePrimaryButton>
      </DialogClose>
    </template>
  </BaseDialog>
</template>

<script lang="ts" setup>
import { roles } from '#shared/utils/permissions';

defineEmits(['save']);
const props = defineProps<{
  triggerClass?: string;
  user: {
    id: number;
    name: string;
    email: string | null;
    role: number;
    enabled: boolean;
  };
}>();

const ROLE_ADMIN = roles.ADMIN;
const ROLE_CLIENT = roles.CLIENT;

const name = ref(props.user.name);
const email = ref<string | null>(props.user.email);
const role = ref<number>(props.user.role);
const enabled = ref(props.user.enabled);
const password = ref('');
</script>
