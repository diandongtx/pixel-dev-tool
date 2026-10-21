import { afterEach, describe, expect, it, vi } from 'vitest'
import { english } from '../en'
import { getLocale, LOCALE_KEY, t, translate } from '../index'
import { changeLanguage, languageUrl } from '../browser'
import { DEFAULT_THEME_CONFIG, themeDisplayName } from '../../utils/themeConfig'
import { normalizePixelConfigItems, parseGridDataFile } from '../../utils/configIO'

const setLanguage = (language: string) => window.history.replaceState(null, '', language ? '/?lang=' + language : '/')
afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.removeItem(LOCALE_KEY)
  setLanguage('zh-CN')
})

describe('localization contracts', () => {
  it('defaults to English and honors an explicit URL over a saved preference', () => {
    setLanguage('')
    window.localStorage.removeItem(LOCALE_KEY)
    expect(getLocale()).toBe('en')
    window.localStorage.setItem(LOCALE_KEY, 'zh-CN')
    expect(getLocale()).toBe('zh-CN')
    setLanguage('en')
    expect(getLocale()).toBe('en')
  })
  it('handles unavailable browser storage', () => {
    setLanguage('')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(getLocale()).toBe('en')
  })
  it('preserves every interpolation slot and has no untranslated English messages', () => {
    const slots = (value: string) => [...value.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort()
    for (const [source, target] of Object.entries(english)) {
      expect(target.trim(), source).not.toBe('')
      expect(target, source).not.toMatch(/[\u4e00-\u9fff]/)
      expect(slots(target), source).toEqual(slots(source))
    }
  })
  it('reorders placeholders without recursively translating or interpreting user text', () => {
    expect(translate('en', '已为像素图 {0} 新增关卡 {1}。', '动物{1}', 7))
      .toBe('Added level 7 for image 动物{1}.')
    expect(translate('zh-CN', '已为像素图 {0} 新增关卡 {1}。', '动物{1}', 7))
      .toBe('已为像素图 动物{1} 新增关卡 7。')
  })
  it('localizes defaults only in display labels and preserves custom theme names', () => {
    setLanguage('en')
    const original = structuredClone(DEFAULT_THEME_CONFIG)
    expect(themeDisplayName(DEFAULT_THEME_CONFIG[0])).toBe('Animals')
    expect(themeDisplayName({ theme: 'custom', themeName: '动物', sortOrder: 1 })).toBe('动物')
    expect(themeDisplayName({ theme: 'animal', themeName: '我的动物', sortOrder: 1 })).toBe('我的动物')
    expect(DEFAULT_THEME_CONFIG).toEqual(original)
  })
  it('keeps exported configuration values identical in both languages', () => {
    const input = [{ id: 1, name: '动物', gridWidthHeight: [2, 1], pixelWidthHeight: [20, 10],
      localPixelResource: ['E85D75'], pixelMatrix: [[0, -2]], initPixel: [[0, -2]], beadCount: 1 }]
    setLanguage('en')
    const en = normalizePixelConfigItems(input)
    setLanguage('zh-CN')
    expect(normalizePixelConfigItems(input)).toEqual(en)
    expect(en[0].name).toBe('动物')
  })
  it('localizes validation failures', () => {
    setLanguage('en')
    expect(() => parseGridDataFile('{"width":0,"height":0}')).toThrow('Invalid width/height')
    setLanguage('zh-CN')
    expect(() => parseGridDataFile('{"width":0,"height":0}')).toThrow('width/height 非法')
  })
  it('preserves URL context when choosing a language and allows cancelling', () => {
    window.history.replaceState(null, '', '/?seed=7&lang=en#preview')
    expect(languageUrl('zh-CN')).toContain('?seed=7&lang=zh-CN#preview')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    changeLanguage('zh-CN')
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('unsaved edits'))
    expect(getLocale()).toBe('en')
    expect(window.localStorage.getItem(LOCALE_KEY)).toBeNull()
    expect(t('保存草稿')).toBe('Save draft')
  })
})
