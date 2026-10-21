import { themeDisplayName } from '../utils/themeConfig'
import { t } from '../i18n'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import type { GridData, RGBColor } from '../types/grid'
import type { LevelConfigItem } from '../types/levelConfig'
import type { PixelConfigItem } from '../types/pixelConfig'
import type { ThemeConfigItem } from '../types/themeConfig'
import {
  buildBeadResourceCatalog,
  type BeadResourceCatalogItem,
  type BeadResourceStateCode
} from '../utils/beadResourceCatalog'
import { buildBeadThumbnailDataUrl } from '../utils/beadThumbnail'
import { matchBeadResourcesForColors, type BeadResourceMatch } from '../utils/beadResourceMatcher'
import {
  buildPixelConfigFromGridPair,
  downloadTextFile,
  inferNextPixelConfigId,
  serializePixelConfigFile
} from '../utils/configIO'
import { loadDefaultBeadResourceAssets } from '../utils/defaultBeadResources'
import { applyBeadResourceMatchesToPixelConfig } from '../utils/levelProductionDraft'
import {
  buildLevelConfigForPixelConfig,
  createLevelConfigItem,
  DEFAULT_LEVEL_VALUES,
  DEFAULT_MAIN_LEVEL_TYPE,
  type LevelConfigValueOverrides,
  upsertPixelConfigDraft
} from '../utils/levelProductionPublish'
import {
  buildLevelQualityReport,
  type LevelQualityReport,
  type LevelQualitySeverity
} from '../utils/levelQualityReport'
import { sortThemeConfig } from '../utils/themeConfig'
import {
  getLevelWorkspaceSummary,
  readLevelWorkspaceLevelConfig,
  readLevelDraft,
  readLevelWorkspacePixelPalettes,
  readLevelWorkspacePixelConfig,
  readLevelWorkspaceThemeConfig,
  readLevelWorkspaceThumbnailStatus,
  saveLevelWorkspaceLevelConfig,
  saveLevelWorkspacePixelPalettes,
  saveLevelWorkspacePixelConfig,
  saveLevelDraft,
  saveLevelWorkspaceThumbnail
} from '../utils/levelWorkspaceClient'
import { createEmptyPixelPaletteFile, upsertPixelPaletteItem } from '../utils/pixelPalette'

interface LevelProductionPreviewPanelProps {
  mapGrid: GridData | null
  pointGrid: GridData | null
  emptyMessage?: string
  requiresGeneratedPointGrid?: boolean
  missingPointMessage?: string
  onMapGridChange?: (grid: GridData) => void
  toolbarActions?: ReactNode
  hideDefaultToolbar?: boolean
  resourceNameOverrides?: string[] | null
  levelConfigValueOverrides?: LevelConfigValueOverrides | null
  onLevelConfigValuesChange?: (values: Required<LevelConfigValueOverrides>) => void
  onPixelConfigDraftChange?: (draft: PixelConfigItem | null) => void
  onQualityReportChange?: (report: LevelQualityReport | null) => void
  // pointGrid 由哪种排序模式产生；regionRecolor 时质量报告追加轮廓保留/区域纯度 check
  sortMode?: 'regionRecolor' | 'structure' | 'legacy'
}

interface PreviewCellPosition {
  rowIndex: number
  columnIndex: number
}

const BEAD_STATE_CODES: BeadResourceStateCode[] = [2, 3, 4]
const PREVIEW_CELL_SIZE = 28
const PREVIEW_CELL_GAP = 1
const PREVIEW_HORIZONTAL_PADDING = 16
const PREVIEW_DOWNLOAD_CELL_SIZE = 128
const PREVIEW_BEAD_TO_BASE_SCALE = 21 / 25
const PREVIEW_BEAD_SCALE_PERCENT = `${PREVIEW_BEAD_TO_BASE_SCALE * 100}%`
const DRAFTS_DIR_PATH = 'data/level-workspace/drafts'
const INTERNAL_PIXEL_CONFIG_PATH = 'data/level-workspace/config/pixelconfig.json'
const INTERNAL_MAIN_LEVEL_CONFIG_PATH = 'data/level-workspace/config/levelconfig.json'
const QUALITY_SEVERITY_LABELS: Record<LevelQualitySeverity, string> = {
  pass: t("通过"),
  warning: t("建议检查"),
  error: t("需要修正")
}
const DIFFICULTY_OPTIONS = [
  { value: 1, label: t("1 容易") },
  { value: 2, label: t("2 普通") },
  { value: 3, label: t("3 困难") },
  { value: 4, label: t("4 专家") },
  { value: 5, label: t("5 大师") }
]
const QUALITY_OPTIONS = [
  { value: 1, label: t("1 主线基础") },
  { value: 2, label: t("2 普通") },
  { value: 3, label: t("3 白银") },
  { value: 4, label: t("4 黄金") },
  { value: 5, label: t("5 铂金") }
]
const IMAGE_TYPE_OPTIONS = [
  { value: 1, label: t("1 主线") },
  { value: 2, label: t("2 套图") }
]

const colorToCss = (color: RGBColor): string =>
  `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`

const colorToHex = (color: RGBColor | null | undefined): string => {
  if (!color) return '------'

  return [color.r, color.g, color.b]
    .map((channel) => channel.toString(16).padStart(2, '0').toUpperCase())
    .join('')
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : t("未知错误")

const confirmWithBrowserFallback = (message: string): boolean => {
  if (typeof window.confirm !== 'function') {
    return true
  }

  try {
    return window.confirm(message)
  } catch {
    return true
  }
}

const getPreviewMaxWidth = (columnCount: number): number =>
  columnCount * PREVIEW_CELL_SIZE + Math.max(0, columnCount - 1) * PREVIEW_CELL_GAP + PREVIEW_HORIZONTAL_PADDING

const buildPreviewDownloadFilename = (fileName: string, previewKind: 'map' | 'point'): string => {
  const baseName = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'level-preview'

  return `${baseName}-${previewKind}-resource-preview.png`
}

const buildGridStructureKey = (grid: GridData | null): string => {
  if (!grid) return ''
  return `${grid.fileName}:${grid.width}x${grid.height}:${grid.colorIndices.map((row) => row.join(',')).join('|')}`
}

const loadCanvasImage = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })

