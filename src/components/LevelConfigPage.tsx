import React, { useEffect, useMemo, useRef, useState } from 'react'
import { GridMatrixPreview } from './GridMatrixPreview'
import type { ManagedLevelConfigItem as LevelConfigItem, LevelConfigItem as NumberedLevelConfigItem } from '../types/levelConfig'
import type { PixelConfigItem } from '../types/pixelConfig'
import { drawPixelMatrixThumbnail } from '../utils/pixelMatrixThumbnail'
import {
  buildLevelConfigFilename,
  buildPixelConfigFilename,
  deriveAssetBaseName,
  downloadTextFile,
  parseLevelConfigFile,
  normalizeDailyLevelConfigItems,
  isDailyLevelDate,
  parseGridDataFile,
  parsePixelConfigFile,
  serializeLevelConfigFile
} from '../utils/configIO'
import {
  appendLevel,
  deleteLevelAndShift,
  moveLevelId
} from '../utils/levelConfigOperations'
import {
  generateMainLevelReview,
  readLevelWorkspaceLevelConfig,
  readLevelWorkspacePixelConfig,
  readLevelWorkspaceThumbnails,
  saveLevelWorkspaceLevelConfig
} from '../utils/levelWorkspaceClient'

interface LevelConfigPageProps {
  levelType: number
  pageTitle: string
  pixelConfigs: PixelConfigItem[]
  onPixelConfigsChange: (items: PixelConfigItem[]) => void
  loadedPixelConfigName: string
  onLoadedPixelConfigNameChange: (fileName: string) => void
}

const DEFAULT_LEVEL_VALUES = {
  storageMaxSlots: 3,
  storageCols: 12,
  storageInitialSlots: 12,
  adUnlockIncrement: 12,
  initialTimeLimit: 180,
  adTimeIncrement: 180,
  reviveCount: 5
} as const

const DIFFICULTY_OPTIONS = [
  { value: 1, label: '1 容易' },
  { value: 2, label: '2 普通' },
  { value: 3, label: '3 困难' },
  { value: 4, label: '4 专家' },
  { value: 5, label: '5 大师' }
] as const

const formatOptionalText = (value: unknown): string =>
  value === undefined || value === null || value === '' ? '-' : String(value)

const formatPixelDifficulty = (value: unknown): string => {
  const difficulty = typeof value === 'number' && Number.isInteger(value) ? value : 1
  return DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.label ?? '1 容易'
}

const PixelMetadataSummary = ({
  pixelConfig,
  title
}: {
  pixelConfig: PixelConfigItem | null
  title: string
}) => (
  <div className="level-config-pixel-meta" data-testid="level-pixel-metadata">
    <div className="level-config-pixel-meta-title">{title}</div>
    {pixelConfig ? (
      <div className="level-config-pixel-meta-grid">
        <div>主题：{formatOptionalText(pixelConfig.theme)}</div>
        <div>品质：{formatOptionalText(pixelConfig.quality ?? 1)}</div>
        <div>图片类型：{formatOptionalText(pixelConfig.imageType ?? 1)}</div>
        <div>专辑：{formatOptionalText(pixelConfig.albumId)}</div>
        <div>难度：{formatPixelDifficulty(pixelConfig.difficulty)}</div>
        <div>豆子数量：{pixelConfig.beadCount}</div>
      </div>
    ) : (
      <div className="level-config-pixel-meta-empty">未选择像素图</div>
    )}
  </div>
)

const sortLevels = (items: LevelConfigItem[]): LevelConfigItem[] =>
  [...items].sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, { numeric: true }))

const numberedLevels = (items: LevelConfigItem[]): NumberedLevelConfigItem[] =>
  items.filter((item): item is NumberedLevelConfigItem => typeof item.id === 'number')

const LevelMatrixThumbnail = ({ pixelConfig }: { pixelConfig: PixelConfigItem }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    drawPixelMatrixThumbnail(canvasRef.current, pixelConfig.pixelMatrix, pixelConfig.localPixelResource, 1)
  }, [pixelConfig.pixelMatrix, pixelConfig.localPixelResource])

  return <canvas ref={canvasRef} role="img" aria-label={`${pixelConfig.name} 缩略图`} />
}

