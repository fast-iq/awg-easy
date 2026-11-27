<template>
  <AvatarRoot
    class="mr-2 inline-flex items-center justify-center overflow-hidden rounded-full align-middle select-none"
  >
    <AvatarImage
      class="h-full w-full rounded-[inherit] object-cover"
      :src="img ?? ''"
    />
    <AvatarFallback
      class="flex h-full w-full items-center justify-center bg-white text-sm leading-1 font-medium"
      :delay-ms="600"
    >
      <slot />
    </AvatarFallback>
  </AvatarRoot>
</template>

<script lang="ts" setup>
defineProps<{ img?: string }>();
</script>
