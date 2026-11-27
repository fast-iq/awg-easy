<template>
  <div>
    <header class="xs:mt-6 container mx-auto mt-4 max-w-3xl px-3 md:px-0">
      <div class="mb-5 flex justify-end">
        <div class="xxs:self-center flex grow-0 items-center gap-3 self-end">
          <HeaderLangSelector />
          <HeaderThemeSwitch />
        </div>
      </div>
      <UiBanner />
    </header>
    <main>
      <Panel>
        <PanelBody class="m-4 mx-auto mt-10 md:w-[70%] lg:w-[60%]">
          <h2 class="mt-8 mb-16 text-center text-3xl font-medium">
            {{ $t('setup.welcome') }}
          </h2>

          <slot />

          <div class="mt-12 flex">
            <UiStepProgress
              :step="setupStore.step"
              :total-steps="setupStore.totalSteps"
            />
          </div>
        </PanelBody>
      </Panel>
    </main>
    <UiFooter />
  </div>
</template>

<script lang="ts" setup>
const setupStore = useSetupStore();
</script>
