import eslintConfigPrettier from 'eslint-config-prettier';
import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt([
  {
    rules: {
      'import/order': 'warn',
      // intentional single-word names namespaced by directory (Base/Input, Admin/Users...)
      'vue/multi-word-component-names': 'off',
    },
  },
  eslintConfigPrettier,
]);
