import { themeDisplayName } from '../utils/themeConfig'
import { t } from '../i18n'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { PixelConfigItem } from '../types/pixelConfig'
import { GridMatrixPreview } from './GridMatrixPreview'
import {
  buildPixelConfigFilename,
  buildPixelConfigFromGridPair,
  deriveAssetBaseName,
  downloadTextFile,
  inferNextPixelConfigId,
  parseGridDataFile,
  parsePixelConfigFile,
  serializePixelConfigFile,
  stripFileExtension
} from '../utils/configIO'
import {
  getLevelWorkspaceSummary,
  readLevelDraft,
  readLevelWorkspacePixelConfig,
  readLevelWorkspaceThemeConfig,
  saveLevelWorkspacePixelConfig
} from '../utils/levelWorkspaceClient'
import { countDistinctColors } from '../utils/levelAssessment'
import { sortThemeConfig } from '../utils/themeConfig'
import type { ThemeConfigItem } from '../types/themeConfig'

interface PixelConfigPageProps {
  previewGridSize?: number
  pixelConfigs: PixelConfigItem[]
  onPixelConfigsChange: (items: PixelConfigItem[]) => void
  loadedConfigName: string
  onLoadedConfigNameChange: (fileName: string) => void
}

type BrowserFile = File & {
  webkitRelativePath?: string
}

interface SourcePairCandidate {
  baseName: string
  mapFile: File | null
  pointFile: File | null
  mapRelativePath: string | null
  pointRelativePath: string | null
}

interface ParsedDraftFolder {
  folderName: string
  pixelConfig: PixelConfigItem
}

const SOURCE_KIND_SUFFIXES = [
  { kind: 'map' as const, suffix: '_map' },
  { kind: 'point' as const, suffix: '_point' }
]

const sortPixelConfigs = (items: PixelConfigItem[]): PixelConfigItem[] =>
  [...items].sort((left, right) => left.id - right.id || left.name.localeCompare(right.name))

const INTERNAL_PIXEL_CONFIG_PATH = 'data/level-workspace/config/pixelconfig.json'
const INTERNAL_DRAFTS_PATH = 'data/level-workspace/drafts'

const QUALITY_OPTIONS = [
  { value: 1, label: t("1 主线基础") },
  { value: 2, label: t("2 普通") },
  { value: 3, label: t("3 白银") },
  { value: 4, label: t("4 黄金") },
  { value: 5, label: t("5 铂金") }
]

const DIFFICULTY_OPTIONS = [
  { value: 1, label: t("1 容易") },
  { value: 2, label: t("2 普通") },
  { value: 3, label: t("3 困难") },
  { value: 4, label: t("4 专家") },
  { value: 5, label: t("5 大师") }
]

const clonePixelConfigItem = (item: PixelConfigItem): PixelConfigItem => ({
  ...item,
  gridWidthHeight: [...item.gridWidthHeight],
  pixelWidthHeight: [...item.pixelWidthHeight],
  localPixelResource: [...item.localPixelResource],
  pixelMatrix: item.pixelMatrix.map((row) => [...row]),
  initPixel: item.initPixel.map((row) => [...row])
})

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : t("未知错误")

const getSourceMeta = (file: BrowserFile): { kind: 'map' | 'point', baseName: string } | null => {
  const nameWithoutExtension = stripFileExtension(file.name)
  for (const entry of SOURCE_KIND_SUFFIXES) {
    if (nameWithoutExtension.endsWith(entry.suffix)) {
      return {
        kind: entry.kind,
        baseName: nameWithoutExtension.slice(0, -entry.suffix.length)
      }
    }
  }
  return null
}

const buildCandidateKey = (file: File | null, fallbackBaseName: string): string => {
  if (!file) return fallbackBaseName
  return `${fallbackBaseName}:${file.name}:${file.lastModified}`
}

const validateDraftPixelConfig = (pixelConfig: unknown, folderName: string): PixelConfigItem => {
  if (pixelConfig === undefined) {
    throw new Error(`draft ${folderName} missing pixelConfig`)
  }

  const [validatedPixelConfig] = parsePixelConfigFile(JSON.stringify([pixelConfig]))
  return clonePixelConfigItem(validatedPixelConfig)
}

