import { t } from '../i18n'
import type { GridData, RGBColor } from '../types/grid'
import type { DailyLevelConfigItem, LevelConfigFile, LevelConfigItem, ManagedLevelConfigItem } from '../types/levelConfig'
import type { PixelConfigFile, PixelConfigItem } from '../types/pixelConfig'
import {
  countPixelConfigBeads,
  isValidPixelConfigBeadCount
} from './pixelConfigBeadCount'

const GRID_COLOR_SUFFIXES = [
  '_subject_grid_colors',
  '_grid_colors',
  '_subject_map',
  '_map',
  '_point'
] as const

const isFiniteInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)

const ensureMatrix = (value: unknown, label: string): number[][] => {
  if (!Array.isArray(value)) {
    throw new Error(t("{0} 必须是二维数组", label))
  }

  return value.map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new Error(t("{0} 的第 {1} 行不是数组", label, rowIndex + 1))
    }

    return row.map((cell, cellIndex) => {
      const normalized = Number(cell)
      if (!Number.isInteger(normalized)) {
        throw new Error(t("{0} 的第 {1} 行第 {2} 列不是整数", label, rowIndex + 1, cellIndex + 1))
      }
      return normalized
    })
  })
}

const ensureTuple = (value: unknown, label: string): [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(t("{0} 必须是长度为 2 的数组", label))
  }

  const left = Number(value[0])
  const right = Number(value[1])
  if (!Number.isInteger(left) || !Number.isInteger(right)) {
    throw new Error(t("{0} 的值必须是整数", label))
  }

  return [left, right]
}

const normalizeIntegerInRange = (
  value: unknown,
  label: string,
  min: number,
  max: number,
  fallback: number
): number => {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    throw new Error(t("{0} 必须是 {1}-{2} 的整数", label, min, max))
  }

  return normalized
}

const ensureColors = (value: unknown): RGBColor[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(t("colors 不能为空"))
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(t("colors 第 {0} 项无效", index + 1))
    }

    const color = item as Record<string, unknown>
    const r = Number(color.r)
    const g = Number(color.g)
    const b = Number(color.b)
    const a = Number(color.a)
    if ([r, g, b, a].some((channel) => !Number.isFinite(channel))) {
      throw new Error(t("colors 第 {0} 项存在非法颜色值", index + 1))
    }

    return { r, g, b, a }
  })
}

const getMatrixMaxIndex = (matrix: number[][]): number => {
  let maxIndex = -1
  for (const row of matrix) {
    for (const value of row) {
      if (value > maxIndex) {
        maxIndex = value
      }
    }
  }
  return maxIndex
}

export const stripFileExtension = (fileName: string): string =>
  fileName.replace(/\.[^/.]+$/, '')

export const deriveAssetBaseName = (fileName: string): string => {
  let baseName = stripFileExtension(fileName)

  let changed = true
  while (changed) {
    changed = false
    for (const suffix of GRID_COLOR_SUFFIXES) {
      if (baseName.endsWith(suffix)) {
        baseName = baseName.slice(0, -suffix.length)
        changed = true
      }
    }
  }

  if (baseName.endsWith('_subject')) {
    return baseName.slice(0, -'_subject'.length)
  }

  return baseName
}

export const buildMapFilename = (baseName: string): string =>
  `${deriveAssetBaseName(baseName)}_map.json`

export const buildPointFilename = (baseName: string): string =>
  `${deriveAssetBaseName(baseName)}_point.json`

export const buildPixelConfigFilename = (): string => 'pixelconfig.json'

export { buildLevelConfigFilename } from './levelConfigFilename'