const downloadBlobFile = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 0)
}

const getPreviewLayerStyle = (stateCode: 2 | 3): CSSProperties =>
  stateCode === 3
    ? {
        width: PREVIEW_BEAD_SCALE_PERCENT,
        height: PREVIEW_BEAD_SCALE_PERCENT,
        top: '50%',
        left: '50%',
        right: 'auto',
        bottom: 'auto',
        transform: 'translate(-50%, -50%)',
        objectFit: 'contain'
      }
    : {
        width: '100%',
        height: '100%',
        objectFit: 'contain'
      }

const getPreviewLayerDrawRect = (
  rowIndex: number,
  columnIndex: number,
  stateCode: 2 | 3
): [number, number, number, number] => {
  const x = columnIndex * PREVIEW_DOWNLOAD_CELL_SIZE
  const y = rowIndex * PREVIEW_DOWNLOAD_CELL_SIZE

  if (stateCode === 2) {
    return [x, y, PREVIEW_DOWNLOAD_CELL_SIZE, PREVIEW_DOWNLOAD_CELL_SIZE]
  }

  const beadSize = PREVIEW_DOWNLOAD_CELL_SIZE * PREVIEW_BEAD_TO_BASE_SCALE
  const offset = (PREVIEW_DOWNLOAD_CELL_SIZE - beadSize) / 2
  return [x + offset, y + offset, beadSize, beadSize]
}

const resolveNextPixelConfigId = async (): Promise<number> => {
  const [internalPixelConfigs, summary] = await Promise.all([
    readLevelWorkspacePixelConfig().catch(() => []),
    getLevelWorkspaceSummary().catch(() => null)
  ])
  const draftResults = await Promise.allSettled(
    (summary?.drafts ?? []).map((draftName) => readLevelDraft(draftName))
  )
  const draftPixelConfigs = draftResults
    .map((result) => result.status === 'fulfilled' ? result.value.pixelConfig : null)
    .filter((item): item is PixelConfigItem => Boolean(item))

  return inferNextPixelConfigId([
    ...internalPixelConfigs,
    ...draftPixelConfigs
  ])
}

