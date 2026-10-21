import { t, getLocale, LOCALE_KEY, type Locale } from './index'

/** Reload so module-level options and pending status text use one language. */
export function languageUrl(locale: Locale): string {
  const url = new URL(window.location.href)
  url.searchParams.set('lang', locale)
  return url.toString()
}

export function changeLanguage(locale: Locale): void {
  if (locale === getLocale()) return
  const message = t('切换语言会重新加载页面，未保存的编辑将丢失。继续吗？')
  if (!window.confirm(message)) return
  try { window.localStorage.setItem(LOCALE_KEY, locale) } catch { /* URL remains the fallback. */ }
  window.location.assign(languageUrl(locale))
}
