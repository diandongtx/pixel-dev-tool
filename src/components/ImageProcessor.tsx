import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LevelProductionPreviewPanel } from './LevelProductionPreviewPanel'
import {
  PixelGridEditorSurface,
  hexToRgb,
  normalizeIndexedState,
  rgbToLab,
  type GridEditTool,
  type IndexedColor
} from './PixelGridEditorSurface'
import type { GridData, RGBColor } from '../types/grid'
import type { PixelPaletteFile } from '../types/pixelPalette'
import type { PixelConfigItem } from '../types/pixelConfig'
import { buildBeadResourceCatalog, type BeadResourceCatalogItem } from '../utils/beadResourceCatalog'
import { matchBeadResourcesForColors } from '../utils/beadResourceMatcher'
import { buildMapFilename, buildPointFilename, deriveAssetBaseName, downloadTextFile } from '../utils/configIO'
import { loadDefaultBeadResourceAssets } from '../utils/defaultBeadResources'
import { buildGridOutputJson, cloneColorIndices, cloneColors } from '../utils/gridData'
import { detectPixelGridSize } from '../utils/imagePixelGridDetection'
import {
  generateSortedGridByTargetBlockCount,
  generateStructureAwareSortedGrid,
  generateRegionRecolorSortedGrid,
  rrAdaptiveFixedThreshold,
  type RegionRecolorSortResult,
  type SizeProfileName,
  type StructureAwareSortResult
} from '../utils/levelGridSorter'
import { readLevelWorkspacePixelConfig, readLevelWorkspacePixelPalettes } from '../utils/levelWorkspaceClient'
import { createEmptyPixelPaletteFile, findPixelPaletteItem } from '../utils/pixelPalette'
import { extractSubjectGridData, getBorderDominantIndex, getExternalBackgroundMask } from '../utils/subjectGrid'

interface ImageProcessorProps {
  gridSize: number
  colorTolerance: number
  gridRefreshVersion?: number
  showGridSettingsButton?: boolean
  onAutoGridSizeDetected?: (gridSize: number) => void
  onGridSizeSuggestionChange?: (suggestion: { cellSize: number, confidence: 'low' | 'medium' } | null) => void
  onGridDataChange?: (gridData: GridData | null) => void
  onSubjectGridDataChange?: (gridData: GridData | null) => void
}

interface ParsedGridColorData {
  width: number
  height: number
  colorIndices: number[][]
  colors: RGBColor[]
}

interface GridCellPosition {
  rowIndex: number
  columnIndex: number
}

interface LevelPreviewResourceLayer {
  stateCode: 2 | 3
  url: string
}

const LEVEL_PREVIEW_CELL_SIZE = 28
const LEVEL_PREVIEW_CELL_GAP = 1
const LEVEL_PREVIEW_HORIZONTAL_PADDING = 16
const LEVEL_PREVIEW_DOWNLOAD_CELL_SIZE = 128
const LEVEL_PREVIEW_BEAD_TO_BASE_SCALE = 21 / 25
const LEVEL_PREVIEW_BEAD_SCALE_PERCENT = `${LEVEL_PREVIEW_BEAD_TO_BASE_SCALE * 100}%`
const isImportedSubjectSource = (baseName: string): boolean =>
  /(_subject_grid_colors|_subject_map|_subject)$/.test(baseName)
const INTERNAL_PIXEL_FALLBACK_COLORS: RGBColor[] = [
  { r: 219, g: 57, b: 55, a: 255 },
  { r: 40, g: 161, b: 115, a: 255 },
  { r: 66, g: 133, b: 244, a: 255 },
  { r: 245, g: 188, b: 66, a: 255 },
  { r: 157, g: 82, b: 191, a: 255 }
]

const sortInternalPixelConfigs = (items: PixelConfigItem[]): PixelConfigItem[] =>
  [...items].sort((left, right) => left.id - right.id || left.name.localeCompare(right.name))

