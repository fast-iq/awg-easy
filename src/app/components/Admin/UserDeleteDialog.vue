<template>
  <BaseDialog :trigger-class="triggerClass">
    <template #trigger><slot /></template>
    <template #title>{{ $t('admin.users.deleteUser') }}</template>
    <template #description>{{ $t('admin.users.deleteUserDesc') }}</template>
    <template #actions>
      <DialogClose as-child>
        <BaseSecondaryButton>{{ $t('dialog.cancel') }}</BaseSecondaryButton>
      </DialogClose>
      <DialogClose as-child>
        <BasePrimaryButton @click="$emit('delete')">
          {{ $t('admin.users.delete') }}
        </BasePrimaryButton>
      </DialogClose>
    </template>
  </BaseDialog>
</template>

<script lang="ts" setup>
defineEmits(['delete']);
defineProps<{ triggerClass?: string }>();
</script>