const sortPixelConfigs = (items: PixelConfigItem[]): PixelConfigItem[] =>
  [...items].sort((left, right) => left.id - right.id || left.name.localeCompare(right.name))

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '未知错误'

const buildInternalLevelConfigPath = (type: number): string =>
  `data/level-workspace/config/${buildLevelConfigFilename(type)}`

const buildDefaultLevelConfig = (pixelConfig: PixelConfigItem, type: number, id: number): LevelConfigItem => ({
  id,
  thumbnail: pixelConfig.name,
  type,
  difficulty: pixelConfig.difficulty ?? 1,
  pixelImageId: pixelConfig.id,
  widthHeight: [...pixelConfig.pixelWidthHeight] as [number, number],
  storageMaxSlots: DEFAULT_LEVEL_VALUES.storageMaxSlots,
  storageCols: DEFAULT_LEVEL_VALUES.storageCols,
  storageInitialSlots: DEFAULT_LEVEL_VALUES.storageInitialSlots,
  adUnlockIncrement: DEFAULT_LEVEL_VALUES.adUnlockIncrement,
  initialTimeLimit: DEFAULT_LEVEL_VALUES.initialTimeLimit,
  adTimeIncrement: DEFAULT_LEVEL_VALUES.adTimeIncrement,
  reviveCount: DEFAULT_LEVEL_VALUES.reviveCount,
  propConfigs: []
})

