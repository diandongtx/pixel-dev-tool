import { english } from './en'

export type Locale = 'en' | 'zh-CN'
export const LOCALE_KEY = 'pixel-dev-tool.language'

/** Explicit URL preference wins; a fresh installation defaults to English. */
export function getLocale(): Locale {
  const browser = (globalThis as typeof globalThis & { window?: { location: { search: string }; localStorage: { getItem(key: string): string | null } } }).window
  if (!browser) return 'en'
  const query = new URLSearchParams(browser.location.search).get('lang')
  if (query === 'en' || query === 'zh-CN') return query
  try {
    return browser.localStorage.getItem(LOCALE_KEY) === 'zh-CN' ? 'zh-CN' : 'en'
  } catch {
    return 'en'
  }
}

/** Substitute values once, without interpreting user data as translation keys. */
export function translate(locale: Locale, source: string, ...values: unknown[]): string {
  const template = locale === 'en' ? (english[source] ?? source) : source
  return template.replace(/\{(\d+)\}/g, (match, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : match)
}

export function t(source: string, ...values: unknown[]): string {
  return translate(getLocale(), source, ...values)
}

