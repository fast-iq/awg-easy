import bn from './locales/bn.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ko from './locales/ko.json';
import pl from './locales/pl.json';
import ptBR from './locales/pt-BR.json';
import ru from './locales/ru.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import zhCN from './locales/zh-CN.json';
import zhHK from './locales/zh-HK.json';

export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    bn,
    de,
    en,
    es,
    fr,
    id,
    it,
    ko,
    pl,
    'pt-BR': ptBR,
    ru,
    tr,
    uk,
    'zh-CN': zhCN,
    'zh-HK': zhHK,
  },
}));