export const downloadTextFile = (
  content: string,
  filename: string,
  mimeType = 'application/json'
): void => {
  const blob = new Blob([content], { type: mimeType })
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

export const parseGridDataFile = (text: string, fallbackFileName = 'grid'): GridData => {
  const parsed = JSON.parse(text) as {
    width?: unknown
    height?: unknown
    grid?: unknown
    colorIndices?: unknown
    colors?: unknown
    fileName?: unknown
  }

  const width = Number(parsed.width)
  const height = Number(parsed.height)
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(t("网格文件中的 width/height 非法"))
  }

  const rawGrid = Array.isArray(parsed.grid) ? parsed.grid : parsed.colorIndices
  const colorIndices = ensureMatrix(rawGrid, 'grid')
  if (colorIndices.length !== height || colorIndices.some((row) => row.length !== width)) {
    throw new Error(t("网格尺寸与 width/height 不一致"))
  }

  const colors = ensureColors(parsed.colors)
  const maxIndex = getMatrixMaxIndex(colorIndices)
  if (maxIndex >= colors.length) {
    throw new Error(t("存在超出颜色表范围的索引 {0}", maxIndex))
  }

  const fileName = typeof parsed.fileName === 'string' && parsed.fileName.trim()
    ? parsed.fileName.trim()
    : fallbackFileName

  return {
    width,
    height,
    colorIndices,
    colors,
    fileName
  }
}

// 把任意来源（文件或接口返回）的 pixelconfig 数组归一化为新结构：
// 透传所有已有字段，补齐/校验 v0.5 新字段默认值。用于读取时统一，保存路径无需再校验。
export const normalizePixelConfigItems = (items: unknown): PixelConfigFile => {
  if (!Array.isArray(items)) {
    throw new Error(t("pixelconfig 数据必须是数组"))
  }

  return items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(t("pixelconfig 第 {0} 项无效", index + 1))
    }

    const config = item as Record<string, unknown>
    const id = Number(config.id)
    const name = String(config.name ?? '').trim()
    if (!Number.isInteger(id)) {
      throw new Error(t("pixelconfig 第 {0} 项 id 非法", index + 1))
    }
    if (!name) {
      throw new Error(t("pixelconfig 第 {0} 项 name 不能为空", index + 1))
    }

    const localPixelResource = Array.isArray(config.localPixelResource)
      ? config.localPixelResource.map((value) => String(value))
      : []
    const pixelMatrix = ensureMatrix(config.pixelMatrix, 'pixelMatrix')
    const beadCount = isValidPixelConfigBeadCount(config.beadCount)
      ? config.beadCount
      : countPixelConfigBeads(pixelMatrix)

    return {
      ...config,
      id,
      name,
      gridWidthHeight: ensureTuple(config.gridWidthHeight, 'gridWidthHeight'),
      pixelWidthHeight: ensureTuple(config.pixelWidthHeight, 'pixelWidthHeight'),
      localPixelResource,
      pixelMatrix,
      initPixel: ensureMatrix(config.initPixel, 'initPixel'),
      beadCount,
      theme: typeof config.theme === 'string' ? config.theme : undefined,
      difficulty: normalizeIntegerInRange(config.difficulty, 'difficulty', 1, 5, 1),
      quality: normalizeIntegerInRange(config.quality, 'quality', 1, 5, 1),
      imageType: normalizeIntegerInRange(config.imageType, 'imageType', 1, 2, 1),
      albumId: config.albumId == null || config.albumId === '' ? null : String(config.albumId)
    }
  })
}

export const parsePixelConfigFile = (text: string): PixelConfigFile =>
  normalizePixelConfigItems(JSON.parse(text) as unknown)

export const serializePixelConfigFile = (items: PixelConfigFile): string =>
  `${JSON.stringify(items, null)}\n`