const buildResourcePreviewDownloadFilename = (fileName: string, previewKind: 'map' | 'point'): string => {
  const baseName = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'level-preview'

  return `${baseName}-${previewKind}-resource-preview.png`
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

const getLevelPreviewLayerStyle = (stateCode: 2 | 3): React.CSSProperties =>
  stateCode === 3
    ? {
        width: LEVEL_PREVIEW_BEAD_SCALE_PERCENT,
        height: LEVEL_PREVIEW_BEAD_SCALE_PERCENT,
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

const getLevelPreviewLayerDrawRect = (
  rowIndex: number,
  columnIndex: number,
  stateCode: 2 | 3
): [number, number, number, number] => {
  const x = columnIndex * LEVEL_PREVIEW_DOWNLOAD_CELL_SIZE
  const y = rowIndex * LEVEL_PREVIEW_DOWNLOAD_CELL_SIZE

  if (stateCode === 2) {
    return [x, y, LEVEL_PREVIEW_DOWNLOAD_CELL_SIZE, LEVEL_PREVIEW_DOWNLOAD_CELL_SIZE]
  }

  const beadSize = LEVEL_PREVIEW_DOWNLOAD_CELL_SIZE * LEVEL_PREVIEW_BEAD_TO_BASE_SCALE
  const offset = (LEVEL_PREVIEW_DOWNLOAD_CELL_SIZE - beadSize) / 2
  return [x + offset, y + offset, beadSize, beadSize]
}

export const ImageProcessor: React.FC<ImageProcessorProps> = ({
  gridSize,
  colorTolerance,
  gridRefreshVersion,
  showGridSettingsButton = true,
  onAutoGridSizeDetected,
  onGridSizeSuggestionChange,
  onGridDataChange,
  onSubjectGridDataChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const resultCanvasRef = useRef<HTMLCanvasElement>(null)
  const importedGridSourceRef = useRef<ParsedGridColorData | null>(null)
  const isGridSettingsRefreshRef = useRef(false)
  const lastGridRefreshVersionRef = useRef(gridRefreshVersion)

  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null)
  const [currentFileName, setCurrentFileName] = useState('grid_colors')
  const [currentAssetBaseName, setCurrentAssetBaseName] = useState('grid_colors')
  const [isCurrentGridSubjectSource, setIsCurrentGridSubjectSource] = useState(false)
  const [gridIndexMap, setGridIndexMap] = useState<number[][]>([])
  const [indexedColors, setIndexedColors] = useState<IndexedColor[]>([])
  const [activeIndexId, setActiveIndexId] = useState<number | null>(null)
  const [isPickingColor, setIsPickingColor] = useState(false)
  const [currentColor, setCurrentColor] = useState('#000000')
  const [recentColors, setRecentColors] = useState<string[]>([])
  const [showColorPalette, setShowColorPalette] = useState(false)
  const [showBackgroundColorPalette, setShowBackgroundColorPalette] = useState(false)
  const [manualBackgroundColor, setManualBackgroundColor] = useState<RGBColor | null>(null)
  const [gridEditTool, setGridEditTool] = useState<GridEditTool>('paint')
  const [levelPreviewGrids, setLevelPreviewGrids] = useState<{
    mapGrid: GridData
    pointGrid: GridData | null
  } | null>(null)
  const [levelPreviewStale, setLevelPreviewStale] = useState(false)
  const [levelPreviewCatalog, setLevelPreviewCatalog] = useState<BeadResourceCatalogItem[]>([])
  const [targetBlockCount, setTargetBlockCount] = useState(30)
  const [overflowConstraint, setOverflowConstraint] = useState(5)
  const [useSubjectGridForLevelSort, setUseSubjectGridForLevelSort] = useState(true)
  // 结构感知打乱参数
  const [levelSortMode, setLevelSortMode] = useState<'regionRecolor' | 'structure' | 'legacy'>('regionRecolor')
  // 区域重染色参数（v2 默认模式）
  const [levelRrMinRegionSize, setLevelRrMinRegionSize] = useState(4)
  const [levelRrMaxBlockSize, setLevelRrMaxBlockSize] = useState(0)
  const [levelRegionRecolorResult, setLevelRegionRecolorResult] = useState<RegionRecolorSortResult | null>(null)
  const [levelSizeProfile, setLevelSizeProfile] = useState<SizeProfileName>('standard')
  const [levelStructureAffinity, setLevelStructureAffinity] = useState(0.8)
  const [levelSmallBlockQuota, setLevelSmallBlockQuota] = useState(0.10)
  const [levelSortSeedInput, setLevelSortSeedInput] = useState('')
  const [levelSortResult, setLevelSortResult] = useState<StructureAwareSortResult | null>(null)
  const [internalPixelConfigs, setInternalPixelConfigs] = useState<PixelConfigItem[]>([])
  const [internalPixelPalettes, setInternalPixelPalettes] = useState<PixelPaletteFile>(() => createEmptyPixelPaletteFile())
  const [selectedInternalPixelId, setSelectedInternalPixelId] = useState('')
  const [internalPixelSearch, setInternalPixelSearch] = useState('')
  const [internalPixelStatus, setInternalPixelStatus] = useState('')
  const hasLevelPreviewRef = useRef(false)
  const isInternalPixelLoadRef = useRef(false)
  const draggedPointPreviewCellRef = useRef<GridCellPosition | null>(null)

  const width = gridIndexMap[0]?.length ?? 0
  const height = gridIndexMap.length
  const sortedColors = useMemo(
    () => [...indexedColors].sort((a, b) => a.id - b.id).map((item) => item.color),
    [indexedColors]
  )
  const detectedBackgroundIndex = useMemo(
    () => getBorderDominantIndex(gridIndexMap),
    [gridIndexMap]
  )
  const manualBackgroundIndex = useMemo(() => {
    if (!manualBackgroundColor || indexedColors.length === 0) return null
    const manualLab = rgbToLab(manualBackgroundColor)
    let bestIndex: number | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const candidate of indexedColors) {
      const distance = Math.hypot(
        manualLab[0] - candidate.lab[0],
        manualLab[1] - candidate.lab[1],
        manualLab[2] - candidate.lab[2]
      )
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = candidate.id
      }
    }
    return bestIndex
  }, [indexedColors, manualBackgroundColor])
  const effectiveBackgroundIndex = manualBackgroundIndex ?? detectedBackgroundIndex
  const backgroundColor = useMemo(() => {
    const indexedColor = effectiveBackgroundIndex === null
      ? null
      : indexedColors.find((item) => item.id === effectiveBackgroundIndex)?.color
    const color = indexedColor ?? manualBackgroundColor ?? { r: 255, g: 255, b: 255, a: 255 }
    return `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`
  }, [effectiveBackgroundIndex, indexedColors, manualBackgroundColor])
  const processedGridData = useMemo<GridData | null>(() => {
    if (width === 0 || height === 0 || sortedColors.length === 0) return null
    return {
      width,
      height,
      colorIndices: cloneColorIndices(gridIndexMap),
      colors: cloneColors(sortedColors),
      fileName: currentFileName
    }
  }, [width, height, gridIndexMap, sortedColors, currentFileName])
  const subjectGridData = useMemo<GridData | null>(() => {
    if (!processedGridData) return null
    const hasManualBackgroundIndex = manualBackgroundIndex !== null
    if (isCurrentGridSubjectSource && !hasManualBackgroundIndex) {
      return processedGridData
    }
    return extractSubjectGridData(processedGridData, {
      backgroundIndex: effectiveBackgroundIndex,
      removeAllMatchingBackground: hasManualBackgroundIndex
    })
  }, [processedGridData, isCurrentGridSubjectSource, effectiveBackgroundIndex, manualBackgroundIndex])
  const levelSortSourceGrid = useMemo<GridData | null>(() => {
    if (useSubjectGridForLevelSort) {
      return subjectGridData ?? processedGridData
    }
    return processedGridData
  }, [processedGridData, subjectGridData, useSubjectGridForLevelSort])

  useEffect(() => {
    if (!onGridDataChange) return
    onGridDataChange(processedGridData)
  }, [processedGridData, onGridDataChange])

  useEffect(() => {
    if (!onSubjectGridDataChange) return
    onSubjectGridDataChange(subjectGridData)
  }, [subjectGridData, onSubjectGridDataChange])

  useEffect(() => {
    hasLevelPreviewRef.current = Boolean(levelPreviewGrids)
  }, [levelPreviewGrids])

  useEffect(() => {
    let isActive = true

    const loadLevelPreviewCatalog = async () => {
      try {
        const defaultAssets = await loadDefaultBeadResourceAssets()
        const nextCatalog = await buildBeadResourceCatalog(defaultAssets)
        if (!isActive) return

        setLevelPreviewCatalog(nextCatalog)
      } catch {
        if (!isActive) return
        setLevelPreviewCatalog([])
      }
    }

    void loadLevelPreviewCatalog()

    return () => {
      isActive = false
    }
  }, [])

  useLayoutEffect(() => {
    if (isGridSettingsRefreshRef.current) {
      isGridSettingsRefreshRef.current = false
      if (hasLevelPreviewRef.current) {
        setLevelPreviewStale(true)
      }
      return
    }
    if (isInternalPixelLoadRef.current) {
      // 内部像素图载入时已按 pixelMatrix/initPixel 装好排序预览，
      // 不能按「网格变化」重置 pointGrid。
      isInternalPixelLoadRef.current = false
      return
    }
    if (!hasLevelPreviewRef.current) return

    setLevelPreviewGrids((previous) => {
      if (!previous) return previous
      if (!levelSortSourceGrid) return null

      return {
        mapGrid: levelSortSourceGrid,
        pointGrid: null
      }
    })
    if (hasLevelPreviewRef.current) {
      setLevelPreviewStale(false)
    }
  }, [levelSortSourceGrid])

  const levelPreviewResourceMatches = useMemo(() => {
    if (!levelPreviewGrids?.mapGrid || levelPreviewCatalog.length === 0) return []

    return matchBeadResourcesForColors(levelPreviewGrids.mapGrid.colors, levelPreviewCatalog)
  }, [levelPreviewCatalog, levelPreviewGrids?.mapGrid])

  const levelPreviewCatalogByName = useMemo(() => {
    return new Map(levelPreviewCatalog.map((item) => [item.resourceName, item]))
  }, [levelPreviewCatalog])

  const levelPreviewMatchByColorIndex = useMemo(() => {
    return new Map(levelPreviewResourceMatches.map((match) => [match.colorIndex, match]))
  }, [levelPreviewResourceMatches])

  const getLevelPreviewResourceLayers = (colorIndex: number): LevelPreviewResourceLayer[] => {
    const match = levelPreviewMatchByColorIndex.get(colorIndex)
    if (!match?.resourceName) return []

    const stateFiles = levelPreviewCatalogByName.get(match.resourceName)?.stateFiles
    return ([2, 3] as const)
      .map((stateCode) => {
        const url = stateFiles?.[stateCode]?.url
        return url ? { stateCode, url } : null
      })
      .filter((layer): layer is LevelPreviewResourceLayer => Boolean(layer))
  }

  const buildLevelResourcePreviewBlob = async (grid: GridData): Promise<Blob | null> => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, grid.width) * LEVEL_PREVIEW_DOWNLOAD_CELL_SIZE
    canvas.height = Math.max(1, grid.height) * LEVEL_PREVIEW_DOWNLOAD_CELL_SIZE

    const context = canvas.getContext('2d')
    if (!context) return null

    context.clearRect(0, 0, canvas.width, canvas.height)

    for (let rowIndex = 0; rowIndex < grid.colorIndices.length; rowIndex += 1) {
      const row = grid.colorIndices[rowIndex]
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        const colorIndex = row[columnIndex]
        if (colorIndex < 0) continue

        const previewLayers = getLevelPreviewResourceLayers(colorIndex)
        for (const layer of previewLayers) {
          const image = await loadCanvasImage(layer.url)
          if (!image) continue

          context.drawImage(image, ...getLevelPreviewLayerDrawRect(rowIndex, columnIndex, layer.stateCode))
        }
      }
    }

    return canvasToPngBlob(canvas)
  }

  const handleDownloadLevelResourcePreview = async (
    grid: GridData | null,
    previewKind: 'map' | 'point'
  ) => {
    if (!grid) return

    const blob = await buildLevelResourcePreviewBlob(grid)
    if (!blob) {
      window.alert('下载图片失败：当前浏览器无法生成预览图片。')
      return
    }

    downloadBlobFile(blob, buildResourcePreviewDownloadFilename(grid.fileName, previewKind))
  }

  const swapLevelPreviewPointCells = (source: GridCellPosition, target: GridCellPosition) => {
    setLevelPreviewGrids((previous) => {
      if (!previous?.pointGrid) return previous
      if (source.rowIndex === target.rowIndex && source.columnIndex === target.columnIndex) return previous

      const sourceValue = previous.pointGrid.colorIndices[source.rowIndex]?.[source.columnIndex]
      const targetValue = previous.pointGrid.colorIndices[target.rowIndex]?.[target.columnIndex]
      if (sourceValue === undefined || targetValue === undefined) return previous

      const nextColorIndices = previous.pointGrid.colorIndices.map((row) => [...row])
      nextColorIndices[source.rowIndex][source.columnIndex] = targetValue
      nextColorIndices[target.rowIndex][target.columnIndex] = sourceValue

      return {
        ...previous,
        pointGrid: {
          ...previous.pointGrid,
          colorIndices: nextColorIndices
        }
      }
    })
  }

  const handlePointResourcePreviewDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ) => {
    draggedPointPreviewCellRef.current = { rowIndex, columnIndex }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.dropEffect = 'move'
      event.dataTransfer.setData('text/plain', `${rowIndex}:${columnIndex}`)
    }
  }

  const handlePointResourcePreviewDrop = (
    event: React.DragEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ) => {
    event.preventDefault()
    event.currentTarget.classList.remove('drag-target')

    const source = draggedPointPreviewCellRef.current
    draggedPointPreviewCellRef.current = null
    if (!source) return

    swapLevelPreviewPointCells(source, { rowIndex, columnIndex })
  }

  const handlePointResourcePreviewDragEnd = () => {
    draggedPointPreviewCellRef.current = null
  }

  const getInternalPixelFallbackColor = (index: number): RGBColor => {
    const fallback = INTERNAL_PIXEL_FALLBACK_COLORS[index % INTERNAL_PIXEL_FALLBACK_COLORS.length]
    return { ...fallback }
  }

  const getInternalPixelResourceColor = (resourceName: string | undefined): RGBColor | null => {
    if (!resourceName) return null

    const compareColor = levelPreviewCatalogByName.get(resourceName)?.compareColor
    if (!compareColor) return null

    return {
      ...compareColor,
      a: 255
    }
  }

  const getInternalPixelPaletteColor = (pixelConfig: PixelConfigItem, index: number): RGBColor | null => {
    const paletteItem = findPixelPaletteItem(internalPixelPalettes, pixelConfig.id, pixelConfig.name)
    const color = paletteItem?.colors[index]
    if (!color) return null

    return {
      r: color.r,
      g: color.g,
      b: color.b,
      a: Number.isFinite(color.a) ? color.a : 255
    }
  }

  const buildIndexedColorsFromInternalPixelConfig = (pixelConfig: PixelConfigItem): IndexedColor[] => {
    const maxMatrixIndex = Math.max(-1, ...pixelConfig.pixelMatrix.flat())
    const colorCount = Math.max(
      pixelConfig.localPixelResource.length,
      maxMatrixIndex + 1
    )

    return Array.from({ length: colorCount }, (_, index) => {
      // localPixelResource 是游戏运行时的真实颜色来源，必须优先；
      // pixelpalettes 里的历史指定颜色只补资源表之外的索引，不能再参与常规取色，
      // 否则过时 palette 会污染编辑器预览并随再发布写回关卡数据
      const color = getInternalPixelResourceColor(pixelConfig.localPixelResource[index])
        ?? getInternalPixelPaletteColor(pixelConfig, index)
        ?? getInternalPixelFallbackColor(index)
      return {
        id: index,
        color,
        lab: rgbToLab(color)
      }
    })
  }

  const applyInternalPixelConfigToEditor = (pixelConfig: PixelConfigItem) => {
    importedGridSourceRef.current = null
    setGridIndexMap(pixelConfig.pixelMatrix.map((row) => [...row]))
    const nextIndexedColors = buildIndexedColorsFromInternalPixelConfig(pixelConfig)
    setIndexedColors(nextIndexedColors)
    setCurrentFileName(pixelConfig.name)
    setCurrentAssetBaseName(pixelConfig.name)
    setIsCurrentGridSubjectSource(true)
    setActiveIndexId(null)
    setIsPickingColor(false)
    setManualBackgroundColor(null)
    setShowBackgroundColorPalette(false)
    setLevelRegionRecolorResult(null)
    setLevelSortResult(null)

    // 已有 initPixel 的内部像素图直接把「排序前(map)/排序后(point)」预览装出来，
    // 不必先点「生成关卡排序」；initPixel 缺失或尺寸对不上时才回到空预览。
    const matrix = pixelConfig.pixelMatrix
    const initMatrix = pixelConfig.initPixel
    const matrixHeight = matrix.length
    const matrixWidth = matrixHeight > 0 ? matrix[0].length : 0
    const hasUsableInitPixel = matrixWidth > 0
      && initMatrix.length === matrixHeight
      && initMatrix.every((row) => row.length === matrixWidth)
    const gridColors = [...nextIndexedColors]
      .sort((left, right) => left.id - right.id)
      .map((item) => item.color)

    isInternalPixelLoadRef.current = true
    setLevelPreviewGrids(hasUsableInitPixel
      ? {
          mapGrid: {
            width: matrixWidth,
            height: matrixHeight,
            colorIndices: matrix.map((row) => [...row]),
            colors: cloneColors(gridColors),
            fileName: pixelConfig.name
          },
          pointGrid: {
            width: matrixWidth,
            height: matrixHeight,
            colorIndices: initMatrix.map((row) => [...row]),
            colors: cloneColors(gridColors),
            fileName: `${pixelConfig.name}_sorted`
          }
        }
      : null)
    setLevelPreviewStale(false)
    setOriginalImageSrc((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return null
    })
    setInternalPixelStatus(hasUsableInitPixel
      ? `已载入内部像素图：${pixelConfig.name}，已有 initPixel，排序前/排序后预览已直接加载。`
      : `已载入内部像素图：${pixelConfig.name}，索引矩阵保持原始编号。`)
  }

  const filteredInternalPixelConfigs = useMemo(() => {
    const keyword = internalPixelSearch.trim().toLowerCase()
    if (!keyword) return internalPixelConfigs
    return internalPixelConfigs.filter((item) =>
      item.name.toLowerCase().includes(keyword)
      || String(item.id).includes(keyword)
      || (item.theme ?? '').toLowerCase().includes(keyword)
    )
  }, [internalPixelConfigs, internalPixelSearch])

  const handleLoadInternalPixels = async () => {
    try {
      const [rawItems, palettes] = await Promise.all([
        readLevelWorkspacePixelConfig(),
        readLevelWorkspacePixelPalettes().catch(() => createEmptyPixelPaletteFile())
      ])
      const items = sortInternalPixelConfigs(rawItems)
      setInternalPixelConfigs(items)
      setInternalPixelPalettes(palettes)
      setSelectedInternalPixelId('')
      setInternalPixelStatus(`已加载内部 pixelconfig，共 ${items.length} 个像素图。`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setInternalPixelStatus(`加载内部 pixelconfig 失败：${message}`)
    }
  }

  const handleInternalPixelSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value
    setSelectedInternalPixelId(nextId)
    const selectedPixelConfig = internalPixelConfigs.find((item) => String(item.id) === nextId)
    if (!selectedPixelConfig) return

    applyInternalPixelConfigToEditor(selectedPixelConfig)
  }

  const parseGridColorFile = (text: string): ParsedGridColorData => {
    const tryParseJson = (): ParsedGridColorData | null => {
      try {
        const parsed = JSON.parse(text) as {
          width?: unknown
          height?: unknown
          grid?: unknown
          colorIndices?: unknown
          colors?: unknown
        }
        const widthValue = Number(parsed.width)
        const heightValue = Number(parsed.height)
        const rawGrid = Array.isArray(parsed.grid) ? parsed.grid : parsed.colorIndices
        if (!Number.isInteger(widthValue) || !Number.isInteger(heightValue) || widthValue <= 0 || heightValue <= 0) {
          return null
        }
        if (!Array.isArray(rawGrid) || rawGrid.length !== heightValue) {
          return null
        }
        const colorIndices = rawGrid.map((row) => {
          if (!Array.isArray(row) || row.length !== widthValue) {
            throw new Error('Invalid grid row length')
          }
          const normalized = row.map((value) => Number(value))
          if (normalized.some((value) => !Number.isInteger(value))) {
            throw new Error('Invalid grid value')
          }
          return normalized
        })
        if (!Array.isArray(parsed.colors) || parsed.colors.length === 0) {
          return null
        }
        const colors = parsed.colors.map((item) => {
          if (!item || typeof item !== 'object') {
            throw new Error('Invalid color')
          }
          const r = Number((item as Record<string, unknown>).r)
          const g = Number((item as Record<string, unknown>).g)
          const b = Number((item as Record<string, unknown>).b)
          const a = Number((item as Record<string, unknown>).a)
          if ([r, g, b, a].some((value) => !Number.isFinite(value))) {
            throw new Error('Invalid color value')
          }
          return { r, g, b, a }
        })
        const maxIndex = Math.max(...colorIndices.flat())
        if (maxIndex >= colors.length) {
          throw new Error(`Invalid color index: ${maxIndex}`)
        }
        return {
          width: widthValue,
          height: heightValue,
          colorIndices,
          colors
        }
      } catch {
        return null
      }
    }

    const jsonParsed = tryParseJson()
    if (jsonParsed) {
      return jsonParsed
    }

    const lines = text.split('\n').map((line) => line.trim()).filter((line) => line)
    if (lines.length < 4) {
      throw new Error('File format is invalid: insufficient data')
    }

    const parsedWidth = parseInt(lines[0].split(',')[0], 10)
    const parsedHeight = parseInt(lines[1].split(',')[0], 10)
    if (Number.isNaN(parsedWidth) || Number.isNaN(parsedHeight) || parsedWidth <= 0 || parsedHeight <= 0) {
      throw new Error('Invalid width or height values')
    }

    const colorIndices: number[][] = []
    let currentLine = 2
    while (currentLine < lines.length && (!lines[currentLine].includes('[') || !lines[currentLine].includes(','))) {
      currentLine += 1
    }

    for (let rowIndex = 0; rowIndex < parsedHeight; rowIndex += 1) {
      if (currentLine >= lines.length) {
        throw new Error('Insufficient color index data')
      }
      const line = lines[currentLine]
      if (!line.includes('[') || !line.includes(',')) {
        currentLine += 1
        rowIndex -= 1
        continue
      }
      const row = line.replace(/\[|\]/g, '')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '' && !Number.isNaN(Number(part)))
        .map(Number)
      if (row.length !== parsedWidth) {
        throw new Error(`Invalid number of columns in row ${rowIndex + 1}`)
      }
      colorIndices.push(row)
      currentLine += 1
    }

    while (currentLine < lines.length && !lines[currentLine].includes('new Color')) {
      currentLine += 1
    }

    const colors: RGBColor[] = []
    while (currentLine < lines.length) {
      const line = lines[currentLine]
      const colorMatch = line.match(/new Color\((\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/)
      if (colorMatch) {
        const r = Number(colorMatch[1])
        const g = Number(colorMatch[2])
        const b = Number(colorMatch[3])
        const a = Number(colorMatch[4])
        colors.push({ r, g, b, a })
      }
      currentLine += 1
    }

    if (colors.length === 0) {
      throw new Error('No valid colors found in the file')
    }

    const maxIndex = Math.max(...colorIndices.flat())
    if (maxIndex >= colors.length) {
      throw new Error(`Invalid color index: ${maxIndex}`)
    }

    return {
      width: parsedWidth,
      height: parsedHeight,
      colorIndices,
      colors
    }
  }

  const getLevelPreviewMaxWidth = (columnCount: number): number =>
    columnCount * LEVEL_PREVIEW_CELL_SIZE +
    Math.max(0, columnCount - 1) * LEVEL_PREVIEW_CELL_GAP +
    LEVEL_PREVIEW_HORIZONTAL_PADDING

  const deltaE76 = (lab1: [number, number, number], lab2: [number, number, number]): number => {
    const dl = lab1[0] - lab2[0]
    const da = lab1[1] - lab2[1]
    const db = lab1[2] - lab2[2]
    return Math.sqrt((dl * dl) + (da * da) + (db * db))
  }

  const getDominantColor = (pixels: Uint8ClampedArray): RGBColor => {
    const colorCounts = new Map<string, number>()
    let fallback: RGBColor = { r: 0, g: 0, b: 0, a: 255 }
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      const a = pixels[i + 3]
      if (a < 128) continue
      fallback = { r, g, b, a: 255 }
      const key = `${r},${g},${b}`
      colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1)
    }
    let bestKey = `${fallback.r},${fallback.g},${fallback.b}`
    let bestCount = -1
    for (const [key, count] of colorCounts.entries()) {
      if (count > bestCount) {
        bestCount = count
        bestKey = key
      }
    }
    const [r, g, b] = bestKey.split(',').map(Number)
    return { r, g, b, a: 255 }
  }

  const processImageToIndexedGrid = (canvas: HTMLCanvasElement, cellSize = gridSize) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const numCols = Math.floor(canvas.width / cellSize)
    const numRows = Math.floor(canvas.height / cellSize)
    if (numCols <= 0 || numRows <= 0) return

    const nextIndexMap: number[][] = Array.from({ length: numRows }, () => Array(numCols).fill(0))
    const palette: IndexedColor[] = []

    for (let y = 0; y < numRows; y += 1) {
      for (let x = 0; x < numCols; x += 1) {
        const imageData = ctx.getImageData(x * cellSize, y * cellSize, cellSize, cellSize)
        const dominantColor = getDominantColor(imageData.data)
        const currentLab = rgbToLab(dominantColor)

        let matchedIndexId: number | null = null
        let minDistance = Number.POSITIVE_INFINITY
        for (const candidate of palette) {
          const distance = deltaE76(currentLab, candidate.lab)
          if (distance < minDistance) {
            minDistance = distance
            matchedIndexId = candidate.id
          }
        }

        if (matchedIndexId === null || minDistance > colorTolerance) {
          const newId = palette.length
          palette.push({
            id: newId,
            color: { ...dominantColor, a: 255 },
            lab: currentLab
          })
          matchedIndexId = newId
        }

        nextIndexMap[y][x] = matchedIndexId
      }
    }

    setGridIndexMap(nextIndexMap)
    setIndexedColors(palette)
    setActiveIndexId(null)
    setIsPickingColor(false)
    setManualBackgroundColor(null)
    setShowBackgroundColorPalette(false)
  }

  const processParsedGridToIndexedGrid = (source: ParsedGridColorData) => {
    const nextIndexMap: number[][] = Array.from({ length: source.height }, () => Array(source.width).fill(0))
    const palette: IndexedColor[] = []

    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const sourceIndex = source.colorIndices[y][x]
        if (sourceIndex < 0) {
          nextIndexMap[y][x] = sourceIndex
          continue
        }

        const color = source.colors[sourceIndex]
        if (!color) {
          nextIndexMap[y][x] = sourceIndex
          continue
        }

        const currentLab = rgbToLab(color)
        let matchedIndexId: number | null = null
        let minDistance = Number.POSITIVE_INFINITY
        for (const candidate of palette) {
          const distance = deltaE76(currentLab, candidate.lab)
          if (distance < minDistance) {
            minDistance = distance
            matchedIndexId = candidate.id
          }
        }

        if (matchedIndexId === null || minDistance > colorTolerance) {
          const newId = palette.length
          palette.push({
            id: newId,
            color: { ...color, a: 255 },
            lab: currentLab
          })
          matchedIndexId = newId
        }

        nextIndexMap[y][x] = matchedIndexId
      }
    }

    setGridIndexMap(nextIndexMap)
    setIndexedColors(palette)
    setActiveIndexId(null)
    setIsPickingColor(false)
    setManualBackgroundColor(null)
    setShowBackgroundColorPalette(false)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !event.target.files[0]) return
    const file = event.target.files[0]
    const baseName = file.name.replace(/\.[^/.]+$/, '')
    importedGridSourceRef.current = null
    setCurrentFileName(baseName)
    setCurrentAssetBaseName(baseName)
    setIsCurrentGridSubjectSource(false)

    const url = URL.createObjectURL(file)
    setOriginalImageSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })

    const image = new Image()
    image.onload = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      canvas.width = image.width
      canvas.height = image.height
      ctx.drawImage(image, 0, 0)
      const detected = detectPixelGridSize(ctx.getImageData(0, 0, canvas.width, canvas.height))
      const nextGridSize = detected.confidence === 'high' && detected.cellSize
        ? detected.cellSize
        : gridSize
      if (detected.confidence === 'high' && detected.cellSize && detected.cellSize !== gridSize) {
        onAutoGridSizeDetected?.(detected.cellSize)
        onGridSizeSuggestionChange?.(null)
      } else if ((detected.confidence === 'low' || detected.confidence === 'medium') && detected.cellSize) {
        onGridSizeSuggestionChange?.({
          cellSize: detected.cellSize,
          confidence: detected.confidence
        })
      } else {
        onGridSizeSuggestionChange?.(null)
      }
      processImageToIndexedGrid(canvas, nextGridSize)
    }
    image.src = url
  }

  const handleGridColorFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !event.target.files[0]) return
    const file = event.target.files[0]
    const importedBaseName = file.name.replace(/\.[^/.]+$/, '')
    const normalizedBaseName = deriveAssetBaseName(importedBaseName)
    try {
      const text = await file.text()
      const parsed = parseGridColorFile(text)
      const palette = parsed.colors.map((color, id) => ({
        id,
        color,
        lab: rgbToLab(color)
      }))
      importedGridSourceRef.current = {
        width: parsed.width,
        height: parsed.height,
        colorIndices: parsed.colorIndices.map((row) => [...row]),
        colors: parsed.colors.map((color) => ({ ...color, a: 255 }))
      }
      setGridIndexMap(parsed.colorIndices)
      setIndexedColors(palette)
      setCurrentFileName(normalizedBaseName)
      setCurrentAssetBaseName(deriveAssetBaseName(importedBaseName))
      setActiveIndexId(null)
      setIsPickingColor(false)
      setManualBackgroundColor(null)
      setShowBackgroundColorPalette(false)
      setIsCurrentGridSubjectSource(isImportedSubjectSource(importedBaseName))
      if (originalImageSrc) {
        URL.revokeObjectURL(originalImageSrc)
        setOriginalImageSrc(null)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Invalid grid color file format: ${message}`)
    }
  }

  const exportGridJson = (gridData: GridData | null, filename: string) => {
    if (!gridData) return
    try {
      downloadTextFile(buildGridOutputJson(gridData), filename)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to export grid colors: ${message}`)
    }
  }

  const handleDownloadGridColors = () => {
    exportGridJson(processedGridData, buildPointFilename(currentAssetBaseName))
  }

  const handleDownloadSubjectGridColors = () => {
    exportGridJson(subjectGridData, buildMapFilename(currentAssetBaseName))
  }

  const rebuildGridFromRenderedCanvas = (): boolean => {
    const canvas = resultCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || width === 0 || height === 0) return false
    const nextMap: number[][] = Array.from({ length: height }, () => Array(width).fill(0))
    const palette: IndexedColor[] = []
    const colorIndexMap = new Map<string, number>()
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const px = Math.floor((x * gridSize) + (gridSize / 2))
        const py = Math.floor((y * gridSize) + (gridSize / 2))
        const imageData = ctx.getImageData(px, py, 1, 1)
        const color: RGBColor = {
          r: imageData.data[0],
          g: imageData.data[1],
          b: imageData.data[2],
          a: 255
        }
        const key = `${color.r},${color.g},${color.b}`
        let indexId = colorIndexMap.get(key)
        if (indexId === undefined) {
          indexId = palette.length
          colorIndexMap.set(key, indexId)
          palette.push({
            id: indexId,
            color,
            lab: rgbToLab(color)
          })
        }
        nextMap[y][x] = indexId
      }
    }
    setIndexedColors(palette)
    setGridIndexMap(nextMap)
    setActiveIndexId(null)
    setManualBackgroundColor(null)
    setShowBackgroundColorPalette(false)
    return true
  }

  const handleUpdateGrid = () => {
    const importedGridSource = importedGridSourceRef.current
    if (importedGridSource) {
      isGridSettingsRefreshRef.current = true
      processParsedGridToIndexedGrid(importedGridSource)
      return
    }

    const sourceCanvas = canvasRef.current
    if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      isGridSettingsRefreshRef.current = true
      processImageToIndexedGrid(sourceCanvas)
      return
    }

    isGridSettingsRefreshRef.current = true
    const didRebuild = rebuildGridFromRenderedCanvas()
    if (!didRebuild) {
      isGridSettingsRefreshRef.current = false
    }
  }

  const handleUpdateLevelPreview = () => {
    if (!levelSortSourceGrid || !processedGridData) return

    setLevelPreviewGrids({
      mapGrid: levelSortSourceGrid,
      pointGrid: null
    })
    setLevelPreviewStale(false)
  }

  const handleGenerateLevelSort = () => {
    const sourceMapGrid = levelSortSourceGrid ?? levelPreviewGrids?.mapGrid
    if (!sourceMapGrid) return

    if (levelSortMode === 'legacy') {
      const normalizedTargetBlockCount = Math.max(1, targetBlockCount)
      const sortOptions = {
        overflowConstraint,
        inferExternalBackground: false,
        normalizeExternalBackground: useSubjectGridForLevelSort
      }
      const sortedGrid = generateSortedGridByTargetBlockCount(
        sourceMapGrid,
        normalizedTargetBlockCount,
        sortOptions
      )
      setLevelPreviewGrids({
        mapGrid: sourceMapGrid,
        pointGrid: {
          ...sortedGrid,
          fileName: `${sourceMapGrid.fileName}_sorted`
        }
      })
      setLevelSortResult(null)
      setLevelRegionRecolorResult(null)
      setLevelPreviewStale(false)
      return
    }

    const parsedSeed = Number.parseInt(levelSortSeedInput, 10)
    const seed = Number.isNaN(parsedSeed) ? undefined : parsedSeed
    if (levelSortMode === 'regionRecolor') {
      const result = generateRegionRecolorSortedGrid(sourceMapGrid, {
        minRegionSize: levelRrMinRegionSize,
        maxBlockSize: levelRrMaxBlockSize,
        seed,
        inferExternalBackground: false,
        normalizeExternalBackground: useSubjectGridForLevelSort
      })
      setLevelRegionRecolorResult(result)
      setLevelSortResult(null)
      setLevelPreviewGrids({
        mapGrid: sourceMapGrid,
        pointGrid: {
          ...result.grid,
          fileName: `${sourceMapGrid.fileName}_sorted`
        }
      })
      setLevelPreviewStale(false)
      return
    }
    const result = generateStructureAwareSortedGrid(sourceMapGrid, {
      sizeProfile: levelSizeProfile,
      structureAffinity: levelStructureAffinity,
      smallBlockQuota: levelSmallBlockQuota,
      seed,
      inferExternalBackground: false,
      normalizeExternalBackground: useSubjectGridForLevelSort
    })
    setLevelSortResult(result)
    setLevelRegionRecolorResult(null)
    setLevelPreviewGrids({
      mapGrid: sourceMapGrid,
      pointGrid: {
        ...result.grid,
        fileName: `${sourceMapGrid.fileName}_sorted`
      }
    })
    setLevelPreviewStale(false)
  }

  const handleLevelPreviewMapGridChange = (nextMapGrid: GridData) => {
    setIndexedColors((previous) => previous.map((item) => {
      const nextColor = nextMapGrid.colors[item.id]
      if (!nextColor) return item

      return {
        ...item,
        color: { ...nextColor, a: 255 },
        lab: rgbToLab(nextColor)
      }
    }))

    setLevelPreviewGrids((previous) => {
      if (!previous) {
        return {
          mapGrid: nextMapGrid,
          pointGrid: null
        }
      }

      return {
        mapGrid: nextMapGrid,
        pointGrid: previous.pointGrid
          ? {
              ...previous.pointGrid,
              colors: cloneColors(nextMapGrid.colors)
            }
          : null
      }
    })
    setLevelPreviewStale(false)
  }

  const handleBackgroundColorChange = (nextColor: string) => {
    const parsed = hexToRgb(nextColor)
    if (!parsed) return

    // 所选颜色与现有索引色完全一致：视为「把该颜色指定为背景判断依据」（主体提取用），不改动画面
    const matchesExistingColor = indexedColors.some((item) =>
      item.color.r === parsed.r && item.color.g === parsed.g && item.color.b === parsed.b)
    if (matchesExistingColor) {
      setManualBackgroundColor(parsed)
      setLevelPreviewStale(hasLevelPreviewRef.current)
      return
    }

    // 选择新颜色 = 设置背景色：
    // - 已有背景色 → 替换：只改背景格（判定与主体提取一致），主体内部同色格不受影响；
    // - 没有背景色 → 新增：把所有 -2 空位填成所选颜色。
    const bgIndex = effectiveBackgroundIndex
    let externalMask: boolean[][] | null = null
    if (bgIndex !== null && bgIndex >= 0) {
      externalMask = getExternalBackgroundMask(gridIndexMap, {
        backgroundIndex: bgIndex,
        removeAllMatchingBackground: manualBackgroundIndex !== null
      })
    }
    const hasExternalCell = externalMask?.some((row) => row.some(Boolean)) ?? false

    if (!hasExternalCell) {
      const hasEmptyCell = gridIndexMap.some((row) => row.includes(-2))
      if (!hasEmptyCell) {
        window.alert('当前画布没有背景区域，也没有可填充的空位（-2）。\n可先用橡皮擦出空位、或扩大画布后再设置背景色。')
        return
      }
    }

    const fillIndexId = indexedColors.length
    const nextPalette = [
      ...indexedColors,
      { id: fillIndexId, color: { ...parsed, a: 255 }, lab: rgbToLab(parsed) }
    ]
    const nextMap = gridIndexMap.map((row, y) => row.map((value, x) => (
      (hasExternalCell ? externalMask![y][x] : value === -2) ? fillIndexId : value
    )))
    const normalized = normalizeIndexedState(nextMap, nextPalette, activeIndexId)
    setGridIndexMap(normalized.gridIndexMap)
    setIndexedColors(normalized.indexedColors)
    setActiveIndexId(normalized.activeIndexId)
    setManualBackgroundColor(parsed)
    setLevelPreviewStale(hasLevelPreviewRef.current)
  }

  const handleDownloadSortedPointGrid = () => {
    if (!levelPreviewGrids?.pointGrid) return
    exportGridJson(
      levelPreviewGrids.pointGrid,
      buildPointFilename(deriveAssetBaseName(levelPreviewGrids.pointGrid.fileName))
    )
  }

  useEffect(() => {
    if (gridRefreshVersion === undefined) return
    if (lastGridRefreshVersionRef.current === gridRefreshVersion) return

    lastGridRefreshVersionRef.current = gridRefreshVersion
    handleUpdateGrid()
  }, [gridRefreshVersion])

  return (
    <div className="image-processor">
      <div className="controls">
        <div className="file-input-group">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            id="imageInput"
            style={{ display: 'none' }}
          />
          <label htmlFor="imageInput" className="button">
            选择图片
          </label>
        </div>

        <div className="file-input-group">
          <input
            type="file"
            accept=".txt,.json"
            onChange={handleGridColorFileChange}
            id="gridColorInput"
            style={{ display: 'none' }}
          />
          <label htmlFor="gridColorInput" className="button">
            选择Grid Color
          </label>
        </div>

        <button
          type="button"
          data-testid="internal-pixel-load"
          onClick={() => {
            void handleLoadInternalPixels()
          }}
        >
          加载内部像素图
        </button>
        <input
          type="search"
          data-testid="internal-pixel-search"
          className="internal-pixel-search"
          value={internalPixelSearch}
          onChange={(event) => setInternalPixelSearch(event.target.value)}
          placeholder="按名称 / 编号 / 主题搜索"
          disabled={internalPixelConfigs.length === 0}
        />
        <select
          data-testid="internal-pixel-select"
          value={selectedInternalPixelId}
          onChange={handleInternalPixelSelect}
          disabled={internalPixelConfigs.length === 0}
        >
          <option value="">选择内部像素图</option>
          {filteredInternalPixelConfigs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} / {item.name} / {item.gridWidthHeight[0]}x{item.gridWidthHeight[1]}
            </option>
          ))}
        </select>
        {internalPixelConfigs.length > 0 && filteredInternalPixelConfigs.length === 0 ? (
          <span className="internal-pixel-status">无匹配项</span>
        ) : internalPixelStatus ? (
          <span className="internal-pixel-status">{internalPixelStatus}</span>
        ) : null}

        <button onClick={handleDownloadGridColors} className="download-button">
          下载网格颜色
        </button>
        <button onClick={handleDownloadSubjectGridColors} className="download-button">
          下载主体网格颜色
        </button>
      </div>

      <PixelGridEditorSurface
        gridIndexMap={gridIndexMap}
        indexedColors={indexedColors}
        activeIndexId={activeIndexId}
        currentColor={currentColor}
        recentColors={recentColors}
        showColorPalette={showColorPalette}
        showBackgroundColorPalette={showBackgroundColorPalette}
        backgroundColor={backgroundColor}
        isPickingColor={isPickingColor}
        gridEditTool={gridEditTool}
        gridSize={gridSize}
        backgroundIndex={effectiveBackgroundIndex}
        originalImageSrc={originalImageSrc}
        sourceCanvasRef={canvasRef}
        processedCanvasRef={resultCanvasRef}
        toolbarAfter={(
          <>
            {showGridSettingsButton ? (
              <button type="button" onClick={handleUpdateGrid} className="update-button">
                更新网格和色差
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleUpdateLevelPreview}
              className="update-button"
              disabled={!levelSortSourceGrid || !processedGridData}
            >
              更新关卡预览
            </button>
          </>
        )}
        onGridIndexMapChange={setGridIndexMap}
        onIndexedColorsChange={setIndexedColors}
        onActiveIndexIdChange={setActiveIndexId}
        onCurrentColorChange={setCurrentColor}
        onRecentColorsChange={setRecentColors}
        onShowColorPaletteChange={setShowColorPalette}
        onShowBackgroundColorPaletteChange={setShowBackgroundColorPalette}
        onBackgroundColorChange={handleBackgroundColorChange}
        onPickingColorChange={setIsPickingColor}
        onGridEditToolChange={setGridEditTool}
      />

      <div className="level-production-preview-container">
        <h3>关卡预览与草稿</h3>
        {levelPreviewGrids ? (
          <div className="level-sort-panel" data-testid="level-production-sort-panel">
            <div className="level-sort-controls">
              <div className="level-sort-mode">
                <label>
                  <input
                    type="radio"
                    name="level-sort-mode"
                    value="regionRecolor"
                    checked={levelSortMode === 'regionRecolor'}
                    onChange={() => setLevelSortMode('regionRecolor')}
                  />
                  区域重染色（默认）
                </label>
                <label>
                  <input
                    type="radio"
                    name="level-sort-mode"
                    value="structure"
                    checked={levelSortMode === 'structure'}
                    onChange={() => setLevelSortMode('structure')}
                  />
                  结构感知
                </label>
                <label>
                  <input
                    type="radio"
                    name="level-sort-mode"
                    value="legacy"
                    checked={levelSortMode === 'legacy'}
                    onChange={() => setLevelSortMode('legacy')}
                  />
                  传统（legacy）
                </label>
              </div>

              {levelSortMode === 'regionRecolor' && (
                <>
                  <label htmlFor="levelRrMinRegionSizeInput">小区域并入阈值</label>
                  <input
                    id="levelRrMinRegionSizeInput"
                    type="number"
                    min={1}
                    max={64}
                    value={levelRrMinRegionSize}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      setLevelRrMinRegionSize(Number.isNaN(parsed) ? 4 : Math.min(64, Math.max(1, parsed)))
                    }}
                  />
                  <label htmlFor="levelRrMaxBlockSizeInput">单块上限（0=不限）</label>
                  <input
                    id="levelRrMaxBlockSizeInput"
                    type="number"
                    min={0}
                    value={levelRrMaxBlockSize}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      setLevelRrMaxBlockSize(Number.isNaN(parsed) ? 0 : Math.max(0, parsed))
                    }}
                  />
                  <label htmlFor="levelSortSeedInput">seed（留空=随机）</label>
                  <input
                    id="levelSortSeedInput"
                    type="number"
                    placeholder="随机"
                    value={levelSortSeedInput}
                    onChange={(event) => setLevelSortSeedInput(event.target.value)}
                  />
                </>
              )}

              {levelSortMode === 'legacy' && (
                <>
                  <label htmlFor="levelTargetBlockCountInput">目标色块数</label>
                  <input
                    id="levelTargetBlockCountInput"
                    type="number"
                    min={1}
                    value={targetBlockCount}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      setTargetBlockCount(Number.isNaN(parsed) ? 1 : Math.max(1, parsed))
                    }}
                  />
                  <label htmlFor="levelOverflowConstraintInput">约束强度</label>
                  <input
                    id="levelOverflowConstraintInput"
                    type="number"
                    min={0}
                    max={5}
                    value={overflowConstraint}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      setOverflowConstraint(Number.isNaN(parsed) ? 0 : Math.min(5, Math.max(0, parsed)))
                    }}
                  />
                </>
              )}

              {levelSortMode === 'structure' && (
                <>
                  <label htmlFor="levelSizeProfileInput">手感档位</label>
                  <select
                    id="levelSizeProfileInput"
                    value={levelSizeProfile}
                    onChange={(event) => setLevelSizeProfile(event.target.value as SizeProfileName)}
                  >
                    <option value="loose">松（大块爽感）</option>
                    <option value="standard">标准</option>
                    <option value="tight">紧（决策密度高）</option>
                  </select>
                  <label htmlFor="levelStructureAffinityInput">预期强度 α：{levelStructureAffinity.toFixed(2)}</label>
                  <input
                    id="levelStructureAffinityInput"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={levelStructureAffinity}
                    onChange={(event) => setLevelStructureAffinity(Number.parseFloat(event.target.value))}
                  />
                  <label htmlFor="levelSmallBlockQuotaInput">小块配额</label>
                  <input
                    id="levelSmallBlockQuotaInput"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={levelSmallBlockQuota}
                    onChange={(event) => {
                      const parsed = Number.parseFloat(event.target.value)
                      setLevelSmallBlockQuota(Number.isNaN(parsed) ? 0.10 : Math.min(1, Math.max(0, parsed)))
                    }}
                  />
                  <label htmlFor="levelSortSeedInput">seed（留空=随机）</label>
                  <input
                    id="levelSortSeedInput"
                    type="number"
                    placeholder="随机"
                    value={levelSortSeedInput}
                    onChange={(event) => setLevelSortSeedInput(event.target.value)}
                  />
                </>
              )}

              <label htmlFor="levelSortUseSubjectGridInput" className="level-sort-checkbox">
                <input
                  id="levelSortUseSubjectGridInput"
                  data-testid="level-sort-use-subject-grid"
                  type="checkbox"
                  checked={useSubjectGridForLevelSort}
                  onChange={(event) => setUseSubjectGridForLevelSort(event.target.checked)}
                />
                使用主体网格
              </label>
              <button
                type="button"
                data-testid="level-sort-generate"
                onClick={handleGenerateLevelSort}
                disabled={levelPreviewStale}
              >
                生成关卡排序
              </button>
              <button
                type="button"
                onClick={handleDownloadSortedPointGrid}
                disabled={!levelPreviewGrids.pointGrid || levelPreviewStale}
              >
                下载排序 point
              </button>
            </div>
            {levelSortMode === 'regionRecolor' && levelRegionRecolorResult && (
              <div className="level-sort-metrics">
                <span className={levelRegionRecolorResult.passed ? 'metric-pass' : 'metric-fail'}>
                  {levelRegionRecolorResult.passed ? '✓ 全部达标' : '△ 未达标（已返回最优一次）'}
                </span>
                <span>seed: {levelRegionRecolorResult.usedSeed}</span>
                <span>尝试: {levelRegionRecolorResult.attempts}</span>
                <span>策略: {levelRegionRecolorResult.metrics.allocStrategy === 'matched' ? '最小溢出匹配' : '配额倾倒'}</span>
                <span>fixedFloor: {(levelRegionRecolorResult.metrics.fixedFloor * 100).toFixed(0)}%</span>
                <span className={levelRegionRecolorResult.metrics.contourPreservation >= 0.75 ? 'metric-pass' : 'metric-fail'}>
                  R1 轮廓保留 {levelRegionRecolorResult.metrics.contourPreservation.toFixed(2)}
                </span>
                <span className={levelRegionRecolorResult.metrics.regionPurity >= 0.80 ? 'metric-pass' : 'metric-fail'}>
                  区域纯度 {levelRegionRecolorResult.metrics.regionPurity.toFixed(2)}
                </span>
                <span>区域数 {levelRegionRecolorResult.metrics.regionCount}</span>
                <span className={levelRegionRecolorResult.metrics.smallBlockRatio <= 0.10 ? 'metric-pass' : 'metric-fail'}>
                  R2 小块占比 {(levelRegionRecolorResult.metrics.smallBlockRatio * 100).toFixed(0)}%
                </span>
                <span className={levelRegionRecolorResult.metrics.greedyTailRun <= 8 ? 'metric-pass' : 'metric-fail'}>
                  R3 尾串 {levelRegionRecolorResult.metrics.greedyTailRun}
                </span>
                <span className={levelRegionRecolorResult.metrics.fixedCellRatio <= rrAdaptiveFixedThreshold(levelRegionRecolorResult.metrics.fixedFloor) ? 'metric-pass' : 'metric-fail'}>
                  R4 落原位 {(levelRegionRecolorResult.metrics.fixedCellRatio * 100).toFixed(0)}%
                </span>
                <span>拾取 {levelRegionRecolorResult.metrics.pickupCount}</span>
              </div>
            )}
            {levelSortMode === 'structure' && levelSortResult && (
              <div className="level-sort-metrics">
                <span className={levelSortResult.passed ? 'metric-pass' : 'metric-fail'}>
                  {levelSortResult.passed ? '✓ 全部达标' : '△ 未达标（已返回最优一次）'}
                </span>
                <span>seed: {levelSortResult.usedSeed}</span>
                <span>尝试: {levelSortResult.attempts}</span>
                <span className={levelSortResult.metrics.structureRetention >= 0.55 ? 'metric-pass' : 'metric-fail'}>
                  H1 结构保留 {levelSortResult.metrics.structureRetention.toFixed(2)}
                </span>
                <span className={levelSortResult.metrics.smallBlockRatio <= 0.10 ? 'metric-pass' : 'metric-fail'}>
                  H2 小块占比 {(levelSortResult.metrics.smallBlockRatio * 100).toFixed(0)}%
                </span>
                <span className={levelSortResult.metrics.greedyTailRun <= 8 ? 'metric-pass' : 'metric-fail'}>
                  H3 尾串 {levelSortResult.metrics.greedyTailRun}
                </span>
                <span className={levelSortResult.metrics.fixedCellRatio <= 0.50 ? 'metric-pass' : 'metric-fail'}>
                  H4 白送进度 {(levelSortResult.metrics.fixedCellRatio * 100).toFixed(0)}%
                </span>
                <span>拾取 {levelSortResult.metrics.pickupCount}</span>
              </div>
            )}
            <div className="panel-tip">
              {levelPreviewStale
                ? '像素图已变化，请先点击“更新关卡预览”，再重新生成排序。'
                : levelPreviewGrids.pointGrid
                  ? '已生成排序，保存草稿或加入内部配置时会把该排序写入 initPixel。'
                  : '请先生成关卡排序，生成结果会作为 initPixel。'}
            </div>
            {levelPreviewGrids.pointGrid && !levelPreviewStale ? (
              <div className="level-sort-preview">
                <h4>initPixel / point 预览</h4>
                <div className="level-production-preview-pair">
                  <div className="level-production-preview-panel">
                    <h5>排序前实际资源预览</h5>
                    <div
                      data-testid="level-production-map-resource-preview"
                      className="level-production-map-preview"
                      style={{
                        gridTemplateColumns: `repeat(${levelPreviewGrids.mapGrid.width}, minmax(0, 1fr))`,
                        maxWidth: `${getLevelPreviewMaxWidth(levelPreviewGrids.mapGrid.width)}px`
                      }}
                    >
                      {levelPreviewGrids.mapGrid.colorIndices.flatMap((row, rowIndex) =>
                        row.map((colorIndex, columnIndex) => {
                          const previewLayers = getLevelPreviewResourceLayers(colorIndex)

                          return (
                            <div
                              key={`${rowIndex}:${columnIndex}`}
                              className="level-production-preview-cell"
                              style={{ backgroundColor: 'transparent', cursor: 'default' }}
                            >
                              {previewLayers.length ? (
                                <div className="level-production-bead-layer-stack">
                                  {previewLayers.map((layer) => (
                                    <img
                                      key={layer.stateCode}
                                      alt={`map resource ${rowIndex + 1}-${columnIndex + 1} ${layer.stateCode}`}
                                      src={layer.url}
                                      draggable={false}
                                      style={getLevelPreviewLayerStyle(layer.stateCode)}
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      className="level-production-download-button"
                      onClick={() => {
                        void handleDownloadLevelResourcePreview(levelPreviewGrids.mapGrid, 'map')
                      }}
                    >
                      下载图片
                    </button>
                  </div>
                  <div className="level-production-preview-panel">
                    <h5>排序后实际资源预览</h5>
                    <div
                      data-testid="level-production-point-resource-preview"
                      className="level-production-map-preview"
                      style={{
                        gridTemplateColumns: `repeat(${levelPreviewGrids.pointGrid.width}, minmax(0, 1fr))`,
                        maxWidth: `${getLevelPreviewMaxWidth(levelPreviewGrids.pointGrid.width)}px`
                      }}
                    >
                      {levelPreviewGrids.pointGrid.colorIndices.flatMap((row, rowIndex) =>
                        row.map((colorIndex, columnIndex) => {
                          const previewLayers = getLevelPreviewResourceLayers(colorIndex)

                          return (
                            <div
                              key={`${rowIndex}:${columnIndex}`}
                              className="level-production-preview-cell"
                              draggable
                              style={{ backgroundColor: 'transparent' }}
                              onDragStart={(event) => handlePointResourcePreviewDragStart(event, rowIndex, columnIndex)}
                              onDragOver={(event) => {
                                event.preventDefault()
                                if (event.dataTransfer) {
                                  event.dataTransfer.dropEffect = 'move'
                                }
                              }}
                              onDragEnter={(event) => {
                                if (draggedPointPreviewCellRef.current) {
                                  event.currentTarget.classList.add('drag-target')
                                }
                              }}
                              onDragLeave={(event) => {
                                event.currentTarget.classList.remove('drag-target')
                              }}
                              onDrop={(event) => handlePointResourcePreviewDrop(event, rowIndex, columnIndex)}
                              onDragEnd={handlePointResourcePreviewDragEnd}
                            >
                              {previewLayers.length ? (
                                <div className="level-production-bead-layer-stack">
                                  {previewLayers.map((layer) => (
                                    <img
                                      key={layer.stateCode}
                                      alt={`point resource ${rowIndex + 1}-${columnIndex + 1} ${layer.stateCode}`}
                                      src={layer.url}
                                      draggable={false}
                                      style={getLevelPreviewLayerStyle(layer.stateCode)}
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      className="level-production-download-button"
                      onClick={() => {
                        void handleDownloadLevelResourcePreview(levelPreviewGrids.pointGrid, 'point')
                      }}
                    >
                      下载图片
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <LevelProductionPreviewPanel
          mapGrid={levelPreviewGrids?.mapGrid ?? null}
          pointGrid={!levelPreviewStale ? levelPreviewGrids?.pointGrid ?? null : null}
          onMapGridChange={handleLevelPreviewMapGridChange}
          requiresGeneratedPointGrid
          sortMode={levelSortMode}
          emptyMessage="点击“更新关卡预览”后，会在这里显示最终豆子效果和草稿保存入口。"
        />
      </div>

      <style>{`
        .image-processor {
          padding: 20px;
        }
        .controls {
          margin-bottom: 20px;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .controls button {
          padding: 8px 16px;
          cursor: pointer;
        }
        .controls button.background-color-tool {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .controls button.background-color-tool .background-color-preview {
          width: 20px;
          height: 20px;
          border: 1px solid #111827;
          border-radius: 5px;
          flex-shrink: 0;
        }
        .controls select {
          padding: 7px 10px;
          min-width: 220px;
          border: 1px solid #ccd3df;
          border-radius: 6px;
          background: #fff;
        }
        .internal-pixel-search {
          padding: 7px 10px;
          min-width: 200px;
          border: 1px solid #ccd3df;
          border-radius: 6px;
          background: #fff;
        }
        .internal-pixel-status {
          max-width: 360px;
          color: #334155;
          font-size: 13px;
          line-height: 1.35;
        }
        .controls button.download-button {
          background-color: #FF9800;
          color: white;
        }
        .controls button.active {
          background-color: #4CAF50;
          color: white;
        }
        .controls button.update-button {
          background-color: #2196F3;
          color: white;
        }
        .canvases {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
          flex-wrap: wrap;
          align-items: flex-start;
        }
        .canvas-panel {
          flex: 1 1 320px;
          min-width: 0;
          text-align: left;
        }
        .canvas-panel h3 {
          margin-top: 0;
        }
        .canvas-panel img,
        .canvas-panel canvas {
          display: block;
          width: 100%;
        }
        .color-palette-container {
          position: absolute;
          right: 20px;
          top: 80px;
          z-index: 1000;
        }
        .background-color-palette-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: stretch;
        }
        .screen-pick-button {
          width: 100%;
          box-sizing: border-box;
          padding: 6px 10px;
          cursor: pointer;
        }
        .file-input-group {
          display: inline-block;
          margin-right: 10px;
        }
        .button {
          display: inline-block;
          padding: 8px 16px;
          background-color: #646cff;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .button:hover {
          background-color: #535bf2;
        }
        .color-info {
          margin-top: 20px;
        }
        .indexed-colors {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 12px;
        }
        .index-item {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 64px;
          border: 1px solid #d9d9d9;
          border-radius: 12px;
          background: #fff;
          cursor: pointer;
          padding: 14px 16px;
          justify-content: flex-start;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .index-item:hover {
          border-color: #1677ff;
          box-shadow: 0 0 0 1px rgba(22, 119, 255, 0.16);
        }
        .index-item.active {
          border-color: #646cff;
          box-shadow: 0 0 0 1px #646cff;
        }
        .index-item.drag-target {
          border-color: #22c55e;
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.35);
        }
        .index-color-preview {
          width: 32px;
          height: 32px;
          border: 1px solid #111827;
          border-radius: 8px;
          flex-shrink: 0;
        }
        .index-item-text {
          color: #1e293b;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.4;
        }
        .index-panel {
          position: fixed;
          right: 24px;
          top: 120px;
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 12px;
          width: 260px;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.12);
          z-index: 1000;
        }
        .index-panel h4 {
          margin: 0 0 10px 0;
        }
        .panel-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
          gap: 10px;
        }
        .panel-row input[type="text"] {
          width: 120px;
          padding: 4px 6px;
        }
        .panel-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        .panel-tip {
          margin-top: 8px;
          font-size: 12px;
          color: #666;
        }
        .color-picker-status {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: rgba(0, 0, 0, 0.75);
          color: white;
          padding: 8px 14px;
          border-radius: 4px;
          font-size: 13px;
          z-index: 1100;
        }
        .level-production-preview-container {
          margin-top: 28px;
          padding-top: 18px;
          border-top: 1px solid #e5e7eb;
        }
        .level-sort-panel {
          margin-bottom: 14px;
          padding: 12px;
          border: 1px solid #dbe4f0;
          border-radius: 8px;
          background: #f8fbff;
        }
        .level-sort-controls {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }
        .level-sort-controls input {
          width: 96px;
          padding: 6px 8px;
        }
        .level-sort-checkbox {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .level-sort-controls .level-sort-checkbox input {
          width: auto;
          padding: 0;
        }
        .level-sort-preview {
          margin-top: 12px;
        }
        .level-sort-preview h4,
        .level-sort-preview h5 {
          margin: 0 0 8px 0;
        }
      `}</style>
    </div>
  )
}