export const LevelConfigPage: React.FC<LevelConfigPageProps> = ({
  levelType,
  pageTitle,
  pixelConfigs,
  onPixelConfigsChange,
  loadedPixelConfigName,
  onLoadedPixelConfigNameChange
}) => {
  const isDaily = levelType === 2
  const [levels, setLevels] = useState<LevelConfigItem[]>([])
  const [statusMessage, setStatusMessage] = useState(`请先导入 ${buildPixelConfigFilename()} 与 ${buildLevelConfigFilename(levelType)}。`)
  const [selectedPixelId, setSelectedPixelId] = useState<number>(0)
  const [propConfigDrafts, setPropConfigDrafts] = useState<Record<string, string>>({})
  const [levelIdDrafts, setLevelIdDrafts] = useState<Record<string, string>>({})
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [openLevelIds, setOpenLevelIds] = useState<Record<string, boolean>>({})
  const [isGeneratingReview, setIsGeneratingReview] = useState(false)
  const levelIdDraftsRef = useRef<Record<string, string>>({})
  const mapImportInputRef = useRef<HTMLInputElement>(null)
  const pixelConfigInputRef = useRef<HTMLInputElement>(null)
  const levelConfigInputRef = useRef<HTMLInputElement>(null)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)

  const syncLevelIdDrafts = (items: LevelConfigItem[]) => {
    const nextDrafts = Object.fromEntries(items.map((item) => [item.id, String(item.id)]))
    levelIdDraftsRef.current = nextDrafts
    setLevelIdDrafts(nextDrafts)
  }

  const buildPropConfigDrafts = (items: LevelConfigItem[]) => Object.fromEntries(items.map((item) => [
    item.id,
    JSON.stringify(item.propConfigs, null, 2)
  ]))

  const syncPropConfigDrafts = (items: LevelConfigItem[]) => {
    setPropConfigDrafts(buildPropConfigDrafts(items))
  }

  const updateLevelIdDraft = (levelId: number | string, value: string) => {
    const nextDrafts = {
      ...levelIdDraftsRef.current,
      [levelId]: value
    }
    levelIdDraftsRef.current = nextDrafts
    setLevelIdDrafts(nextDrafts)
  }

  const loadInternalPixelConfig = async (): Promise<PixelConfigItem[] | null> => {
    try {
      const items = sortPixelConfigs(await readLevelWorkspacePixelConfig())
      onPixelConfigsChange(items)
      onLoadedPixelConfigNameChange('内部 pixelconfig')
      setStatusMessage(`已加载内部 pixelconfig，共 ${items.length} 条像素图记录。`)
      return items
    } catch (error: unknown) {
      setStatusMessage(`加载内部 pixelconfig 失败：${getErrorMessage(error)}`)
      return null
    }
  }

  useEffect(() => {
    const input = thumbnailInputRef.current
    if (!input) return
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    let isActive = true

    const load = async () => {
      try {
        const items = sortPixelConfigs(await readLevelWorkspacePixelConfig())
        if (!isActive) return
        onPixelConfigsChange(items)
        onLoadedPixelConfigNameChange('内部 pixelconfig')
      } catch (error: unknown) {
        if (!isActive) return
        setStatusMessage(`加载内部 pixelconfig 失败：${getErrorMessage(error)}`)
      }
    }

    void load()

    return () => {
      isActive = false
    }
  }, [onLoadedPixelConfigNameChange, onPixelConfigsChange])

  useEffect(() => {
    let isActive = true

    const loadInternalThumbnails = async () => {
      try {
        const thumbnails = await readLevelWorkspaceThumbnails()
        if (!isActive) return

        setThumbnailUrls((previous) => ({
          ...Object.fromEntries(thumbnails.map((item) => [item.name, item.dataUrl])),
          ...previous
        }))
      } catch (error: unknown) {
        if (!isActive) return
        setStatusMessage(`加载内部缩略图失败：${getErrorMessage(error)}`)
      }
    }

    void loadInternalThumbnails()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => () => {
    Object.values(thumbnailUrls).forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    })
  }, [thumbnailUrls])

  useEffect(() => {
    setSelectedPixelId((previous) => previous || pixelConfigs[0]?.id || 0)
  }, [pixelConfigs])

  const pixelConfigMap = useMemo(
    () => new Map(pixelConfigs.map((item) => [item.id, item])),
    [pixelConfigs]
  )

  const selectedPixelConfig = pixelConfigMap.get(selectedPixelId) ?? null

  const displayedLevels = useMemo(
    () => levels.map((level) => {
      const pixelConfig = pixelConfigMap.get(level.pixelImageId) ?? null
      const isOpen = Boolean(openLevelIds[level.id])
      return {
        level,
        pixelConfig,
        isOpen
      }
    }),
    [levels, pixelConfigMap, openLevelIds]
  )

  const normalizeLevelsForSave = (items: LevelConfigItem[]): LevelConfigItem[] =>
    sortLevels(items.map((item) => ({
      ...item,
      type: isDaily ? item.type : levelType,
      widthHeight: [...item.widthHeight] as [number, number],
      propConfigs: [...item.propConfigs]
    })))

  const applyPendingLevelIdDrafts = (
    sourceLevels: LevelConfigItem[],
    targetLevelId?: number | string
  ): { ok: true; items: LevelConfigItem[]; focusedId: number | string | null } | { ok: false; message: string } => {
    let nextLevels = sourceLevels
    let focusedId = targetLevelId ?? null
    const draftSource = levelIdDraftsRef.current
    const targetLevels = targetLevelId !== undefined
      ? sourceLevels.filter((item) => item.id === targetLevelId)
      : sortLevels(sourceLevels)

    for (const level of targetLevels) {
      const rawDraft = (draftSource[level.id] ?? String(level.id)).trim()
      if (isDaily) {
        if (!isDailyLevelDate(rawDraft)) {
          return { ok: false, message: `关卡 ${level.id} 的 ID 必须是有效日期（YYYY-MM-DD）。` }
        }
        if (rawDraft !== level.id && nextLevels.some((item) => item.id === rawDraft)) {
          return { ok: false, message: `日期 ${rawDraft} 已有每日挑战，请选择其他日期。` }
        }
        nextLevels = nextLevels.map((item) => item.id === level.id ? { ...item, id: rawDraft } : item)
        if (level.id === targetLevelId) focusedId = rawDraft
        continue
      }
      if (!/^\d+$/.test(rawDraft)) {
        return {
          ok: false,
          message: `关卡 ${level.id} 的 ID 必须是正整数。`
        }
      }

      const nextId = Number.parseInt(rawDraft, 10)
      if (!Number.isInteger(nextId) || nextId <= 0) {
        return {
          ok: false,
          message: `关卡 ${level.id} 的 ID 必须大于 0。`
        }
      }

      if (nextId === level.id) continue
      if (!nextLevels.some((item) => item.id === level.id)) continue

      const hasConflict = nextLevels.some((item) => item.id === nextId && item.id !== level.id)
      const moveMode = hasConflict
        ? window.confirm(`当前类型内已存在关卡 ID ${nextId}。确认=交换两个关卡 ID，取消=插入并顺移后续关卡。`)
          ? 'swap'
          : 'insert'
        : 'insert'

      nextLevels = moveLevelId(numberedLevels(nextLevels), Number(level.id), nextId, moveMode)
      if (level.id === targetLevelId) {
        focusedId = nextId
      }
    }

    return {
      ok: true,
      items: nextLevels,
      focusedId
    }
  }

  const handleLoadInternalLevelConfig = async () => {
    try {
      await loadInternalPixelConfig()
      const items = await readLevelWorkspaceLevelConfig(levelType)
      const filtered = normalizeLevelsForSave(items.filter((item) => isDaily || item.type === levelType))
      setLevels(filtered)
      syncLevelIdDrafts(filtered)
      syncPropConfigDrafts(filtered)
      setOpenLevelIds({})
      setStatusMessage(`已加载内部 ${buildLevelConfigFilename(levelType)}，共 ${filtered.length} 个关卡。`)
    } catch (error: unknown) {
      setStatusMessage(`加载内部 levelconfig 失败：${getErrorMessage(error)}`)
    }
  }

  const handleSaveInternalLevelConfig = async () => {
    try {
      const prepared = applyPendingLevelIdDrafts(levels)
      if (!prepared.ok) {
        setStatusMessage(prepared.message)
        return
      }

      const normalizedLevels = normalizeLevelsForSave(prepared.items)
      await saveLevelWorkspaceLevelConfig(levelType, normalizedLevels)
      setLevels(normalizedLevels)
      syncLevelIdDrafts(normalizedLevels)
      setStatusMessage(
        `已保存内部 levelconfig：${buildInternalLevelConfigPath(levelType)}，共 ${normalizedLevels.length} 个关卡。`
      )
    } catch (error: unknown) {
      setStatusMessage(`保存内部 levelconfig 失败：${getErrorMessage(error)}`)
    }
  }

  const handleGenerateMainLevelReview = async () => {
    const previewTab = window.open('', '_blank')
    setIsGeneratingReview(true)

    try {
      const prepared = applyPendingLevelIdDrafts(levels)
      if (!prepared.ok) {
        previewTab?.close()
        setStatusMessage(prepared.message)
        return
      }

      const snapshot = normalizeLevelsForSave(prepared.items)
      const result = await generateMainLevelReview({
        levels: numberedLevels(snapshot),
        pixelConfigs
      })
      setStatusMessage(
        `已更新网页阅览：${result.outputPath}，共 ${result.levelCount} 个关卡` +
        (result.warnings.length > 0 ? `，${result.warnings.length} 条资源提示。` : '。')
      )
      previewTab?.location.replace(result.previewUrl)
    } catch (error: unknown) {
      previewTab?.close()
      setStatusMessage(`生成网页阅览失败：${getErrorMessage(error)}`)
    } finally {
      setIsGeneratingReview(false)
    }
  }

  const handleImportPixelConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const items = parsePixelConfigFile(await file.text())
      onPixelConfigsChange(items.sort((left, right) => left.id - right.id))
      onLoadedPixelConfigNameChange(file.name)
      setStatusMessage(`已加载 ${file.name}，像素图数量 ${items.length}。`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误'
      setStatusMessage(`导入 pixelconfig 失败：${message}`)
    } finally {
      event.target.value = ''
    }
  }

  const handleImportThumbnails = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    const nextUrls: Record<string, string> = {}

    for (const [key, url] of Object.entries(thumbnailUrls)) {
      if (!files.some((file) => file.name.replace(/\.[^/.]+$/, '') === key)) {
        nextUrls[key] = url
      } else if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const key = file.name.replace(/\.[^/.]+$/, '')
      nextUrls[key] = URL.createObjectURL(file)
    }

    setThumbnailUrls(nextUrls)
    setStatusMessage(`已导入 ${files.length} 个缩略图文件。`)
    event.target.value = ''
  }

  const handleImportLevelConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const items = isDaily ? normalizeDailyLevelConfigItems(JSON.parse(text)) : parseLevelConfigFile(text)
      const filtered = items.filter((item) => isDaily || item.type === levelType)
      const sortedLevels = sortLevels(filtered)
      setLevels(sortedLevels)
      syncLevelIdDrafts(sortedLevels)
      syncPropConfigDrafts(sortedLevels)
      setOpenLevelIds({})
      setStatusMessage(`已加载 ${file.name}，当前类型关卡数量 ${filtered.length}。`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误'
      setStatusMessage(`导入 levelconfig 失败：${message}`)
    } finally {
      event.target.value = ''
    }
  }

  const appendCurrentLevel = (level: LevelConfigItem): LevelConfigItem[] => {
    if (!isDaily) return appendLevel(numberedLevels(levels), { ...level, id: 0 })
    const sorted = sortLevels(levels)
    const lastDate = sorted[sorted.length - 1]?.id
    let id: string
    if (typeof lastDate === 'string' && isDailyLevelDate(lastDate)) {
      const date = new Date(`${lastDate}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() + 1)
      id = date.toISOString().slice(0, 10)
    } else {
      const today = new Date()
      id = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    }
    return sortLevels([...levels, { ...level, id, type: 1 }])
  }

  const handleAddLevelFromMap = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parsed = parseGridDataFile(text, deriveAssetBaseName(file.name))
      const assetBaseName = deriveAssetBaseName(parsed.fileName || file.name)
      const matchedPixelConfig = pixelConfigs.find((item) => item.name === assetBaseName) ?? null

      if (!matchedPixelConfig) {
        setStatusMessage(`未找到名称为 ${assetBaseName} 的像素图记录，请先到像素图管理页通过 map/point 配对创建 pixelconfig。`)
        return
      }

      const nextLevel = buildDefaultLevelConfig(
        matchedPixelConfig,
        levelType,
        0
      )
      const nextLevels = appendCurrentLevel(nextLevel)
      const addedLevel = nextLevels[nextLevels.length - 1]
      setLevels(nextLevels)
      syncLevelIdDrafts(nextLevels)
      setPropConfigDrafts((previous) => ({
        ...previous,
        [addedLevel.id]: JSON.stringify(addedLevel.propConfigs, null, 2)
      }))
      setSelectedPixelId(matchedPixelConfig.id)
      setStatusMessage(`已从 ${file.name} 匹配像素图 ${matchedPixelConfig.name}，并新增当前类型关卡 ${addedLevel.id}。`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误'
      setStatusMessage(`从 map 文件新增关卡失败：${message}`)
    } finally {
      event.target.value = ''
    }
  }

  const handleExport = () => {
    const prepared = applyPendingLevelIdDrafts(levels)
    if (!prepared.ok) {
      setStatusMessage(prepared.message)
      return
    }
    const normalizedLevels = normalizeLevelsForSave(prepared.items)
    downloadTextFile(
      serializeLevelConfigFile(normalizedLevels),
      buildLevelConfigFilename(levelType)
    )
    setStatusMessage(`已导出 ${buildLevelConfigFilename(levelType)}。`)
  }

  const handleAddLevel = () => {
    const pixelConfig = pixelConfigMap.get(selectedPixelId)
    if (!pixelConfig) {
      setStatusMessage('请先导入 pixelconfig 并选择一个像素图记录。')
      return
    }

    const nextLevel = buildDefaultLevelConfig(
      pixelConfig,
      levelType,
      0
    )
    const nextLevels = appendCurrentLevel(nextLevel)
    const addedLevel = nextLevels[nextLevels.length - 1]
    setLevels(nextLevels)
    syncLevelIdDrafts(nextLevels)
    setPropConfigDrafts((previous) => ({
      ...previous,
      [addedLevel.id]: JSON.stringify(addedLevel.propConfigs, null, 2)
    }))
    setStatusMessage(`已为像素图 ${pixelConfig.name} 新增关卡 ${addedLevel.id}。`)
  }

  const updateLevel = <K extends keyof LevelConfigItem>(
    levelId: number | string,
    key: K,
    value: LevelConfigItem[K]
  ) => {
    setLevels((previous) => previous.map((item) => (
      item.id === levelId
        ? {
            ...item,
            [key]: value
          }
        : item
    )))
  }

  const handleSaveLevelEdits = async (levelId: number | string) => {
    try {
      const prepared = applyPendingLevelIdDrafts(levels, levelId)
      if (!prepared.ok) {
        setStatusMessage(prepared.message)
        return
      }

      const normalizedLevels = normalizeLevelsForSave(prepared.items)
      await saveLevelWorkspaceLevelConfig(levelType, normalizedLevels)
      setLevels(normalizedLevels)
      syncLevelIdDrafts(normalizedLevels)
      if (prepared.focusedId !== null && prepared.focusedId !== levelId) {
        setOpenLevelIds((previous) => ({
          ...previous,
          [levelId]: false,
          [prepared.focusedId!]: true
        }))
      }
      setStatusMessage(`已保存关卡 ${prepared.focusedId ?? levelId} 修改：${buildInternalLevelConfigPath(levelType)}。`)
    } catch (error: unknown) {
      setStatusMessage(`保存关卡修改失败：${getErrorMessage(error)}`)
    }
  }

  const handleDeleteLevel = async (targetId: number | string) => {
    const target = levels.find((item) => item.id === targetId)
    if (!target) return
    const confirmed = window.confirm(`确认删除关卡 ${target.id} 吗？`)
    if (!confirmed) return
    const nextLevels = normalizeLevelsForSave(isDaily
      ? levels.filter((item) => item.id !== targetId)
      : deleteLevelAndShift(numberedLevels(levels), Number(targetId)))

    try {
      await saveLevelWorkspaceLevelConfig(levelType, nextLevels)
      setLevels(nextLevels)
      syncLevelIdDrafts(nextLevels)
      syncPropConfigDrafts(nextLevels)
      setStatusMessage(`已删除关卡 ${target.id}，并保存到 ${buildInternalLevelConfigPath(levelType)}。`)
    } catch (error: unknown) {
      setStatusMessage(`删除关卡失败：${getErrorMessage(error)}`)
    }
  }

  const handleApplyPropConfigs = (levelId: number | string) => {
    const draft = propConfigDrafts[levelId] ?? '[]'
    try {
      const parsed = JSON.parse(draft) as unknown
      const normalized = Array.isArray(parsed) ? parsed : []
      updateLevel(levelId, 'propConfigs', normalized)
      setStatusMessage(`已更新关卡 ${levelId} 的 propConfigs。`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误'
      setStatusMessage(`关卡 ${levelId} 的 propConfigs JSON 无效：${message}`)
    }
  }

  return (
    <div className="level-config-page">
      <div className="pixel-config-toolbar">
        <input
          ref={mapImportInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleAddLevelFromMap}
        />
        <input
          ref={pixelConfigInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportPixelConfig}
        />
        <input
          ref={levelConfigInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportLevelConfig}
        />
        <input
          ref={thumbnailInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleImportThumbnails}
        />
        <button type="button" onClick={() => pixelConfigInputRef.current?.click()}>
          导入 pixelconfig
        </button>
        <button type="button" onClick={() => levelConfigInputRef.current?.click()}>
          导入当前类型 levelconfig
        </button>
        <button
          type="button"
          onClick={() => {
            void handleLoadInternalLevelConfig()
          }}
        >
          加载内部 {buildLevelConfigFilename(levelType).replace(/\.json$/, '')}
        </button>
        <button
          type="button"
          onClick={() => {
            void handleSaveInternalLevelConfig()
          }}
          disabled={levels.length === 0}
        >
          保存内部 {buildLevelConfigFilename(levelType).replace(/\.json$/, '')}
        </button>
        {levelType === 1 && (
          <button
            type="button"
            onClick={() => {
              void handleGenerateMainLevelReview()
            }}
            disabled={levels.length === 0 || isGeneratingReview}
          >
            {isGeneratingReview ? '正在生成网页…' : '更新网页阅览'}
          </button>
        )}
        <button type="button" onClick={() => mapImportInputRef.current?.click()}>
          从 map 文件新增关卡
        </button>
        <button type="button" onClick={() => thumbnailInputRef.current?.click()}>
          扫描缩略图目录
        </button>
        <select
          value={selectedPixelId}
          onChange={(event) => setSelectedPixelId(Number.parseInt(event.target.value, 10) || 0)}
          className="level-config-select"
        >
          <option value={0}>选择像素图</option>
          {pixelConfigs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} - {item.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleAddLevel} disabled={pixelConfigs.length === 0 || selectedPixelId === 0}>
          新增关卡
        </button>
        <button type="button" onClick={handleExport} disabled={levels.length === 0}>
          导出当前类型关卡
        </button>
      </div>

      <PixelMetadataSummary pixelConfig={selectedPixelConfig} title="当前选择图片元信息" />

      <div className="pixel-config-status">{statusMessage}</div>

      <div className="level-config-summary">
        <div>页面：{pageTitle}</div>
        <div>{isDaily ? '配置：dailylevelconfig.json' : `类型：${levelType}`}</div>
        <div>当前关卡数量：{levels.length}</div>
        <div>可用像素图数量：{pixelConfigs.length}</div>
        <div>当前 pixelconfig：{loadedPixelConfigName}</div>
        <div>已导入缩略图数量：{Object.keys(thumbnailUrls).length}</div>
      </div>

      {displayedLevels.length === 0 && (
        <div className="pixel-config-empty-main">当前类型暂无关卡，请导入配置或从像素图新增。</div>
      )}

      <div className="level-config-list">
        {displayedLevels.map(({ level, pixelConfig, isOpen }) => {
          // Legacy thumbnail fields can still point to another level's image.
          const thumbnailName = pixelConfig?.name ?? level.thumbnail
          const thumbnailUrl = thumbnailName ? (thumbnailUrls[thumbnailName] ?? null) : null
          return (
            <details
              key={level.id}
              className="level-config-card"
              open={isOpen}
              onToggle={(event) => {
                const nextOpen = event.currentTarget.open
                setOpenLevelIds((previous) => (
                  previous[level.id] === nextOpen
                    ? previous
                    : {
                        ...previous,
                        [level.id]: nextOpen
                      }
                ))
              }}
            >
              <summary className="level-config-card-summary">
                <span className="level-config-card-summary-thumbnail">
                  {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt={`${thumbnailName} 缩略图`} />
                  ) : pixelConfig ? (
                    <LevelMatrixThumbnail pixelConfig={pixelConfig} />
                  ) : (
                    <span>无图</span>
                  )}
                </span>
                <span>#{level.id}</span>
                <span>{pixelConfig?.name ?? `pixel ${level.pixelImageId}`}</span>
                <span>thumbnail: {level.thumbnail || '-'}</span>
                <span>步数: 暂不评估</span>
                <span>难度分: 暂不评估</span>
              </summary>

              {isOpen && (
              <div className="level-config-card-body">
              <div className="level-config-grid">
                <label>
                  ID
                  <input
                    type={isDaily ? 'date' : 'number'}
                    value={levelIdDrafts[level.id] ?? String(level.id)}
                    onChange={(event) => updateLevelIdDraft(level.id, event.target.value)}
                  />
                </label>
                <label>
                  thumbnail
                  <input
                    type="text"
                    value={level.thumbnail}
                    onChange={(event) => updateLevel(level.id, 'thumbnail', event.target.value)}
                  />
                </label>
                <label>
                  type
                  <input type="number" value={level.type} disabled />
                </label>
                <label>
                  difficulty
                  <select
                    data-testid="level-difficulty"
                    value={level.difficulty}
                    onChange={(event) => updateLevel(
                      level.id,
                      'difficulty',
                      Number.parseInt(event.target.value, 10) || 1
                    )}
                  >
                    {DIFFICULTY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  pixelImageId
                  <select
                    value={level.pixelImageId}
                    onChange={(event) => updateLevel(level.id, 'pixelImageId', Number.parseInt(event.target.value, 10) || level.pixelImageId)}
                  >
                    {pixelConfigs.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id} - {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  width
                  <input
                    type="number"
                    value={level.widthHeight[0]}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      if (Number.isNaN(nextValue)) return
                      updateLevel(level.id, 'widthHeight', [nextValue, level.widthHeight[1]])
                    }}
                  />
                </label>
                <label>
                  height
                  <input
                    type="number"
                    value={level.widthHeight[1]}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      if (Number.isNaN(nextValue)) return
                      updateLevel(level.id, 'widthHeight', [level.widthHeight[0], nextValue])
                    }}
                  />
                </label>
                <label>
                  storageMaxSlots
                  <input
                    type="number"
                    value={level.storageMaxSlots}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      if (Number.isNaN(nextValue)) return
                      updateLevel(level.id, 'storageMaxSlots', nextValue)
                    }}
                  />
                </label>
                <label>
                  storageCols
                  <input
                    type="number"
                    value={level.storageCols}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      if (Number.isNaN(nextValue)) return
                      updateLevel(level.id, 'storageCols', nextValue)
                    }}
                  />
                </label>
                <label>
                  storageInitialSlots
                  <input
                    type="number"
                    value={level.storageInitialSlots}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      if (Number.isNaN(nextValue)) return
                      updateLevel(level.id, 'storageInitialSlots', nextValue)
                    }}
                  />
                </label>
                <label>
                  adUnlockIncrement
                  <input
                    type="number"
                    value={level.adUnlockIncrement}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      if (Number.isNaN(nextValue)) return
                      updateLevel(level.id, 'adUnlockIncrement', nextValue)
                    }}
                  />
                </label>
                <label>
                  initialTimeLimit
                  <input
                    type="number"
                    value={level.initialTimeLimit}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      if (Number.isNaN(nextValue)) return
                      updateLevel(level.id, 'initialTimeLimit', nextValue)
                    }}
                  />
                </label>
                <label>
                  adTimeIncrement
                  <input
                    type="number"
                    value={level.adTimeIncrement}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      if (Number.isNaN(nextValue)) return
                      updateLevel(level.id, 'adTimeIncrement', nextValue)
                    }}
                  />
                </label>
                <label>
                  reviveCount
                  <input
                    type="number"
                    value={level.reviveCount}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      if (Number.isNaN(nextValue)) return
                      updateLevel(level.id, 'reviveCount', nextValue)
                    }}
                  />
                </label>
              </div>

              <div className="level-config-meta">
                <div>像素图名称：{pixelConfig?.name ?? '未关联'}</div>
                <div>缩略图文件：{thumbnailName ? `${thumbnailName}.png` : '未填写'}</div>
                <div>评估结果：暂不评估，后续整体调整步数与建议配置。</div>
              </div>

              <PixelMetadataSummary pixelConfig={pixelConfig} title="图片元信息" />

              {thumbnailUrl ? (
                <div className="level-config-thumbnail-block">
                  <div className="level-config-thumbnail-title">缩略图预览</div>
                  <img src={thumbnailUrl} alt={thumbnailName} className="level-config-thumbnail-image" />
                </div>
              ) : thumbnailName ? (
                <div className="level-config-thumbnail-fallback">
                  未找到 `{thumbnailName}.png`，当前使用矩阵预览兜底。
                </div>
              ) : null}

              <label className="pixel-config-resource-field">
                propConfigs(JSON)
                <textarea
                  value={propConfigDrafts[level.id] ?? '[]'}
                  onChange={(event) => setPropConfigDrafts((previous) => ({
                    ...previous,
                    [level.id]: event.target.value
                  }))}
                  rows={4}
                />
              </label>
              <div className="level-config-actions">
                <button type="button" onClick={() => handleApplyPropConfigs(level.id)}>
                  应用 propConfigs
                </button>
                <button
                  type="button"
                  data-level-save-button="true"
                  onClick={() => {
                    void handleSaveLevelEdits(level.id)
                  }}
                >
                  保存当前关卡
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeleteLevel(level.id)
                  }}
                >
                  删除关卡
                </button>
              </div>

              {pixelConfig && (
                <div className="pixel-config-preview-row">
                  <GridMatrixPreview title="pixelMatrix" matrix={pixelConfig.pixelMatrix} gridSize={8} localPixelResource={pixelConfig.localPixelResource} />
                  <GridMatrixPreview title="initPixel" matrix={pixelConfig.initPixel} gridSize={8} localPixelResource={pixelConfig.localPixelResource} />
                </div>
              )}
              </div>
              )}
            </details>
        )})}
      </div>
    </div>
  )
}