// 归一化 levelconfig 数组：透传字段 + 校验难度(1-5)等。levelconfig 结构本身未随 v0.5 变化，
// 这里主要保证难度落在 1-5、字段稳定，作为读取兜底。
export const normalizeLevelConfigItems = (items: unknown): LevelConfigFile => {
  if (!Array.isArray(items)) {
    throw new Error(t("levelconfig 数据必须是数组"))
  }

  return items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(t("levelconfig 第 {0} 项无效", index + 1))
    }

    const config = item as Record<string, unknown>
    const numericField = (key: string): number => {
      const value = Number(config[key])
      if (!Number.isFinite(value)) {
        throw new Error(t("levelconfig 第 {0} 项字段 {1} 非法", index + 1, key))
      }
      return value
    }

    return {
      ...config,
      id: numericField('id'),
      thumbnail: String(config.thumbnail ?? ''),
      type: numericField('type'),
      difficulty: normalizeIntegerInRange(config.difficulty, 'difficulty', 1, 5, 1),
      pixelImageId: numericField('pixelImageId'),
      widthHeight: ensureTuple(config.widthHeight, 'widthHeight'),
      storageMaxSlots: numericField('storageMaxSlots'),
      storageCols: numericField('storageCols'),
      storageInitialSlots: numericField('storageInitialSlots'),
      adUnlockIncrement: numericField('adUnlockIncrement'),
      initialTimeLimit: numericField('initialTimeLimit'),
      adTimeIncrement: numericField('adTimeIncrement'),
      reviveCount: numericField('reviveCount'),
      propConfigs: Array.isArray(config.propConfigs) ? config.propConfigs : []
    } satisfies LevelConfigItem
  })
}

export const parseLevelConfigFile = (text: string): LevelConfigFile =>
  normalizeLevelConfigItems(JSON.parse(text) as unknown)

export const isDailyLevelDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const normalizeDailyLevelConfigItems = (items: unknown): DailyLevelConfigItem[] => {
  if (!Array.isArray(items)) throw new Error(t("dailylevelconfig 数据必须是数组"))
  const seen = new Set<string>()
  return items.map((item, index) => {
    const id = item?.id
    if (typeof id !== 'string' || !isDailyLevelDate(id)) {
      throw new Error(t("dailylevelconfig 第 {0} 项 ID 必须是有效日期（YYYY-MM-DD）", index + 1))
    }
    if (seen.has(id)) throw new Error(t("dailylevelconfig 日期 {0} 重复", id))
    seen.add(id)
    // Reuse common field validation while retaining the daily file's date ID and type.
    const [normalized] = normalizeLevelConfigItems([{ ...item, id: index + 1 }])
    return { ...normalized, id }
  })
}

export const serializeLevelConfigFile = (items: ManagedLevelConfigItem[]): string =>
  `${JSON.stringify(items, null, 2)}\n`

export const inferNextPixelConfigId = (items: PixelConfigFile): number => {
  const maxId = items.reduce((currentMax, item) => Math.max(currentMax, item.id), 999)
  return maxId + 1
}

export const inferNextLevelConfigId = (
  items: LevelConfigFile,
  type: number
): number => {
  const filtered = items.filter((item) => item.type === type)
  const maxId = filtered.reduce((currentMax, item) => Math.max(currentMax, item.id), 0)
  return maxId + 1
}

export const buildLocalPixelResourceNames = (baseName: string, matrices: number[][][]): string[] => {
  const maxIndex = matrices.reduce((currentMax, matrix) => Math.max(currentMax, getMatrixMaxIndex(matrix)), -1)
  return Array.from({ length: maxIndex + 1 }, (_, index) => `${deriveAssetBaseName(baseName)}_${index}`)
}

export const DEFAULT_PIXEL_WIDTH_HEIGHT = [21, 21] as const

export const buildPixelConfigFromGridPair = (
  mapGrid: GridData,
  pointGrid: GridData,
  id: number
): PixelConfigItem => {
  const pixelMatrix = mapGrid.colorIndices.map((row) => [...row])

  return {
    id,
    name: deriveAssetBaseName(mapGrid.fileName),
    gridWidthHeight: [mapGrid.width, mapGrid.height],
    pixelWidthHeight: [...DEFAULT_PIXEL_WIDTH_HEIGHT],
    localPixelResource: buildLocalPixelResourceNames(mapGrid.fileName, [
      mapGrid.colorIndices,
      pointGrid.colorIndices
    ]),
    pixelMatrix,
    initPixel: pointGrid.colorIndices.map((row) => [...row]),
    beadCount: countPixelConfigBeads(pixelMatrix),
    difficulty: 1,
    quality: 1,
    imageType: 1,
    albumId: null
  }
}

export const isValidLevelTypeId = (value: unknown): value is number =>
  isFiniteInteger(value) && value > 0