const ensureUniqueSelectedDraftNames = (drafts: ParsedDraftFolder[]): void => {
  const seenNames = new Set<string>()
  const duplicateNames = new Set<string>()

  for (const draft of drafts) {
    if (seenNames.has(draft.pixelConfig.name)) {
      duplicateNames.add(draft.pixelConfig.name)
    }
    seenNames.add(draft.pixelConfig.name)
  }

  if (duplicateNames.size > 0) {
    throw new Error(t("选择的草稿中存在重复 pixelconfig 名称：{0}", Array.from(duplicateNames).join('、')))
  }
}

export const PixelConfigPage: React.FC<PixelConfigPageProps> = ({
  previewGridSize = 8,
  pixelConfigs,
  onPixelConfigsChange,
  loadedConfigName,
  onLoadedConfigNameChange
}) => {
  const [sourceCandidates, setSourceCandidates] = useState<SourcePairCandidate[]>([])
  const [statusMessage, setStatusMessage] = useState(t("请先导入 pixelconfig 文件，或扫描来源目录生成像素图记录。"))
  const [workspaceDraftNames, setWorkspaceDraftNames] = useState<string[]>([])
  const [themeConfigs, setThemeConfigs] = useState<ThemeConfigItem[]>([])
  const [isDraftPickerOpen, setIsDraftPickerOpen] = useState(false)
  const [selectedDraftNames, setSelectedDraftNames] = useState<string[]>([])
  const [selectedCandidateKey, setSelectedCandidateKey] = useState<string>('')
  const sourceDirectoryInputRef = useRef<HTMLInputElement>(null)
  const configFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = sourceDirectoryInputRef.current
    if (!input) return
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    let isActive = true

    const loadInitialData = async () => {
      try {
        const [summary, themes] = await Promise.all([
          getLevelWorkspaceSummary(),
          readLevelWorkspaceThemeConfig()
        ])
        if (!isActive) return

        setWorkspaceDraftNames(summary.drafts)
        setThemeConfigs(sortThemeConfig(themes))
      } catch (error: unknown) {
        if (!isActive) return
        setStatusMessage(t("刷新内部草稿或主题列表失败：{0}", getErrorMessage(error)))
      }
    }

    void loadInitialData()

    return () => {
      isActive = false
    }
  }, [])

  const selectedCandidate = useMemo(
    () => sourceCandidates.find((candidate) => (
      buildCandidateKey(candidate.mapFile ?? candidate.pointFile, candidate.baseName) === selectedCandidateKey
    )) ?? null,
    [selectedCandidateKey, sourceCandidates]
  )

  const refreshWorkspaceDrafts = async () => {
    try {
      const [summary, themes] = await Promise.all([
        getLevelWorkspaceSummary(),
        readLevelWorkspaceThemeConfig()
      ])
      setWorkspaceDraftNames(summary.drafts)
      setThemeConfigs(sortThemeConfig(themes))
      setStatusMessage(t("已刷新内部草稿与主题列表，共 {0} 个草稿。", summary.drafts.length))
    } catch (error: unknown) {
      setStatusMessage(t("刷新内部草稿或主题列表失败：{0}", getErrorMessage(error)))
    }
  }

  const handleLoadInternalPixelConfig = async () => {
    try {
      const items = sortPixelConfigs(await readLevelWorkspacePixelConfig())
      onPixelConfigsChange(items)
      onLoadedConfigNameChange(t("内部 pixelconfig"))
      setStatusMessage(t("已加载内部 pixelconfig，共 {0} 条像素图记录。", items.length))
    } catch (error: unknown) {
      setStatusMessage(t("加载内部 pixelconfig 失败：{0}", getErrorMessage(error)))
    }
  }

  const saveInternalPixelConfigs = async (
    items: PixelConfigItem[],
    successMessage: string
  ) => {
    const sortedItems = sortPixelConfigs(items)
    await saveLevelWorkspacePixelConfig(sortedItems)
    onPixelConfigsChange(sortedItems)
    onLoadedConfigNameChange(t("内部 pixelconfig"))
    setStatusMessage(successMessage)
  }

  const handleSaveInternalPixelConfig = async () => {
    try {
      await saveInternalPixelConfigs(
        pixelConfigs,
        t("已保存内部 pixelconfig：{0}，共 {1} 条像素图记录。", INTERNAL_PIXEL_CONFIG_PATH, pixelConfigs.length)
      )
    } catch (error: unknown) {
      setStatusMessage(t("保存内部 pixelconfig 失败：{0}", getErrorMessage(error)))
    }
  }

  const openDraftPicker = async () => {
    try {
      const summary = await getLevelWorkspaceSummary()
      setWorkspaceDraftNames(summary.drafts)
      setSelectedDraftNames((previous) =>
        previous.filter((draftName) => summary.drafts.includes(draftName))
      )
      setIsDraftPickerOpen(true)
    } catch (error: unknown) {
      setStatusMessage(t("刷新内部草稿列表失败：{0}", getErrorMessage(error)))
    }
  }

  const toggleSelectedDraftName = (draftName: string) => {
    setSelectedDraftNames((previous) =>
      previous.includes(draftName)
        ? previous.filter((name) => name !== draftName)
        : [...previous, draftName]
    )
  }

  const handleImportSelectedDrafts = async () => {
    if (selectedDraftNames.length === 0) {
      setStatusMessage(t("请先选择至少一个内部草稿。"))
      return
    }

    try {
      const parsedDrafts = await Promise.all(selectedDraftNames.map(async (draftName) => {
        const draft = await readLevelDraft(draftName)
        return {
          folderName: draftName,
          pixelConfig: validateDraftPixelConfig(
            draft.pixelConfig,
            draftName
          )
        }
      }))
      ensureUniqueSelectedDraftNames(parsedDrafts)
      const latestInternalConfigs = sortPixelConfigs(await readLevelWorkspacePixelConfig())

      const overwriteNames = parsedDrafts
        .map((draft) => draft.pixelConfig.name)
        .filter((name) => latestInternalConfigs.some((item) => item.name === name))

      if (overwriteNames.length > 0) {
        const shouldReplace = window.confirm(
          t("已存在同名 pixelconfig，将覆盖以下记录：{0}\n是否继续？", overwriteNames.join('\u3001'))
        )
        if (!shouldReplace) {
          setStatusMessage(t("已取消加入草稿：{0}。", overwriteNames.join('\u3001')))
          return
        }
      }

      const nextConfigs = latestInternalConfigs.map(clonePixelConfigItem)
      for (const draft of parsedDrafts) {
        const nextItem = clonePixelConfigItem(draft.pixelConfig)
        const existingIndex = nextConfigs.findIndex((item) => item.name === nextItem.name)

        if (existingIndex >= 0) {
          nextItem.id = nextConfigs[existingIndex].id
          nextConfigs.splice(existingIndex, 1, nextItem)
        } else if (nextConfigs.some((item) => item.id === nextItem.id)) {
          nextItem.id = inferNextPixelConfigId(nextConfigs)
          nextConfigs.push(nextItem)
        } else {
          nextConfigs.push(nextItem)
        }
      }

      await saveInternalPixelConfigs(
        nextConfigs,
        t("已将 {0} 个草稿加入内部 pixelconfig：{1}。", parsedDrafts.length, INTERNAL_PIXEL_CONFIG_PATH)
      )
      setIsDraftPickerOpen(false)
      setSelectedDraftNames([])
    } catch (error: unknown) {
      setStatusMessage(t("草稿格式错误：{0}", getErrorMessage(error)))
    }
  }
  const handleConfigImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const items = parsePixelConfigFile(await file.text())
      onPixelConfigsChange(sortPixelConfigs(items))
      onLoadedConfigNameChange(file.name)
      setStatusMessage(t("已加载 {0}，共 {1} 条像素图记录。", file.name, items.length))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("未知错误")
      setStatusMessage(t("加载 pixelconfig 失败：{0}", message))
    } finally {
      event.target.value = ''
    }
  }

  const handleSourceDirectoryImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []) as BrowserFile[]
    const nextCandidates = new Map<string, SourcePairCandidate>()

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.json')) {
        continue
      }

      const meta = getSourceMeta(file)
      if (!meta) {
        continue
      }

      const existing = nextCandidates.get(meta.baseName) ?? {
        baseName: meta.baseName,
        mapFile: null,
        pointFile: null,
        mapRelativePath: null,
        pointRelativePath: null
      }

      if (meta.kind === 'map') {
        existing.mapFile = file
        existing.mapRelativePath = file.webkitRelativePath ?? file.name
      } else {
        existing.pointFile = file
        existing.pointRelativePath = file.webkitRelativePath ?? file.name
      }

      nextCandidates.set(meta.baseName, existing)
    }

    const sortedCandidates = Array.from(nextCandidates.values()).sort((left, right) =>
      left.baseName.localeCompare(right.baseName)
    )

    setSourceCandidates(sortedCandidates)
    if (sortedCandidates.length > 0) {
      setSelectedCandidateKey(buildCandidateKey(sortedCandidates[0].mapFile ?? sortedCandidates[0].pointFile, sortedCandidates[0].baseName))
    } else {
      setSelectedCandidateKey('')
    }

    const pairCount = sortedCandidates.filter((item) => item.mapFile && item.pointFile).length
    setStatusMessage(t("已扫描来源目录，共识别 {0} 组候选，完整配对 {1} 组。", sortedCandidates.length, pairCount))
    event.target.value = ''
  }

  const handleCreateFromCandidate = async () => {
    if (!selectedCandidate || !selectedCandidate.mapFile || !selectedCandidate.pointFile) {
      setStatusMessage(t("当前候选缺少 map 或 point 文件，无法生成像素图记录。"))
      return
    }

    try {
      const [mapText, pointText] = await Promise.all([
        selectedCandidate.mapFile.text(),
        selectedCandidate.pointFile.text()
      ])
      const mapGrid = parseGridDataFile(mapText, deriveAssetBaseName(selectedCandidate.mapFile.name))
      const pointGrid = parseGridDataFile(pointText, deriveAssetBaseName(selectedCandidate.pointFile.name))
      const nextId = inferNextPixelConfigId(pixelConfigs)
      const nextItem = buildPixelConfigFromGridPair(mapGrid, pointGrid, nextId)

      const existingIndex = pixelConfigs.findIndex((item) => item.name === nextItem.name)
      const nextConfigs = [...pixelConfigs]
      if (existingIndex >= 0) {
        const shouldReplace = window.confirm(t("已存在名称为 {0} 的像素图记录，是否替换？", nextItem.name))
        if (!shouldReplace) {
          setStatusMessage(t("已取消导入 {0}。", nextItem.name))
          return
        }
        nextItem.id = nextConfigs[existingIndex].id
        nextConfigs.splice(existingIndex, 1, nextItem)
      } else {
        nextConfigs.push(nextItem)
      }

      onPixelConfigsChange(sortPixelConfigs(nextConfigs))
      setStatusMessage(t("已从 {0} 的 map/point 配对生成像素图记录。", nextItem.name))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("未知错误")
      setStatusMessage(t("生成像素图记录失败：{0}", message))
    }
  }

  const handleExportPixelConfig = () => {
    const content = serializePixelConfigFile(sortPixelConfigs(pixelConfigs))
    downloadTextFile(content, buildPixelConfigFilename())
    setStatusMessage(t("已导出 {0}。", buildPixelConfigFilename()))
  }

  const updatePixelConfig = <K extends keyof PixelConfigItem>(
    targetId: number,
    key: K,
    value: PixelConfigItem[K]
  ) => {
    onPixelConfigsChange(sortPixelConfigs(pixelConfigs.map((item) => {
      if (item.id !== targetId) return item
      return {
        ...item,
        [key]: value
      }
    })))
  }

  const themeOptionsForItem = (item: PixelConfigItem): ThemeConfigItem[] => {
    if (!item.theme || themeConfigs.some((theme) => theme.theme === item.theme)) {
      return themeConfigs
    }

    return [
      ...themeConfigs,
      { theme: item.theme, themeName: t("{0}（未登记）", item.theme), sortOrder: Number.MAX_SAFE_INTEGER }
    ]
  }

  const handleDeletePixelConfig = async (targetId: number) => {
    const target = pixelConfigs.find((item) => item.id === targetId)
    if (!target) return
    const shouldDelete = window.confirm(t("确认删除像素图 {0} 吗？", target.name))
    if (!shouldDelete) return

    try {
      const nextConfigs = pixelConfigs.filter((item) => item.id !== targetId)
      await saveInternalPixelConfigs(
        nextConfigs,
        t("已从内部 pixelconfig 移除像素图 {0}：{1}。", target.name, INTERNAL_PIXEL_CONFIG_PATH)
      )
    } catch (error: unknown) {
      setStatusMessage(t("移除像素图失败：{0}", getErrorMessage(error)))
    }
  }

  return (
    <div className="pixel-config-page">
      <div className="pixel-config-toolbar">
        <input
          ref={configFileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleConfigImport}
        />
        <input
          ref={sourceDirectoryInputRef}
          type="file"
          multiple
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleSourceDirectoryImport}
        />
        <button type="button" onClick={() => configFileInputRef.current?.click()}>{t("导入 pixelconfig")}</button>
        <button
          type="button"
          data-testid="load-internal-pixelconfig"
          onClick={() => {
            void handleLoadInternalPixelConfig()
          }}
        >{t("加载内部 pixelconfig")}</button>
        <button
          type="button"
          onClick={() => {
            void refreshWorkspaceDrafts()
          }}
        >{t("刷新草稿列表")}</button>
        <button
          type="button"
          data-testid="add-draft-to-pixelconfig"
          onClick={() => {
            void openDraftPicker()
          }}
        >{t("从草稿加入 pixelconfig")}</button>
        <button
          type="button"
          onClick={() => {
            void handleSaveInternalPixelConfig()
          }}
        >{t("保存内部 pixelconfig")}</button>
        <button type="button" onClick={() => sourceDirectoryInputRef.current?.click()}>{t("扫描来源目录")}</button>
        <button type="button" onClick={handleCreateFromCandidate} disabled={!selectedCandidate}>{t("从当前候选生成像素图")}</button>
        <button type="button" onClick={handleExportPixelConfig} disabled={pixelConfigs.length === 0}>{t("导出 pixelconfig")}</button>
      </div>

      <div className="pixel-config-status">{statusMessage}</div>

      {isDraftPickerOpen && (
        <div className="pixel-config-draft-picker" data-testid="draft-picker-dialog">
          <div className="pixel-config-draft-picker-panel">
            <div className="pixel-config-draft-picker-header">
              <h3>{t("选择内部草稿")}</h3>
              <button
                type="button"
                onClick={() => setIsDraftPickerOpen(false)}
              >{t("关闭")}</button>
            </div>
            <div className="pixel-config-sidebar-tip">{t("默认路径：")}{INTERNAL_DRAFTS_PATH}
            </div>
            <div className="pixel-config-candidate-list">
              {workspaceDraftNames.length === 0 && (
                <div className="pixel-config-empty">{t("暂无内部草稿。")}</div>
              )}
              {workspaceDraftNames.map((draftName) => (
                <label key={draftName} className="pixel-config-candidate">
                  <input
                    type="checkbox"
                    data-testid={`draft-checkbox-${draftName}`}
                    checked={selectedDraftNames.includes(draftName)}
                    onChange={() => toggleSelectedDraftName(draftName)}
                  />
                  <span>{draftName}</span>
                </label>
              ))}
            </div>
            <div className="pixel-config-draft-picker-actions">
              <button
                type="button"
                onClick={() => setSelectedDraftNames(workspaceDraftNames)}
                disabled={workspaceDraftNames.length === 0}
              >{t("全选")}</button>
              <button
                type="button"
                onClick={() => setSelectedDraftNames([])}
                disabled={selectedDraftNames.length === 0}
              >{t("清空")}</button>
              <button
                type="button"
                data-testid="confirm-draft-import"
                onClick={() => {
                  void handleImportSelectedDrafts()
                }}
                disabled={selectedDraftNames.length === 0}
              >{t("加入 pixelconfig")}</button>
            </div>
          </div>
        </div>
      )}

      <div className="pixel-config-layout">
        <div className="pixel-config-sidebar">
          <h3>{t("内部草稿")}</h3>
          <div className="pixel-config-sidebar-tip">{t("这里读取 data/level-workspace/drafts 中已经保存的关卡草稿。")}</div>
          {workspaceDraftNames.length === 0 ? (
            <div className="pixel-config-empty">{t("暂无内部草稿，请先在像素化页面保存草稿。")}</div>
          ) : (
            <div className="pixel-config-candidate-list">
              {workspaceDraftNames.map((draftName) => (
                <div key={draftName} className="pixel-config-candidate">
                  <span>{draftName}</span>
                </div>
              ))}
            </div>
          )}
          <h3>{t("来源候选")}</h3>
          <div className="pixel-config-sidebar-tip">{t("扫描后会按 `[图片名]_map.json` 和 `[图片名]_point.json` 自动配对。")}</div>
          <div className="pixel-config-candidate-list">
            {sourceCandidates.length === 0 && (
              <div className="pixel-config-empty">{t("暂无来源候选，请先扫描目录。")}</div>
            )}
            {sourceCandidates.map((candidate) => {
              const candidateKey = buildCandidateKey(candidate.mapFile ?? candidate.pointFile, candidate.baseName)
              const ready = Boolean(candidate.mapFile && candidate.pointFile)
              return (
                <button
                  type="button"
                  key={candidateKey}
                  className={`pixel-config-candidate ${selectedCandidateKey === candidateKey ? 'active' : ''}`}
                  onClick={() => setSelectedCandidateKey(candidateKey)}
                >
                  <span>{candidate.baseName}</span>
                  <span className={ready ? 'ready' : 'missing'}>
                    {ready ? t("已配对") : t("缺文件")}
                  </span>
                </button>
              )
            })}
          </div>
          {selectedCandidate && (
            <div className="pixel-config-candidate-detail">
              <div><strong>map:</strong> {selectedCandidate.mapRelativePath ?? t("未找到")}</div>
              <div><strong>point:</strong> {selectedCandidate.pointRelativePath ?? t("未找到")}</div>
            </div>
          )}
        </div>

        <div className="pixel-config-main">
          <div className="pixel-config-summary">
            <div>{t("当前配置文件：")}{loadedConfigName}</div>
            <div>{t("像素图数量：")}{pixelConfigs.length}</div>
            <div>{t("预览说明：矩阵预览按 localPixelResource 真实颜色显示；颜色索引为负（空槽/图外）的格子保持透明。")}</div>
            <div>{t("预览格子尺寸：")}{previewGridSize}px</div>
          </div>

          {pixelConfigs.length === 0 && (
            <div className="pixel-config-empty-main">{t("尚未加载或创建像素图记录。")}</div>
          )}

          <div className="pixel-config-list">
            {pixelConfigs.map((item) => (
              <div key={item.id} className="pixel-config-card">
                <div className="pixel-config-card-header">
                  <div className="pixel-config-card-title">
                    <span>#{item.id}</span>
                    <span>{item.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeletePixelConfig(item.id)
                    }}
                  >{t("删除")}</button>
                </div>

                <div className="pixel-config-form-grid">
                  <label>
                    ID
                    <input
                      type="number"
                      value={item.id}
                      onChange={(event) => {
                        const nextId = Number.parseInt(event.target.value, 10)
                        if (Number.isNaN(nextId)) return
                        updatePixelConfig(item.id, 'id', nextId)
                      }}
                    />
                  </label>
                  <label>{t("名称")}<input
                      type="text"
                      value={item.name}
                      onChange={(event) => updatePixelConfig(item.id, 'name', event.target.value)}
                    />
                  </label>
                  <label>{t("grid 宽")}<input
                      type="number"
                      value={item.gridWidthHeight[0]}
                      onChange={(event) => {
                        const nextWidth = Number.parseInt(event.target.value, 10)
                        if (Number.isNaN(nextWidth)) return
                        updatePixelConfig(item.id, 'gridWidthHeight', [nextWidth, item.gridWidthHeight[1]])
                      }}
                    />
                  </label>
                  <label>{t("grid 高")}<input
                      type="number"
                      value={item.gridWidthHeight[1]}
                      onChange={(event) => {
                        const nextHeight = Number.parseInt(event.target.value, 10)
                        if (Number.isNaN(nextHeight)) return
                        updatePixelConfig(item.id, 'gridWidthHeight', [item.gridWidthHeight[0], nextHeight])
                      }}
                    />
                  </label>
                  <label>{t("pixel 宽")}<input
                      type="number"
                      value={item.pixelWidthHeight[0]}
                      onChange={(event) => {
                        const nextWidth = Number.parseInt(event.target.value, 10)
                        if (Number.isNaN(nextWidth)) return
                        updatePixelConfig(item.id, 'pixelWidthHeight', [nextWidth, item.pixelWidthHeight[1]])
                      }}
                    />
                  </label>
                  <label>{t("pixel 高")}<input
                      type="number"
                      value={item.pixelWidthHeight[1]}
                      onChange={(event) => {
                        const nextHeight = Number.parseInt(event.target.value, 10)
                        if (Number.isNaN(nextHeight)) return
                        updatePixelConfig(item.id, 'pixelWidthHeight', [item.pixelWidthHeight[0], nextHeight])
                      }}
                    />
                  </label>
                  <label>{t("豆子数量")}<input
                      data-testid={`pixel-bead-count-${item.id}`}
                      type="number"
                      value={item.beadCount}
                      disabled
                    />
                  </label>
                  <label>{t("颜色数量")}<input
                      data-testid={`pixel-color-count-${item.id}`}
                      type="number"
                      value={countDistinctColors([item.pixelMatrix])}
                      disabled
                    />
                  </label>
                  <label>{t("主题")}<select
                      data-testid={`pixel-theme-${item.id}`}
                      value={item.theme ?? ''}
                      onChange={(event) => updatePixelConfig(
                        item.id,
                        'theme',
                        event.target.value || undefined
                      )}
                    >
                      <option value="">{t("未设置")}</option>
                      {themeOptionsForItem(item).map((theme) => (
                        <option key={theme.theme} value={theme.theme}>
                          {themeDisplayName(theme)} ({theme.theme})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>{t("难度")}<select
                      data-testid={`pixel-difficulty-${item.id}`}
                      value={item.difficulty ?? 1}
                      onChange={(event) => updatePixelConfig(
                        item.id,
                        'difficulty',
                        Number.parseInt(event.target.value, 10)
                      )}
                    >
                      {DIFFICULTY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>{t("品质")}<select
                      data-testid={`pixel-quality-${item.id}`}
                      value={item.quality ?? 1}
                      onChange={(event) => updatePixelConfig(
                        item.id,
                        'quality',
                        Number.parseInt(event.target.value, 10)
                      )}
                    >
                      {QUALITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>{t("类型")}<select
                      data-testid={`pixel-image-type-${item.id}`}
                      value={item.imageType ?? 1}
                      onChange={(event) => updatePixelConfig(
                        item.id,
                        'imageType',
                        Number.parseInt(event.target.value, 10)
                      )}
                    >
                      <option value={1}>{t("1 主线")}</option>
                      <option value={2}>{t("2 套图")}</option>
                    </select>
                  </label>
                  <label>{t("套图 ID")}<input
                      data-testid={`pixel-album-id-${item.id}`}
                      type="text"
                      value={item.albumId ?? ''}
                      onChange={(event) => updatePixelConfig(
                        item.id,
                        'albumId',
                        event.target.value.trim() || null
                      )}
                    />
                  </label>
                </div>

                <label className="pixel-config-resource-field">
                  localPixelResource
                  <textarea
                    value={item.localPixelResource.join(', ')}
                    onChange={(event) => updatePixelConfig(
                      item.id,
                      'localPixelResource',
                      event.target.value
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean)
                    )}
                    rows={2}
                  />
                </label>

                <div className="pixel-config-preview-row">
                  <GridMatrixPreview title="pixelMatrix" matrix={item.pixelMatrix} gridSize={previewGridSize} localPixelResource={item.localPixelResource} />
                  <GridMatrixPreview title="initPixel" matrix={item.initPixel} gridSize={previewGridSize} localPixelResource={item.localPixelResource} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
