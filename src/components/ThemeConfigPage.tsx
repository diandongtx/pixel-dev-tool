import { themeDisplayName } from '../utils/themeConfig'
import { t } from '../i18n'
import React, { useEffect, useState } from 'react'
import type { ThemeConfigItem } from '../types/themeConfig'
import {
  readLevelWorkspaceThemeConfig,
  saveLevelWorkspaceThemeConfig
} from '../utils/levelWorkspaceClient'
import { sortThemeConfig } from '../utils/themeConfig'

const INTERNAL_THEME_CONFIG_PATH = 'data/level-workspace/config/themeconfig.json'
const THEME_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : t("未知错误")

const createEmptyTheme = (items: ThemeConfigItem[]): ThemeConfigItem => ({
  theme: '',
  themeName: '',
  sortOrder: Math.max(0, ...items.map((item) => item.sortOrder)) + 1
})

export const ThemeConfigPage: React.FC = () => {
  const [items, setItems] = useState<ThemeConfigItem[]>([])
  const [draft, setDraft] = useState<ThemeConfigItem>(() => createEmptyTheme([]))
  const [statusMessage, setStatusMessage] = useState(t("加载内部 themeconfig 后可编辑主题列表。"))

  const loadThemeConfig = async () => {
    try {
      const themes = sortThemeConfig(await readLevelWorkspaceThemeConfig())
      setItems(themes)
      setDraft(createEmptyTheme(themes))
      setStatusMessage(t("已加载内部 themeconfig，共 {0} 个主题。", themes.length))
    } catch (error: unknown) {
      setStatusMessage(t("加载内部 themeconfig 失败：{0}", getErrorMessage(error)))
    }
  }

  useEffect(() => {
    void loadThemeConfig()
  }, [])

  const validateTheme = (item: ThemeConfigItem, existingItems: ThemeConfigItem[], originalKey?: string): string | null => {
    if (!THEME_KEY_PATTERN.test(item.theme)) {
      return t("主题 key 必须使用英文小写、数字或连字符，且不能以连字符开头或结尾。")
    }
    if (!item.themeName.trim()) {
      return t("主题显示名不能为空。")
    }
    if (!Number.isInteger(item.sortOrder)) {
      return t("排序必须是整数。")
    }
    if (existingItems.some((existing) => existing.theme === item.theme && existing.theme !== originalKey)) {
      return t("主题 key {0} 已存在。", item.theme)
    }

    return null
  }

  const updateItem = <K extends keyof ThemeConfigItem>(
    theme: string,
    key: K,
    value: ThemeConfigItem[K]
  ) => {
    setItems((previous) => sortThemeConfig(previous.map((item) => (
      item.theme === theme
        ? {
            ...item,
            [key]: value
          }
        : item
    ))))
  }

  const handleAddTheme = () => {
    const nextTheme: ThemeConfigItem = {
      theme: draft.theme.trim(),
      themeName: draft.themeName.trim(),
      sortOrder: draft.sortOrder
    }
    const message = validateTheme(nextTheme, items)
    if (message) {
      setStatusMessage(message)
      return
    }

    const nextItems = sortThemeConfig([...items, nextTheme])
    setItems(nextItems)
    setDraft(createEmptyTheme(nextItems))
    setStatusMessage(t("已新增主题 {0}，保存后写入 {1}。", nextTheme.theme, INTERNAL_THEME_CONFIG_PATH))
  }

  const handleDeleteTheme = (theme: string) => {
    const confirmed = window.confirm(t("确认删除主题 {0} 吗？已标该主题的图片不会被回溯修改。", theme))
    if (!confirmed) return

    setItems((previous) => previous.filter((item) => item.theme !== theme))
    setStatusMessage(t("已从主题列表移除 {0}，已标该 key 的图片不受影响。", theme))
  }

  const handleSave = async () => {
    for (const item of items) {
      const message = validateTheme(item, items, item.theme)
      if (message) {
        setStatusMessage(message)
        return
      }
    }

    try {
      const sortedItems = sortThemeConfig(items.map((item) => ({
        theme: item.theme.trim(),
        themeName: item.themeName.trim(),
        sortOrder: item.sortOrder
      })))
      await saveLevelWorkspaceThemeConfig(sortedItems)
      setItems(sortedItems)
      setStatusMessage(t("已保存内部 themeconfig：{0}，共 {1} 个主题。", INTERNAL_THEME_CONFIG_PATH, sortedItems.length))
    } catch (error: unknown) {
      setStatusMessage(t("保存内部 themeconfig 失败：{0}", getErrorMessage(error)))
    }
  }

  return (
    <div className="pixel-config-page">
      <div className="pixel-config-toolbar">
        <button
          type="button"
          onClick={() => {
            void loadThemeConfig()
          }}
        >{t("加载内部 themeconfig")}</button>
        <button
          type="button"
          onClick={() => {
            void handleSave()
          }}
          disabled={items.length === 0}
        >{t("保存内部 themeconfig")}</button>
      </div>

      <div className="pixel-config-status">{statusMessage}</div>

      <div className="level-config-summary">
        <div>{t("配置路径：")}{INTERNAL_THEME_CONFIG_PATH}</div>
        <div>{t("主题数量：")}{items.length}</div>
      </div>

      <div className="pixel-config-card">
        <div className="pixel-config-card-header">
          <div className="pixel-config-card-title">
            <span>{t("新增主题")}</span>
          </div>
          <button type="button" onClick={handleAddTheme}>{t("新增")}</button>
        </div>
        <div className="pixel-config-form-grid">
          <label>
            theme key
            <input
              type="text"
              value={draft.theme}
              onChange={(event) => setDraft((previous) => ({
                ...previous,
                theme: event.target.value
              }))}
            />
          </label>
          <label>
            themeName
            <input
              type="text"
              value={draft.themeName}
              onChange={(event) => setDraft((previous) => ({
                ...previous,
                themeName: event.target.value
              }))}
            />
          </label>
          <label>
            sortOrder
            <input
              type="number"
              value={draft.sortOrder}
              onChange={(event) => setDraft((previous) => ({
                ...previous,
                sortOrder: Number.parseInt(event.target.value, 10) || previous.sortOrder
              }))}
            />
          </label>
        </div>
      </div>

      <div className="pixel-config-list">
        {items.map((item) => (
          <div key={item.theme} className="pixel-config-card">
            <div className="pixel-config-card-header">
              <div className="pixel-config-card-title">
                <span>{item.theme}</span>
                <span>{themeDisplayName(item)}</span>
              </div>
              <button type="button" onClick={() => handleDeleteTheme(item.theme)}>{t("删除")}</button>
            </div>
            <div className="pixel-config-form-grid">
              <label>
                theme key
                <input type="text" value={item.theme} disabled />
              </label>
              <label>
                themeName
                <input
                  type="text"
                  value={item.themeName}
                  onChange={(event) => updateItem(item.theme, 'themeName', event.target.value)}
                />
              </label>
              <label>
                sortOrder
                <input
                  type="number"
                  value={item.sortOrder}
                  onChange={(event) => {
                    const nextValue = Number.parseInt(event.target.value, 10)
                    if (Number.isNaN(nextValue)) return
                    updateItem(item.theme, 'sortOrder', nextValue)
                  }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
