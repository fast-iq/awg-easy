import en from './locales/en.json';
import ru from './locales/ru.json';
import zhCN from './locales/zh-CN.json';

export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en,
    ru,
    'zh-CN': zhCN,
  },
}));
