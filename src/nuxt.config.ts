import { fileURLToPath } from 'node:url';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4,
  },
  compatibilityDate: '2025-02-04',
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/i18n',
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@eschricht/nuxt-color-mode',
    'radix-vue/nuxt',
    '@vueuse/nuxt',
    '@nuxt/eslint',
  ],
  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: '',
    cookieName: 'theme',
  },
  i18n: {
    // https://i18n.nuxtjs.org/docs/guide/server-side-translations
    // Disabled experimental locale detector to prevent deepCopy errors
    // experimental: {
    //   localeDetector: './localeDetector.ts',
    // },
    // Disable compilation to prevent build-time locale merging issues
    experimental: {
      localeDetector: './localeDetector.ts',
    },
    compilation: {
      strictMessage: false,
      escapeHtml: false,
    },
    // https://fast-iq.github.io/awg-easy/latest/contributing/translation/
    locales: [
      {
        // same as i18n.config.ts
        code: 'en',
        // BCP 47 language tag
        language: 'en-US',
        name: 'English',
      },
      {
        code: 'ru',
        language: 'ru-RU',
        name: 'Русский',
      },
      {
        code: 'zh-CN',
        language: 'zh-CN',
        name: '简体中文',
      },
    ],
    defaultLocale: 'en',
    vueI18n: './i18n.config.ts',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      fallbackLocale: 'en',
      // Disable redirect to prevent locale switching during SSR
      redirectOn: 'root',
    },
  },
  nitro: {
    esbuild: {
      options: {
        // to support big int
        target: 'node24',
      },
    },
    alias: {
      '#db': fileURLToPath(new URL('./server/database/', import.meta.url)),
      '#utils': fileURLToPath(new URL('./server/utils/', import.meta.url)),
    },
    externals: {
      traceInclude: [fileURLToPath(new URL('./cli/index.ts', import.meta.url))],
    },
  },
  alias: {
    // for typecheck reasons (https://github.com/nuxt/cli/issues/323)
    '#db': fileURLToPath(new URL('./server/database/', import.meta.url)),
    '#utils': fileURLToPath(new URL('./server/utils/', import.meta.url)),
  },
});