export function LevelProductionPreviewPanel({
  mapGrid,
  pointGrid,
  emptyMessage = t("请先准备 map 数据，再更新关卡预览。"),
  requiresGeneratedPointGrid = false,
  missingPointMessage = t("请先生成关卡排序，生成后的 point 会作为 initPixel 保存。"),
  onMapGridChange,
  toolbarActions,
  hideDefaultToolbar = false,
  resourceNameOverrides,
  levelConfigValueOverrides,
  onLevelConfigValuesChange,
  onPixelConfigDraftChange,
  onQualityReportChange,
  sortMode
}: LevelProductionPreviewPanelProps) {
  const [catalog, setCatalog] = useState<BeadResourceCatalogItem[]>([])
  const [manualResourceNames, setManualResourceNames] = useState<Record<number, string>>({})
  const [replacementPanel, setReplacementPanel] = useState<{
    colorIndex: number
    selectedResourceName: string | null
  } | null>(null)
  const manualResourceNamesRef = useRef<Record<number, string>>({})
  const draggedBeadPreviewCellRef = useRef<PreviewCellPosition | null>(null)
  const [statusMessage, setStatusMessage] = useState(t("正在加载默认豆子资源目录：resource/grid"))
  const [themeConfigs, setThemeConfigs] = useState<ThemeConfigItem[]>([])
  const [pixelMetadata, setPixelMetadata] = useState({
    theme: '',
    difficulty: 1,
    quality: 1,
    imageType: 1,
    albumId: ''
  })

  const [nextPixelConfigId, setNextPixelConfigId] = useState(inferNextPixelConfigId([]))
  const [levelConfigValues, setLevelConfigValues] = useState<Required<LevelConfigValueOverrides>>({
    difficulty: DEFAULT_LEVEL_VALUES.difficulty,
    storageMaxSlots: DEFAULT_LEVEL_VALUES.storageMaxSlots,
    storageCols: DEFAULT_LEVEL_VALUES.storageCols,
    storageInitialSlots: DEFAULT_LEVEL_VALUES.storageInitialSlots,
    adUnlockIncrement: DEFAULT_LEVEL_VALUES.adUnlockIncrement,
    initialTimeLimit: DEFAULT_LEVEL_VALUES.initialTimeLimit,
    adTimeIncrement: DEFAULT_LEVEL_VALUES.adTimeIncrement,
    reviveCount: DEFAULT_LEVEL_VALUES.reviveCount
  })

  useEffect(() => {
    let isActive = true

    const loadDefaultCatalog = async () => {
      try {
        const defaultAssets = await loadDefaultBeadResourceAssets()
        const nextCatalog = await buildBeadResourceCatalog(defaultAssets)
        if (!isActive) return

        setCatalog(nextCatalog)
        setStatusMessage(t("已加载默认豆子资源目录：resource/grid，共 {0} 组。", nextCatalog.length))
      } catch (error: unknown) {
        if (!isActive) return
        setStatusMessage(t("默认豆子资源加载失败：{0}", getErrorMessage(error)))
      }
    }

    void loadDefaultCatalog()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true

    const loadThemes = async () => {
      try {
        const themes = sortThemeConfig(await readLevelWorkspaceThemeConfig())
        if (!isActive) return
        setThemeConfigs(themes)
      } catch (error: unknown) {
        if (!isActive) return
        setStatusMessage(t("主题列表加载失败：{0}", getErrorMessage(error)))
      }
    }

    void loadThemes()

    return () => {
      isActive = false
    }
  }, [])

  const mapGridStructureKey = useMemo(() => buildGridStructureKey(mapGrid), [mapGrid])

  useEffect(() => {
    const nextManualResourceNames = Object.fromEntries(
      (resourceNameOverrides ?? [])
        .map((resourceName, colorIndex) => [colorIndex, resourceName?.trim() ?? ''] as const)
        .filter(([, resourceName]) => resourceName.length > 0)
    )
    manualResourceNamesRef.current = nextManualResourceNames
    setManualResourceNames(nextManualResourceNames)
    setReplacementPanel(null)
  }, [mapGridStructureKey, resourceNameOverrides])

  useEffect(() => {
    let isActive = true

    const loadNextId = async () => {
      const nextId = await resolveNextPixelConfigId()
      if (!isActive) return
      setNextPixelConfigId(nextId)
    }

    void loadNextId()

    return () => {
      isActive = false
    }
  }, [mapGrid, pointGrid])

  const effectivePointGrid = requiresGeneratedPointGrid ? pointGrid : (pointGrid ?? mapGrid)
  const isPointGridReady = Boolean(effectivePointGrid)

  const pixelConfigDraft = useMemo<PixelConfigItem | null>(() => {
    if (!mapGrid) return null
    if (!effectivePointGrid) return null

    return buildPixelConfigFromGridPair(
      mapGrid,
      effectivePointGrid,
      nextPixelConfigId
    )
  }, [effectivePointGrid, mapGrid, nextPixelConfigId])

  const qualityReport = useMemo(() => {
    if (!mapGrid) return null

    return buildLevelQualityReport(
      mapGrid,
      effectivePointGrid,
      pixelConfigDraft,
      { sortMode }
    )
  }, [effectivePointGrid, mapGrid, pixelConfigDraft, sortMode])

  useEffect(() => {
    setLevelConfigValues({
      difficulty:
        levelConfigValueOverrides?.difficulty ??
        qualityReport?.suggestedConfig?.difficulty ??
        DEFAULT_LEVEL_VALUES.difficulty,
      storageMaxSlots:
        levelConfigValueOverrides?.storageMaxSlots ?? DEFAULT_LEVEL_VALUES.storageMaxSlots,
      storageCols:
        levelConfigValueOverrides?.storageCols ?? DEFAULT_LEVEL_VALUES.storageCols,
      storageInitialSlots:
        levelConfigValueOverrides?.storageInitialSlots ??
        qualityReport?.suggestedConfig?.storageInitialSlots ??
        DEFAULT_LEVEL_VALUES.storageInitialSlots,
      adUnlockIncrement:
        levelConfigValueOverrides?.adUnlockIncrement ?? DEFAULT_LEVEL_VALUES.adUnlockIncrement,
      initialTimeLimit:
        levelConfigValueOverrides?.initialTimeLimit ??
        qualityReport?.suggestedConfig?.initialTimeLimit ??
        DEFAULT_LEVEL_VALUES.initialTimeLimit,
      adTimeIncrement:
        levelConfigValueOverrides?.adTimeIncrement ??
        qualityReport?.suggestedConfig?.adTimeIncrement ??
        DEFAULT_LEVEL_VALUES.adTimeIncrement,
      reviveCount:
        levelConfigValueOverrides?.reviveCount ?? DEFAULT_LEVEL_VALUES.reviveCount
    })
  }, [
    levelConfigValueOverrides?.adTimeIncrement,
    levelConfigValueOverrides?.adUnlockIncrement,
    levelConfigValueOverrides?.difficulty,
    levelConfigValueOverrides?.initialTimeLimit,
    levelConfigValueOverrides?.reviveCount,
    levelConfigValueOverrides?.storageCols,
    levelConfigValueOverrides?.storageInitialSlots,
    levelConfigValueOverrides?.storageMaxSlots,
    pixelConfigDraft?.name,
    qualityReport?.suggestedConfig?.adTimeIncrement,
    qualityReport?.suggestedConfig?.difficulty,
    qualityReport?.suggestedConfig?.initialTimeLimit,
    qualityReport?.suggestedConfig?.storageInitialSlots
  ])

  useEffect(() => {
    onLevelConfigValuesChange?.(levelConfigValues)
  }, [levelConfigValues, onLevelConfigValuesChange])

  const matches = useMemo<BeadResourceMatch[]>(() => {
    if (!mapGrid || catalog.length === 0) return []

    return matchBeadResourcesForColors(mapGrid.colors, catalog)
  }, [catalog, mapGrid])

  const effectiveMatches = useMemo<BeadResourceMatch[]>(() => {
    return matches.map((match) => {
      const manualResourceName = manualResourceNames[match.colorIndex]?.trim()

      if (!manualResourceName) {
        return match
      }

      return {
        ...match,
        resourceName: manualResourceName,
        confidence: 'high'
      }
    })
  }, [manualResourceNames, matches])

  const catalogByName = useMemo(() => {
    return new Map(catalog.map((item) => [item.resourceName, item]))
  }, [catalog])

  const matchByColorIndex = useMemo(() => {
    return new Map(effectiveMatches.map((match) => [match.colorIndex, match]))
  }, [effectiveMatches])

  const pixelConfigWithResources = useMemo(() => {
    if (!pixelConfigDraft) return null

    const item = applyBeadResourceMatchesToPixelConfig(pixelConfigDraft, effectiveMatches)

    return {
      ...item,
      theme: pixelMetadata.theme.trim() || undefined,
      difficulty: pixelMetadata.difficulty,
      quality: pixelMetadata.quality,
      imageType: pixelMetadata.imageType,
      albumId: pixelMetadata.albumId.trim() || null
    }
  }, [
    effectiveMatches,
    pixelConfigDraft,
    pixelMetadata.albumId,
    pixelMetadata.difficulty,
    pixelMetadata.imageType,
    pixelMetadata.quality,
    pixelMetadata.theme
  ])

  useEffect(() => {
    onPixelConfigDraftChange?.(pixelConfigWithResources)
  }, [onPixelConfigDraftChange, pixelConfigWithResources])

  useEffect(() => {
    onQualityReportChange?.(qualityReport)
  }, [onQualityReportChange, qualityReport])

  const setManualResourceName = (colorIndex: number, resourceName: string) => {
    manualResourceNamesRef.current = {
      ...manualResourceNamesRef.current,
      [colorIndex]: resourceName
    }
    setManualResourceNames((previous) => ({
      ...previous,
      [colorIndex]: resourceName
    }))
  }

  const getCurrentEffectiveMatches = (currentMapGrid: GridData): BeadResourceMatch[] => {
    return matchBeadResourcesForColors(currentMapGrid.colors, catalog).map((match) => {
      const manualResourceName = manualResourceNamesRef.current[match.colorIndex]?.trim()

      if (!manualResourceName) {
        return match
      }

      return {
        ...match,
        resourceName: manualResourceName,
        confidence: 'high'
      }
    })
  }

  const buildCurrentPixelConfigWithResources = (
    id: number,
    currentMapGrid = mapGrid,
    currentPointGrid = effectivePointGrid
  ): PixelConfigItem | null => {
    if (!currentMapGrid || !currentPointGrid) return null

    const item = applyBeadResourceMatchesToPixelConfig(
      buildPixelConfigFromGridPair(currentMapGrid, currentPointGrid, id),
      getCurrentEffectiveMatches(currentMapGrid)
    )

    return {
      ...item,
      theme: pixelMetadata.theme.trim() || undefined,
      difficulty: pixelMetadata.difficulty,
      quality: pixelMetadata.quality,
      imageType: pixelMetadata.imageType,
      albumId: pixelMetadata.albumId.trim() || null
    }
  }

  const savePixelPaletteForItem = async (
    pixelConfigItem: PixelConfigItem,
    colors: RGBColor[]
  ): Promise<void> => {
    const existingPalettes = await readLevelWorkspacePixelPalettes().catch(() => createEmptyPixelPaletteFile())
    await saveLevelWorkspacePixelPalettes(upsertPixelPaletteItem(existingPalettes, {
      pixelImageId: pixelConfigItem.id,
      name: pixelConfigItem.name,
      colors,
      updatedAt: new Date().toISOString()
    }))
  }

  const getCatalogItemForMatch = (match: BeadResourceMatch): BeadResourceCatalogItem | null => {
    if (!match.resourceName) return null
    return catalogByName.get(match.resourceName) ?? null
  }

  const getPreviewResourceLayers = (colorIndex: number): Array<{ stateCode: 2 | 3; url: string }> => {
    const match = matchByColorIndex.get(colorIndex)
    if (!match) return []

    const stateFiles = getCatalogItemForMatch(match)?.stateFiles
    return ([2, 3] as const)
      .map((stateCode) => {
        const url = stateFiles?.[stateCode]?.url
        return url ? { stateCode, url } : null
      })
      .filter((item): item is { stateCode: 2 | 3; url: string } => Boolean(item))
  }

  const buildResourcePreviewBlob = async (grid: GridData): Promise<Blob | null> => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, grid.width) * PREVIEW_DOWNLOAD_CELL_SIZE
    canvas.height = Math.max(1, grid.height) * PREVIEW_DOWNLOAD_CELL_SIZE

    const context = canvas.getContext('2d')
    if (!context) return null

    context.clearRect(0, 0, canvas.width, canvas.height)

    for (let rowIndex = 0; rowIndex < grid.colorIndices.length; rowIndex += 1) {
      const row = grid.colorIndices[rowIndex]
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        const colorIndex = row[columnIndex]
        if (colorIndex < 0) continue

        const layers = getPreviewResourceLayers(colorIndex)
        for (const layer of layers) {
          const image = await loadCanvasImage(layer.url)
          if (!image) continue

          context.drawImage(image, ...getPreviewLayerDrawRect(rowIndex, columnIndex, layer.stateCode))
        }
      }
    }

    return canvasToPngBlob(canvas)
  }

  const handleDownloadResourcePreview = async (
    grid: GridData | null,
    previewKind: 'map' | 'point'
  ) => {
    if (!grid) return

    try {
      const blob = await buildResourcePreviewBlob(grid)
      if (!blob) {
        setStatusMessage(t("下载图片失败：当前浏览器无法生成预览画布。"))
        return
      }

      downloadBlobFile(blob, buildPreviewDownloadFilename(grid.fileName, previewKind))
    } catch (error: unknown) {
      setStatusMessage(t("下载图片失败：{0}", getErrorMessage(error)))
    }
  }

  const swapBeadPreviewCells = (source: PreviewCellPosition, target: PreviewCellPosition) => {
    if (!mapGrid || !onMapGridChange) return
    if (source.rowIndex === target.rowIndex && source.columnIndex === target.columnIndex) return

    const sourceValue = mapGrid.colorIndices[source.rowIndex]?.[source.columnIndex]
    const targetValue = mapGrid.colorIndices[target.rowIndex]?.[target.columnIndex]
    if (sourceValue === undefined || targetValue === undefined) return

    const nextColorIndices = mapGrid.colorIndices.map((row) => [...row])
    nextColorIndices[source.rowIndex][source.columnIndex] = targetValue
    nextColorIndices[target.rowIndex][target.columnIndex] = sourceValue

    onMapGridChange({
      ...mapGrid,
      colorIndices: nextColorIndices
    })
  }

  const handleBeadPreviewDragStart = (
    event: DragEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ) => {
    draggedBeadPreviewCellRef.current = { rowIndex, columnIndex }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.dropEffect = 'move'
      event.dataTransfer.setData('text/plain', `${rowIndex}:${columnIndex}`)
    }
  }

  const handleBeadPreviewDrop = (
    event: DragEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ) => {
    event.preventDefault()

    const source = draggedBeadPreviewCellRef.current
    draggedBeadPreviewCellRef.current = null
    if (!source) return

    swapBeadPreviewCells(source, { rowIndex, columnIndex })
  }

  const handleBeadPreviewDragEnd = () => {
    draggedBeadPreviewCellRef.current = null
  }

  const handleExportPixelConfigDraft = () => {
    const currentPixelConfigWithResources = buildCurrentPixelConfigWithResources(nextPixelConfigId)
    if (!currentPixelConfigWithResources) return

    downloadTextFile(
      serializePixelConfigFile([currentPixelConfigWithResources]),
      `${currentPixelConfigWithResources.name}_pixelconfig_draft.json`
    )
  }

  const handleExportMissingList = () => {
    const rows = effectiveMatches
      .filter((match) => match.confidence === 'low' || match.confidence === 'missing')
      .map((match) => ({
        colorIndex: match.colorIndex,
        targetColor: match.targetColor,
        resourceName: match.resourceName,
        confidence: match.confidence,
        distance: match.distance
      }))

    downloadTextFile(`${JSON.stringify(rows, null, 2)}\n`, 'bead-resource-review-list.json')
  }

  const handleSaveDraft = async () => {
    if (!mapGrid || !effectivePointGrid || !pixelConfigWithResources) return

    try {
      const saveId = await resolveNextPixelConfigId()
      const draftWithFreshId = buildCurrentPixelConfigWithResources(saveId, mapGrid, effectivePointGrid)
      if (!draftWithFreshId) return
      await saveLevelDraft(draftWithFreshId.name, {
        map: mapGrid,
        point: effectivePointGrid,
        pixelConfig: draftWithFreshId,
        levelConfig: createLevelConfigItem(
          draftWithFreshId,
          DEFAULT_MAIN_LEVEL_TYPE,
          0,
          qualityReport?.suggestedConfig ?? null,
          levelConfigValues
        )
      })
      await savePixelPaletteForItem(draftWithFreshId, mapGrid.colors)
      const thumbnailDataUrl = await buildBeadThumbnailDataUrl(
        mapGrid,
        getCurrentEffectiveMatches(mapGrid),
        catalog
      )
      const thumbnailResult = await saveLevelWorkspaceThumbnail(draftWithFreshId.name, thumbnailDataUrl)
      setNextPixelConfigId(saveId + 1)
      setStatusMessage(
        t("已保存草稿：{0}，路径：{1}/{2}，缩略图：{3}", draftWithFreshId.name, DRAFTS_DIR_PATH, draftWithFreshId.name, thumbnailResult.path)
      )
    } catch (error: unknown) {
      setStatusMessage(t("保存草稿失败：{0}", getErrorMessage(error)))
    }
  }

  const ensurePublishedDraftAssets = async (
    pixelConfigItem: PixelConfigItem,
    levelConfig?: LevelConfigItem
  ): Promise<{ thumbnailPath: string | null }> => {
    if (!mapGrid) {
      return { thumbnailPath: null }
    }

    await saveLevelDraft(pixelConfigItem.name, {
      map: mapGrid,
      point: effectivePointGrid ?? mapGrid,
      pixelConfig: pixelConfigItem,
      levelConfig
    })

    const thumbnailStatus = await readLevelWorkspaceThumbnailStatus(pixelConfigItem.name)
    if (thumbnailStatus.exists) {
      return { thumbnailPath: null }
    }

    const thumbnailDataUrl = await buildBeadThumbnailDataUrl(
      mapGrid,
      getCurrentEffectiveMatches(mapGrid),
      catalog
    )
    const thumbnailResult = await saveLevelWorkspaceThumbnail(pixelConfigItem.name, thumbnailDataUrl)

    return { thumbnailPath: thumbnailResult.path }
  }

  const publishCurrentPixelConfig = async (
    options: { saveDraftAssets?: boolean } = {}
  ): Promise<PixelConfigItem | null> => {
    const currentPixelConfigWithResources = buildCurrentPixelConfigWithResources(nextPixelConfigId)
    if (!currentPixelConfigWithResources) return null
    const shouldSaveDraftAssets = options.saveDraftAssets ?? true

    const internalPixelConfigs = await readLevelWorkspacePixelConfig()
    const hasSameName = internalPixelConfigs.some((item) => item.name === currentPixelConfigWithResources.name)
    if (hasSameName) {
      const shouldReplace = confirmWithBrowserFallback(
        t("已存在名称为 {0} 的像素图记录，是否替换？", currentPixelConfigWithResources.name)
      )
      if (!shouldReplace) {
        setStatusMessage(t("已取消加入内部 pixelconfig：{0}", currentPixelConfigWithResources.name))
        return null
      }
    }

    const publishResult = upsertPixelConfigDraft(internalPixelConfigs, currentPixelConfigWithResources)
    await saveLevelWorkspacePixelConfig(publishResult.items)
    if (mapGrid) {
      await savePixelPaletteForItem(publishResult.item, mapGrid.colors)
    }
    await (
      shouldSaveDraftAssets
        ? ensurePublishedDraftAssets(publishResult.item)
        : Promise.resolve({ thumbnailPath: null })
    )
    setStatusMessage(
      t("已{0}内部 pixelconfig：{1}，pixelImageId={2}，路径：{3}", publishResult.action === 'replaced' ? t("替换") : t("加入"), publishResult.item.name, publishResult.item.id, INTERNAL_PIXEL_CONFIG_PATH)
    )

    return publishResult.item
  }

  const confirmQualityRisk = (): boolean => {
    if (qualityReport?.severity !== 'error') return true

    return confirmWithBrowserFallback(t("质量预检仍有“需要修正”的问题，确认继续写入配置吗？"))
  }

  const handlePublishPixelConfig = async () => {
    try {
      if (!confirmQualityRisk()) {
        setStatusMessage(t("已取消加入内部 pixelconfig：质量预检未通过。"))
        return
      }
      await publishCurrentPixelConfig()
    } catch (error: unknown) {
      setStatusMessage(t("加入内部 pixelconfig 失败：{0}", getErrorMessage(error)))
    }
  }

  const handlePublishMainLevel = async () => {
    try {
      if (!confirmQualityRisk()) {
        setStatusMessage(t("已取消加入主线关卡：质量预检未通过。"))
        return
      }
      const pixelConfigItem = await publishCurrentPixelConfig({ saveDraftAssets: false })
      if (!pixelConfigItem) return

      const internalLevels = await readLevelWorkspaceLevelConfig(DEFAULT_MAIN_LEVEL_TYPE)
      const levelPublishResult = buildLevelConfigForPixelConfig(
        internalLevels.filter((item) => item.type === DEFAULT_MAIN_LEVEL_TYPE),
        pixelConfigItem,
        DEFAULT_MAIN_LEVEL_TYPE,
        qualityReport?.suggestedConfig ?? null,
        levelConfigValues
      )
      await saveLevelWorkspaceLevelConfig(DEFAULT_MAIN_LEVEL_TYPE, levelPublishResult.items)
      await ensurePublishedDraftAssets(pixelConfigItem, levelPublishResult.level)
      setStatusMessage(
        t("已加入主线关卡：levelId={0}，pixelImageId={1}，路径：{2}", levelPublishResult.level.id, pixelConfigItem.id, INTERNAL_MAIN_LEVEL_CONFIG_PATH)
      )
    } catch (error: unknown) {
      setStatusMessage(t("加入主线关卡失败：{0}", getErrorMessage(error)))
    }
  }

  const openReplacementPanel = (match: BeadResourceMatch) => {
    setReplacementPanel({
      colorIndex: match.colorIndex,
      selectedResourceName: match.resourceName ?? catalog[0]?.resourceName ?? null
    })
  }

  const syncResourceColorToMapGrid = (colorIndex: number, resourceName: string) => {
    if (!mapGrid || !onMapGridChange) return

    const catalogItem = catalogByName.get(resourceName.trim())
    if (!catalogItem || !mapGrid.colors[colorIndex]) return

    onMapGridChange({
      ...mapGrid,
      colors: mapGrid.colors.map((color, index) => (
        index === colorIndex
          ? { ...catalogItem.compareColor, a: 255 }
          : { ...color }
      ))
    })
  }

  const confirmReplacement = () => {
    if (!replacementPanel?.selectedResourceName) return

    setManualResourceName(replacementPanel.colorIndex, replacementPanel.selectedResourceName ?? '')
    syncResourceColorToMapGrid(replacementPanel.colorIndex, replacementPanel.selectedResourceName)
    setReplacementPanel(null)
  }

  const currentReplacementColor = replacementPanel
    ? mapGrid?.colors[replacementPanel.colorIndex] ?? null
    : null
  const selectedReplacementItem = replacementPanel?.selectedResourceName
    ? catalogByName.get(replacementPanel.selectedResourceName) ?? null
    : null

  const updateLevelConfigNumber = (key: keyof Required<LevelConfigValueOverrides>, value: string) => {
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed)) return

    setLevelConfigValues((previous) => ({
      ...previous,
      [key]: Math.max(0, parsed)
    }))
  }

  const updatePixelMetadataNumber = (
    key: 'difficulty' | 'quality' | 'imageType',
    value: string
  ) => {
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed)) return

    const [min, max] = key === 'quality' ? [1, 5] : key === 'imageType' ? [1, 2] : [1, 5]
    const nextValue = Math.min(max, Math.max(min, parsed))
    setPixelMetadata((previous) => ({
      ...previous,
      [key]: nextValue
    }))

    if (key === 'difficulty') {
      setLevelConfigValues((previous) => ({
        ...previous,
        difficulty: nextValue
      }))
    }
  }

  const renderResourcePreviewGrid = (
    grid: GridData | null,
    options: {
      testId: string
      legacyTestId?: string
      draggable?: boolean
      emptyMessage: string
    }
  ) => {
    if (!grid) {
      return <div className="pixel-config-status">{options.emptyMessage}</div>
    }

    return (
      <div data-testid={options.testId}>
        <div
          data-testid={options.legacyTestId}
          className="level-production-map-preview"
          style={{
            gridTemplateColumns: `repeat(${grid.width}, minmax(0, 1fr))`,
            maxWidth: `${getPreviewMaxWidth(grid.width)}px`
          }}
        >
          {grid.colorIndices.flatMap((row, rowIndex) =>
            row.map((colorIndex, columnIndex) => {
              const previewLayers = getPreviewResourceLayers(colorIndex)
              const match = matchByColorIndex.get(colorIndex)

              return (
                <div
                  key={`${rowIndex}:${columnIndex}`}
                  className="level-production-preview-cell"
                  draggable={Boolean(options.draggable)}
                  style={{ backgroundColor: 'transparent', cursor: options.draggable ? 'grab' : 'default' }}
                  onDragStart={
                    options.draggable
                      ? (event) => handleBeadPreviewDragStart(event, rowIndex, columnIndex)
                      : undefined
                  }
                  onDragOver={options.draggable ? (event) => event.preventDefault() : undefined}
                  onDrop={
                    options.draggable
                      ? (event) => handleBeadPreviewDrop(event, rowIndex, columnIndex)
                      : undefined
                  }
                  onDragEnd={options.draggable ? handleBeadPreviewDragEnd : undefined}
                >
                  {previewLayers.length ? (
                    <div className="level-production-bead-layer-stack">
                      {previewLayers.map((layer) => (
                        <img
                          key={layer.stateCode}
                          alt={`preview cell ${rowIndex + 1}-${columnIndex + 1} ${match?.resourceName ?? 'unmatched'} ${layer.stateCode}`}
                          src={layer.url}
                          draggable={false}
                          style={getPreviewLayerStyle(layer.stateCode)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  const pointResourcePreviewGrid = effectivePointGrid
  const publishDisabled = !pixelConfigWithResources || !isPointGridReady

  if (!mapGrid) {
    return (
      <section className="level-production-workbench">
        <div className="pixel-config-status">{emptyMessage}</div>
      </section>
    )
  }

  return (
    <section className="level-production-workbench">
      {hideDefaultToolbar ? (
        toolbarActions ? <div className="pixel-config-toolbar">{toolbarActions}</div> : null
      ) : (
      <div className="pixel-config-toolbar">
        <button
          type="button"
          onClick={handleExportMissingList}
          disabled={effectiveMatches.length === 0}
        >{t("导出低置信度/未匹配清单")}</button>
        <button
          type="button"
          onClick={handleExportPixelConfigDraft}
          disabled={publishDisabled}
        >{t("导出 pixelconfig 草稿")}</button>
        <button
          type="button"
          data-testid="level-production-save-draft"
          onClick={() => {
            void handleSaveDraft()
          }}
          disabled={publishDisabled}
        >{t("保存草稿")}</button>
        <button
          type="button"
          onClick={() => {
            void handlePublishPixelConfig()
          }}
          disabled={publishDisabled}
        >{t("加入内部 pixelconfig")}</button>
        <button
          type="button"
          data-testid="level-production-publish-main-level"
          onClick={() => {
            void handlePublishMainLevel()
          }}
          disabled={publishDisabled}
        >{t("加入主线关卡")}</button>
        {toolbarActions}
      </div>
      )}

      <div className="pixel-config-status">{statusMessage}</div>
      {!isPointGridReady ? (
        <div className="pixel-config-status">{missingPointMessage}</div>
      ) : null}
      <div className="level-production-summary">
        <div>{t("当前图片：")}{pixelConfigDraft?.name ?? '-'}</div>
        <div>{t("颜色数量：")}{mapGrid.colors.length}</div>
        <div>{t("默认资源组数量：")}{catalog.length}</div>
      </div>

      {qualityReport ? (
        <section className={`level-production-quality-section level-production-quality-section--${qualityReport.severity}`}>
          <div className="level-production-quality-header">
            <h3>{t("质量预检")}</h3>
            <span>{QUALITY_SEVERITY_LABELS[qualityReport.severity]}</span>
          </div>
          <div className="level-production-quality-metrics">
            <span>{t("尺寸")}{' '}{qualityReport.metrics.width}x{qualityReport.metrics.height}</span>
            <span>{t("有效像素")}{' '}{qualityReport.metrics.occupiedCellCount}</span>
            <span>{t("颜色")}{' '}{qualityReport.metrics.colorCount}</span>
            <span>{t("相近色")}{' '}{qualityReport.metrics.similarColorPairCount}</span>
            <span>{t("孤立像素")}{' '}{qualityReport.metrics.isolatedPixelCount}</span>
          </div>
          <div className="level-production-quality-list">
            {qualityReport.checks.map((check) => (
              <article
                key={check.id}
                className={`level-production-quality-check level-production-quality-check--${check.severity}`}
              >
                <strong>{check.title}</strong>
                <p>{check.message}</p>
                {check.details?.length ? (
                  <ul>
                    {check.details.slice(0, 4).map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="level-production-level-config-section">
        <h3>{t("图片元数据草稿")}</h3>
        <div className="level-production-level-config-grid">
          <label className="level-production-level-config-field">
            <span>{t("主题")}</span>
            <select
              data-testid="pixel-metadata-theme"
              value={pixelMetadata.theme}
              onChange={(event) =>
                setPixelMetadata((previous) => ({
                  ...previous,
                  theme: event.target.value
                }))
              }
            >
              <option value="">{t("未选择")}</option>
              {themeConfigs.map((theme) => (
                <option key={theme.theme} value={theme.theme}>
                  {themeDisplayName(theme)} ({theme.theme})
                </option>
              ))}
            </select>
          </label>
          <label className="level-production-level-config-field">
            <span>{t("难度")}</span>
            <select
              data-testid="pixel-metadata-difficulty"
              value={pixelMetadata.difficulty}
              onChange={(event) => updatePixelMetadataNumber('difficulty', event.target.value)}
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="level-production-level-config-field">
            <span>{t("品质")}</span>
            <select
              data-testid="pixel-metadata-quality"
              value={pixelMetadata.quality}
              onChange={(event) => updatePixelMetadataNumber('quality', event.target.value)}
            >
              {QUALITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="level-production-level-config-field">
            <span>{t("类型")}</span>
            <select
              data-testid="pixel-metadata-imageType"
              value={pixelMetadata.imageType}
              onChange={(event) => updatePixelMetadataNumber('imageType', event.target.value)}
            >
              {IMAGE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="level-production-level-config-field">
            <span>{t("套图 ID")}</span>
            <input
              data-testid="pixel-metadata-albumId"
              type="text"
              value={pixelMetadata.albumId}
              onChange={(event) =>
                setPixelMetadata((previous) => ({
                  ...previous,
                  albumId: event.target.value
                }))
              }
            />
          </label>
        </div>
      </section>

      <section className="level-production-level-config-section">
        <h3>{t("关卡配置草稿")}</h3>
        <div className="level-production-level-config-grid">
          {([
            ['difficulty', t("难度")],
            ['storageMaxSlots', t("最大收纳槽")],
            ['storageCols', t("收纳列数")],
            ['storageInitialSlots', t("初始槽位")],
            ['adUnlockIncrement', t("广告解锁槽位")],
            ['initialTimeLimit', t("初始时间")],
            ['adTimeIncrement', t("广告加时")],
            ['reviveCount', t("复活次数")]
          ] as const).map(([key, label]) => (
            <label key={key} className="level-production-level-config-field">
              <span>{label}</span>
              <input
                data-testid={`level-config-${key}`}
                type="number"
                min={0}
                value={levelConfigValues[key]}
                onChange={(event) => updateLevelConfigNumber(key, event.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="level-production-preview-section">
        <h3>{t("关卡预览与草稿")}</h3>
        <div className="level-production-preview-pair">
          <div className="level-production-preview-panel">
            <h4>{t("排序前豆子资源预览")}</h4>
            {renderResourcePreviewGrid(mapGrid, {
              testId: 'level-production-map-resource-preview',
              legacyTestId: 'level-production-bead-preview',
              draggable: true,
              emptyMessage: emptyMessage
            })}
            <button
              type="button"
              className="level-production-download-button"
              onClick={() => {
                void handleDownloadResourcePreview(mapGrid, 'map')
              }}
            >{t("下载图片")}</button>
          </div>
          <div className="level-production-preview-panel">
            <h4>{t("排序后豆子资源预览")}</h4>
            {renderResourcePreviewGrid(pointResourcePreviewGrid, {
              testId: 'level-production-point-resource-preview',
              emptyMessage: missingPointMessage
            })}
            <button
              type="button"
              className="level-production-download-button"
              disabled={!pointResourcePreviewGrid}
              onClick={() => {
                void handleDownloadResourcePreview(pointResourcePreviewGrid, 'point')
              }}
            >{t("下载图片")}</button>
          </div>
        </div>
      </section>

      {replacementPanel ? (
        <section className="level-production-replacement-panel" role="dialog" aria-modal="true">
          <div className="level-production-replacement-header">
            <h3>{t("更换豆子资源 #")}{replacementPanel.colorIndex}</h3>
            <button type="button" onClick={() => setReplacementPanel(null)}>{t("取消")}</button>
          </div>
          <div className="level-production-replacement-colors">
            <div className="level-production-replacement-color">
              <span>{t("当前颜色")}</span>
              <div
                className="level-production-replacement-swatch"
                style={{
                  backgroundColor: currentReplacementColor
                    ? colorToCss(currentReplacementColor)
                    : '#fff'
                }}
              />
              <strong>{colorToHex(currentReplacementColor)}</strong>
            </div>
            <div className="level-production-replacement-color">
              <span>{t("新选择颜色")}</span>
              <div
                className="level-production-replacement-swatch"
                style={{
                  backgroundColor: selectedReplacementItem
                    ? colorToCss(selectedReplacementItem.compareColor)
                    : '#fff'
                }}
              />
              <strong>{colorToHex(selectedReplacementItem?.compareColor)}</strong>
            </div>
          </div>
          <div className="level-production-resource-picker">
            {catalog.map((item) => {
              const state4 = item.stateFiles[4]
              const isSelected = item.resourceName === replacementPanel.selectedResourceName
              const hexColor = colorToHex(item.compareColor)

              return (
                <button
                  key={item.resourceName}
                  type="button"
                  className={`level-production-resource-option${isSelected ? ' selected' : ''}`}
                  onClick={() =>
                    setReplacementPanel((previous) =>
                      previous ? { ...previous, selectedResourceName: item.resourceName } : previous
                    )
                  }
                >
                  {state4?.url ? (
                    <img alt={t("{0} 4号资源", item.resourceName)} src={state4.url} />
                  ) : (
                    <span className="level-production-state-missing">{t("缺失 4")}</span>
                  )}
                  <span>{item.resourceName}</span>
                  <span>{hexColor}</span>
                </button>
              )
            })}
          </div>
          <div className="level-production-replacement-actions">
            <button
              type="button"
              onClick={confirmReplacement}
              disabled={!replacementPanel.selectedResourceName}
            >{t("确认")}</button>
          </div>
        </section>
      ) : null}

      <div className="level-production-match-list">
        {effectiveMatches.map((match) => {
          const catalogItem = getCatalogItemForMatch(match)

          return (
            <div
              key={match.colorIndex}
              className={`level-production-match level-production-match--${match.confidence}`}
            >
              <span>#{match.colorIndex}</span>
              <span>{match.resourceName ?? t("未匹配")}</span>
              <span>{match.confidence}</span>
              <span>{match.distance === null ? '-' : match.distance.toFixed(1)}</span>
              <div className="level-production-state-images">
                {BEAD_STATE_CODES.map((stateCode) => {
                  const stateAsset = catalogItem?.stateFiles[stateCode]

                  return (
                    <div key={stateCode} className="level-production-state-image">
                      <span>{stateCode}</span>
                      {stateAsset?.url ? (
                        <img
                          alt={t("{0} 状态 {1}", match.resourceName ?? t("未匹配"), stateCode)}
                          src={stateAsset.url}
                        />
                      ) : (
                        <span className="level-production-state-missing">{t("缺失")}</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <button type="button" onClick={() => openReplacementPanel(match)}>{t("更换")}</button>
              <input
                aria-label={t("手动更换颜色 {0} 的资源", match.colorIndex)}
                value={manualResourceNames[match.colorIndex] ?? ''}
                placeholder={t("手动资源组名")}
                onChange={(event) => {
                  const nextResourceName = event.target.value
                  setManualResourceName(match.colorIndex, nextResourceName)
                  syncResourceColorToMapGrid(match.colorIndex, nextResourceName)
                }}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
