<template>
  <a href="/api/export/clients.csv" download>
    <BaseSecondaryButton as="span">
      {{ $t('client.exportCsv') }}
    </BaseSecondaryButton>
  </a>
</template>
