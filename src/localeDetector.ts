import { defineI18nLocaleDetector } from '#i18n'

export default defineI18nLocaleDetector((event, config) => {
  // Try to get locale from cookie
  const localeCookie = event.headers.get('cookie')?.match(/i18n_locale=([^;]+)/)?.[1]
  if (localeCookie && config.locales.includes(localeCookie)) {
    return localeCookie
  }
  
  // Try to get locale from Accept-Language header
  const acceptLanguage = event.headers.get('accept-language')
  if (acceptLanguage) {
    const browserLocale = acceptLanguage.split(',')[0].split('-')[0]
    if (config.locales.includes(browserLocale)) {
      return browserLocale
    }
  }
  
  // Fallback to default locale
  return config.defaultLocale
})
