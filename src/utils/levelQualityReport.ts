import type { GridData, RGBColor } from '../types/grid'
import type { PixelConfigItem } from '../types/pixelConfig'
import {
  assessLevelWithPixelConfig,
  suggestLevelConfigValues,
  type LevelQuickAssessment,
  type LevelSuggestedConfig
} from './levelAssessment'
import {
  buildRegionRecolorGroups,
  computeFixedFloor,
  computeRegionRecolorMetrics,
  computeSortQualityMetrics,
  rrAdaptiveFixedThreshold,
  SA_H4_FIXED_CELL_RATIO_WARNING
} from './levelGridSorter'

export type LevelQualitySeverity = 'pass' | 'warning' | 'error'

export interface LevelQualityCheck {
  id: string
  title: string
  severity: LevelQualitySeverity
  message: string
  details?: string[]
}

export interface LevelQualityMetrics {
  width: number
  height: number
  colorCount: number
  occupiedCellCount: number
  similarColorPairCount: number
  isolatedPixelCount: number
  smallRegionCount: number
  // 结构感知打乱相关（修正二口径：H2/H3/pickup 在非锁定格上算）
  structureRetention?: number
  smallBlockRatio?: number
  greedyTailRun?: number
  pickupCount?: number
  fixedCellRatio?: number
  // 区域重染色相关（v2，仅 regionRecolor 模式的排序结果计算）
  contourPreservation?: number
  regionPurity?: number
  regionCount?: number
  // 图源适配性（与模式无关）
  dominantColorRatio?: number
}

export interface BuildLevelQualityReportOptions {
  pickupCountBand?: [number, number]
  // 排序结果由哪种模式产生；regionRecolor 时追加轮廓保留/区域纯度 check（文档 v2 第 7 节）
  sortMode?: 'regionRecolor' | 'structure' | 'legacy'
}

export interface LevelQualityReport {
  severity: LevelQualitySeverity
  metrics: LevelQualityMetrics
  checks: LevelQualityCheck[]
  assessment: LevelQuickAssessment | null
  suggestedConfig: LevelSuggestedConfig | null
}

interface SimilarColorPair {
  leftIndex: number
  rightIndex: number
  distance: number
}

interface SmallRegion {
  colorIndex: number
  size: number
  x: number
  y: number
}

const MAX_RECOMMENDED_COLOR_COUNT = 16
const MAX_ALLOWED_COLOR_COUNT = 24
const SIMILAR_COLOR_DISTANCE = 28
const SMALL_REGION_MAX_SIZE = 2
const DEFAULT_TEMPORARY_SLOT_COUNT = 12
// 结构感知打乱 check 阈值（文档第 6 节）
const STRUCTURE_RETENTION_WARNING = 0.55
const STRUCTURE_RETENTION_ERROR = 0.40
const SMALL_BLOCK_RATIO_WARNING = 0.10
const SMALL_BLOCK_RATIO_ERROR = 0.20
const GREEDY_TAIL_RUN_WARNING = 8
const GREEDY_TAIL_RUN_ERROR = 20
const FIXED_CELL_RATIO_ERROR = 0.50
const DEFAULT_PICKUP_COUNT_BAND: [number, number] = [40, 80]
// 区域重染色 check 阈值（文档 v2 第 7 节）
const CONTOUR_PRESERVATION_WARNING = 0.75
const CONTOUR_PRESERVATION_ERROR = 0.60
const REGION_PURITY_WARNING = 0.80
const REGION_PURITY_ERROR = 0.65
// 图源适配性：主导色占比（与模式无关）
const DOMINANT_COLOR_RATIO_WARNING = 0.50
const DOMINANT_COLOR_RATIO_ERROR = 0.60

const isFilledCell = (value: number): boolean => value >= 0

const colorToHex = (color: RGBColor | undefined): string => {
  if (!color) return '------'

  return [color.r, color.g, color.b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0').toUpperCase())
    .join('')
}

const calculateColorDistance = (left: RGBColor, right: RGBColor): number => {
  const red = left.r - right.r
  const green = left.g - right.g
  const blue = left.b - right.b

  return Math.sqrt((red * red) + (green * green) + (blue * blue))
}

const getUsedColorIndices = (grid: GridData): number[] => {
  const usedIndices = new Set<number>()
  for (const row of grid.colorIndices) {
    for (const value of row) {
      if (isFilledCell(value)) {
        usedIndices.add(value)
      }
    }
  }

  return [...usedIndices].sort((left, right) => left - right)
}

const countFilledCells = (grid: GridData): number => {
  let count = 0
  for (const row of grid.colorIndices) {
    for (const value of row) {
      if (isFilledCell(value)) {
        count += 1
      }
    }
  }

  return count
}

const findSimilarColorPairs = (grid: GridData, usedColorIndices: number[]): SimilarColorPair[] => {
  const pairs: SimilarColorPair[] = []

  for (let left = 0; left < usedColorIndices.length; left += 1) {
    for (let right = left + 1; right < usedColorIndices.length; right += 1) {
      const leftIndex = usedColorIndices[left]
      const rightIndex = usedColorIndices[right]
      const leftColor = grid.colors[leftIndex]
      const rightColor = grid.colors[rightIndex]
      if (!leftColor || !rightColor) continue

      const distance = calculateColorDistance(leftColor, rightColor)
      if (distance <= SIMILAR_COLOR_DISTANCE) {
        pairs.push({ leftIndex, rightIndex, distance })
      }
    }
  }

  return pairs.sort((left, right) => left.distance - right.distance)
}

const findSmallRegions = (grid: GridData): SmallRegion[] => {
  const visited = grid.colorIndices.map((row) => row.map(() => false))
  const regions: SmallRegion[] = []
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ] as const

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const colorIndex = grid.colorIndices[y]?.[x]
      if (!isFilledCell(colorIndex) || visited[y]?.[x]) continue

      const queue: Array<[number, number]> = [[x, y]]
      visited[y][x] = true
      let size = 0

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const [currentX, currentY] = queue[cursor]
        size += 1

        for (const [offsetX, offsetY] of directions) {
          const nextX = currentX + offsetX
          const nextY = currentY + offsetY
          if (nextX < 0 || nextY < 0 || nextX >= grid.width || nextY >= grid.height) continue
          if (visited[nextY]?.[nextX] || grid.colorIndices[nextY]?.[nextX] !== colorIndex) continue

          visited[nextY][nextX] = true
          queue.push([nextX, nextY])
        }
      }

      if (size <= SMALL_REGION_MAX_SIZE) {
        regions.push({ colorIndex, size, x, y })
      }
    }
  }

  return regions
}

const hasSameDimensions = (mapGrid: GridData, pointGrid: GridData): boolean =>
  mapGrid.width === pointGrid.width && mapGrid.height === pointGrid.height

const hasAnyCellDifference = (mapGrid: GridData, pointGrid: GridData): boolean => {
  for (let y = 0; y < mapGrid.height; y += 1) {
    const mapRow = mapGrid.colorIndices[y]
    const pointRow = pointGrid.colorIndices[y]
    for (let x = 0; x < mapGrid.width; x += 1) {
      if (mapRow?.[x] !== pointRow?.[x]) return true
    }
  }
  return false
}

const getOverallSeverity = (checks: LevelQualityCheck[]): LevelQualitySeverity => {
  if (checks.some((check) => check.severity === 'error')) return 'error'
  if (checks.some((check) => check.severity === 'warning')) return 'warning'
  return 'pass'
}

export const buildLevelQualityReport = (
  mapGrid: GridData,
  pointGrid: GridData | null,
  pixelConfig: PixelConfigItem | null,
  options?: BuildLevelQualityReportOptions
): LevelQualityReport => {
  const effectivePointGrid = pointGrid ?? mapGrid
  const pickupCountBand = options?.pickupCountBand ?? DEFAULT_PICKUP_COUNT_BAND
  const usedColorIndices = getUsedColorIndices(mapGrid)
  const occupiedCellCount = countFilledCells(mapGrid)
  const similarColorPairs = findSimilarColorPairs(mapGrid, usedColorIndices)
  const smallRegions = findSmallRegions(mapGrid)
  const isolatedPixelCount = smallRegions.filter((region) => region.size === 1).length
  const checks: LevelQualityCheck[] = []

  if (mapGrid.width <= 0 || mapGrid.height <= 0 || occupiedCellCount === 0) {
    checks.push({
      id: 'map-validity',
      title: 'map 数据',
      severity: 'error',
      message: 'map 为空或尺寸异常，需要先确认导入/裁剪结果。'
    })
  } else {
    checks.push({
      id: 'map-validity',
      title: 'map 数据',
      severity: 'pass',
      message: `尺寸 ${mapGrid.width}x${mapGrid.height}，有效像素 ${occupiedCellCount} 个。`
    })
  }

  if (!hasSameDimensions(mapGrid, effectivePointGrid)) {
    checks.push({
      id: 'dimension-consistency',
      title: 'map / point 尺寸',
      severity: 'error',
      message: `map 为 ${mapGrid.width}x${mapGrid.height}，point 为 ${effectivePointGrid.width}x${effectivePointGrid.height}，生成关卡前需要保持一致。`
    })
  } else {
    checks.push({
      id: 'dimension-consistency',
      title: 'map / point 尺寸',
      severity: 'pass',
      message: 'map 与 point 尺寸一致。'
    })
  }

  if (usedColorIndices.length > MAX_ALLOWED_COLOR_COUNT) {
    checks.push({
      id: 'color-count',
      title: '颜色数量',
      severity: 'error',
      message: `当前使用 ${usedColorIndices.length} 种颜色，超过建议上限 ${MAX_ALLOWED_COLOR_COUNT}，玩家区分和资源匹配都会变难。`
    })
  } else if (usedColorIndices.length > MAX_RECOMMENDED_COLOR_COUNT) {
    checks.push({
      id: 'color-count',
      title: '颜色数量',
      severity: 'warning',
      message: `当前使用 ${usedColorIndices.length} 种颜色，建议检查是否可以合并相近色。`
    })
  } else if (usedColorIndices.length <= 1) {
    checks.push({
      id: 'color-count',
      title: '颜色数量',
      severity: 'warning',
      message: '当前有效颜色过少，关卡可能缺少辨识度。'
    })
  } else {
    checks.push({
      id: 'color-count',
      title: '颜色数量',
      severity: 'pass',
      message: `当前使用 ${usedColorIndices.length} 种颜色，处于可控范围。`
    })
  }

  if (similarColorPairs.length > 0) {
    checks.push({
      id: 'similar-colors',
      title: '相近颜色',
      severity: 'warning',
      message: `发现 ${similarColorPairs.length} 组相近颜色，建议合并或换豆子资源。`,
      details: similarColorPairs.slice(0, 5).map((pair) =>
        `#${pair.leftIndex} ${colorToHex(mapGrid.colors[pair.leftIndex])} 与 #${pair.rightIndex} ${colorToHex(mapGrid.colors[pair.rightIndex])}，距离 ${pair.distance.toFixed(1)}`
      )
    })
  } else {
    checks.push({
      id: 'similar-colors',
      title: '相近颜色',
      severity: 'pass',
      message: '没有发现明显相近的已使用颜色。'
    })
  }

  if (smallRegions.length > 0) {
    checks.push({
      id: 'small-regions',
      title: '孤立像素 / 小色块',
      severity: 'warning',
      message: `发现 ${smallRegions.length} 个 1-${SMALL_REGION_MAX_SIZE} 格的小区域，其中孤立像素 ${isolatedPixelCount} 个。`,
      details: smallRegions.slice(0, 5).map((region) =>
        `#${region.colorIndex} ${colorToHex(mapGrid.colors[region.colorIndex])}，${region.size} 格，起点 (${region.x + 1}, ${region.y + 1})`
      )
    })
  } else {
    checks.push({
      id: 'small-regions',
      title: '孤立像素 / 小色块',
      severity: 'pass',
      message: '没有发现明显孤立像素或过小色块。'
    })
  }

  // 图源适配性（文档 v2 第 7 节，与模式无关）：主导色占比过高 → 区域重染色无处可换色
  let dominantColorRatio = 0
  if (occupiedCellCount > 0) {
    const colorCounts = new Map<number, number>()
    for (const row of mapGrid.colorIndices) {
      for (const value of row) {
        if (isFilledCell(value)) colorCounts.set(value, (colorCounts.get(value) ?? 0) + 1)
      }
    }
    let maxCount = 0
    for (const count of colorCounts.values()) {
      if (count > maxCount) maxCount = count
    }
    dominantColorRatio = maxCount / occupiedCellCount
  }
  if (dominantColorRatio > DOMINANT_COLOR_RATIO_ERROR) {
    checks.push({
      id: 'dominant-color-ratio',
      title: '主导色占比',
      severity: 'error',
      message: `主导色占比 ${(dominantColorRatio * 100).toFixed(0)}%，超过 ${DOMINANT_COLOR_RATIO_ERROR * 100}%。主导色占比过高的图不适配区域重染色，建议更换图源。`
    })
  } else if (dominantColorRatio > DOMINANT_COLOR_RATIO_WARNING) {
    checks.push({
      id: 'dominant-color-ratio',
      title: '主导色占比',
      severity: 'warning',
      message: `主导色占比 ${(dominantColorRatio * 100).toFixed(0)}%，超过 ${DOMINANT_COLOR_RATIO_WARNING * 100}%。主导色占比过高的图不适配区域重染色，建议更换图源。`
    })
  } else {
    checks.push({
      id: 'dominant-color-ratio',
      title: '主导色占比',
      severity: 'pass',
      message: `主导色占比 ${(dominantColorRatio * 100).toFixed(0)}%。`
    })
  }

  // 结构感知打乱指标：仅当 pointGrid 是「真正的打乱结果」时才计算。
  // 判定标准：pointGrid 与 mapGrid 同尺寸，且至少存在一格差异（即非完全未打乱）。
  // 否则（pointGrid==mapGrid 或 pointGrid 为 null）跳过——未打乱的图结构指标无意义。
  // 修正二口径：H2/H3/pickup 在「非锁定格」上算（computeSortQualityMetrics 内部已处理）
  let structureMetrics: ReturnType<typeof computeSortQualityMetrics> | null = null
  let regionRecolorMetrics: ReturnType<typeof computeRegionRecolorMetrics> | null = null
  const pointGridIsShuffled = !!pointGrid && hasSameDimensions(mapGrid, pointGrid) && hasAnyCellDifference(mapGrid, pointGrid)
  if (pointGridIsShuffled) {
    const slotSet = new Set<number>()
    for (let y = 0; y < mapGrid.height; y += 1) {
      for (let x = 0; x < mapGrid.width; x += 1) {
        if (mapGrid.colorIndices[y]?.[x] >= 0) slotSet.add(y * mapGrid.width + x)
      }
    }
    structureMetrics = computeSortQualityMetrics(pointGrid.colorIndices, mapGrid.colorIndices, slotSet)

    // 区域重染色专属 check（文档 v2 第 7 节）：仅当排序结果由 regionRecolor 产生时计算。
    // 区域组按默认 minRegionSize 从目标图重建（与生成器指标口径一致）
    if (options?.sortMode === 'regionRecolor') {
      const groups = buildRegionRecolorGroups(mapGrid.colorIndices, slotSet)
      regionRecolorMetrics = computeRegionRecolorMetrics(pointGrid.colorIndices, mapGrid.colorIndices, slotSet, groups)

      if (regionRecolorMetrics.contourPreservation < CONTOUR_PRESERVATION_ERROR) {
        checks.push({ id: 'contour-preservation', title: '轮廓保留', severity: 'error',
          message: `轮廓保留 ${regionRecolorMetrics.contourPreservation.toFixed(2)}，低于 ${CONTOUR_PRESERVATION_ERROR}，目标图轮廓已难以辨认。` })
      } else if (regionRecolorMetrics.contourPreservation < CONTOUR_PRESERVATION_WARNING) {
        checks.push({ id: 'contour-preservation', title: '轮廓保留', severity: 'warning',
          message: `轮廓保留 ${regionRecolorMetrics.contourPreservation.toFixed(2)}，建议 ≥ ${CONTOUR_PRESERVATION_WARNING}。` })
      } else {
        checks.push({ id: 'contour-preservation', title: '轮廓保留', severity: 'pass',
          message: `轮廓保留 ${regionRecolorMetrics.contourPreservation.toFixed(2)}。` })
      }

      if (regionRecolorMetrics.regionPurity < REGION_PURITY_ERROR) {
        checks.push({ id: 'region-purity', title: '区域纯度', severity: 'error',
          message: `区域纯度 ${regionRecolorMetrics.regionPurity.toFixed(2)}，低于 ${REGION_PURITY_ERROR}，区域内部混色严重。` })
      } else if (regionRecolorMetrics.regionPurity < REGION_PURITY_WARNING) {
        checks.push({ id: 'region-purity', title: '区域纯度', severity: 'warning',
          message: `区域纯度 ${regionRecolorMetrics.regionPurity.toFixed(2)}，建议 ≥ ${REGION_PURITY_WARNING}。` })
      } else {
        checks.push({ id: 'region-purity', title: '区域纯度', severity: 'pass',
          message: `区域纯度 ${regionRecolorMetrics.regionPurity.toFixed(2)}。` })
      }
    }

    if (structureMetrics.structureRetention < STRUCTURE_RETENTION_ERROR) {
      checks.push({ id: 'structure-retention', title: '结构保留度', severity: 'error',
        message: `结构保留度 ${structureMetrics.structureRetention.toFixed(2)}，低于 ${STRUCTURE_RETENTION_ERROR}，开局难以辨认目标图。` })
    } else if (structureMetrics.structureRetention < STRUCTURE_RETENTION_WARNING) {
      checks.push({ id: 'structure-retention', title: '结构保留度', severity: 'warning',
        message: `结构保留度 ${structureMetrics.structureRetention.toFixed(2)}，建议 ≥ ${STRUCTURE_RETENTION_WARNING}。` })
    } else {
      checks.push({ id: 'structure-retention', title: '结构保留度', severity: 'pass',
        message: `结构保留度 ${structureMetrics.structureRetention.toFixed(2)}。` })
    }

    if (structureMetrics.smallBlockRatio > SMALL_BLOCK_RATIO_ERROR) {
      checks.push({ id: 'small-block-ratio', title: '小块占比', severity: 'error',
        message: `1-2 颗块占比 ${(structureMetrics.smallBlockRatio * 100).toFixed(0)}%，超过 ${SMALL_BLOCK_RATIO_ERROR * 100}%，拾取过碎。` })
    } else if (structureMetrics.smallBlockRatio > SMALL_BLOCK_RATIO_WARNING) {
      checks.push({ id: 'small-block-ratio', title: '小块占比', severity: 'warning',
        message: `1-2 颗块占比 ${(structureMetrics.smallBlockRatio * 100).toFixed(0)}%，建议 ≤ ${SMALL_BLOCK_RATIO_WARNING * 100}%。` })
    } else {
      checks.push({ id: 'small-block-ratio', title: '小块占比', severity: 'pass',
        message: `1-2 颗块占比 ${(structureMetrics.smallBlockRatio * 100).toFixed(0)}%。` })
    }

    if (structureMetrics.greedyTailRun > GREEDY_TAIL_RUN_ERROR) {
      checks.push({ id: 'greedy-tail-run', title: '收尾尾串', severity: 'error',
        message: `贪心尾串 ${structureMetrics.greedyTailRun}，超过 ${GREEDY_TAIL_RUN_ERROR}，收尾过长。` })
    } else if (structureMetrics.greedyTailRun > GREEDY_TAIL_RUN_WARNING) {
      checks.push({ id: 'greedy-tail-run', title: '收尾尾串', severity: 'warning',
        message: `贪心尾串 ${structureMetrics.greedyTailRun}，建议 ≤ ${GREEDY_TAIL_RUN_WARNING}。` })
    } else {
      checks.push({ id: 'greedy-tail-run', title: '收尾尾串', severity: 'pass',
        message: `贪心尾串 ${structureMetrics.greedyTailRun}。` })
    }

    // H4 = 白送进度（落原位）。
    // regionRecolor（v2.1 §5）：自适应线 = max(0.05, fixedFloor + 0.07)，error = 阈值 + 0.10；
    // B 策略的回家豆是 intentional 预完成格，不按 v1 的 0.50/0.45 判
    if (options?.sortMode === 'regionRecolor') {
      const fixedFloor = computeFixedFloor(mapGrid.colorIndices, slotSet)
      const fixedWarning = rrAdaptiveFixedThreshold(fixedFloor)
      const fixedError = fixedWarning + 0.10
      if (structureMetrics.fixedCellRatio > fixedError) {
        checks.push({ id: 'fixed-cell-ratio', title: '开局白送进度', severity: 'error',
          message: `落原位占比 ${(structureMetrics.fixedCellRatio * 100).toFixed(0)}%，超过自适应上限 ${(fixedError * 100).toFixed(0)}%（fixedFloor ${(fixedFloor * 100).toFixed(0)}%），开局白送过多、关卡偏短。` })
      } else if (structureMetrics.fixedCellRatio > fixedWarning) {
        checks.push({ id: 'fixed-cell-ratio', title: '开局白送进度', severity: 'warning',
          message: `落原位占比 ${(structureMetrics.fixedCellRatio * 100).toFixed(0)}%，建议 ≤ ${(fixedWarning * 100).toFixed(0)}%（fixedFloor ${(fixedFloor * 100).toFixed(0)}%）。` })
      } else {
        checks.push({ id: 'fixed-cell-ratio', title: '开局白送进度', severity: 'pass',
          message: `落原位占比 ${(structureMetrics.fixedCellRatio * 100).toFixed(0)}%（自适应上限 ${(fixedWarning * 100).toFixed(0)}%）。` })
      }
    } else if (structureMetrics.fixedCellRatio > FIXED_CELL_RATIO_ERROR) {
      checks.push({ id: 'fixed-cell-ratio', title: '开局白送进度', severity: 'error',
        message: `落原位占比 ${(structureMetrics.fixedCellRatio * 100).toFixed(0)}%，超过 ${(FIXED_CELL_RATIO_ERROR * 100).toFixed(0)}%，开局白送过多、关卡偏短。` })
    } else if (structureMetrics.fixedCellRatio > SA_H4_FIXED_CELL_RATIO_WARNING) {
      checks.push({ id: 'fixed-cell-ratio', title: '开局白送进度', severity: 'warning',
        message: `落原位占比 ${(structureMetrics.fixedCellRatio * 100).toFixed(0)}%，建议 ≤ ${(SA_H4_FIXED_CELL_RATIO_WARNING * 100).toFixed(0)}%。` })
    } else {
      checks.push({ id: 'fixed-cell-ratio', title: '开局白送进度', severity: 'pass',
        message: `落原位占比 ${(structureMetrics.fixedCellRatio * 100).toFixed(0)}%。` })
    }

    const [bandLow, bandHigh] = pickupCountBand
    const overBy = structureMetrics.pickupCount > bandHigh
      ? (structureMetrics.pickupCount - bandHigh) / bandHigh
      : 0
    const underBy = structureMetrics.pickupCount < bandLow
      ? (bandLow - structureMetrics.pickupCount) / bandLow
      : 0
    const exceedRatio = Math.max(overBy, underBy)
    if (exceedRatio > 0.5) {
      checks.push({ id: 'pickup-count-band', title: '操作数带宽', severity: 'error',
        message: `预估拾取 ${structureMetrics.pickupCount} 次，超出带宽 ${bandLow}-${bandHigh} 达 ${(exceedRatio * 100).toFixed(0)}%。` })
    } else if (structureMetrics.pickupCount < bandLow || structureMetrics.pickupCount > bandHigh) {
      checks.push({ id: 'pickup-count-band', title: '操作数带宽', severity: 'warning',
        message: `预估拾取 ${structureMetrics.pickupCount} 次，超出带宽 ${bandLow}-${bandHigh}。` })
    } else {
      checks.push({ id: 'pickup-count-band', title: '操作数带宽', severity: 'pass',
        message: `预估拾取 ${structureMetrics.pickupCount} 次，落在带宽 ${bandLow}-${bandHigh}。` })
    }
  }

  const assessment = pixelConfig && hasSameDimensions(mapGrid, effectivePointGrid)
    ? assessLevelWithPixelConfig(pixelConfig, DEFAULT_TEMPORARY_SLOT_COUNT)
    : null
  const suggestedConfig = suggestLevelConfigValues(assessment)

  if (!pixelConfig) {
    checks.push({
      id: 'difficulty-estimate',
      title: '难度估算',
      severity: 'warning',
      message: '缺少 pixelconfig 草稿，暂时无法估算关卡步数。'
    })
  } else if (!assessment) {
    checks.push({
      id: 'difficulty-estimate',
      title: '难度估算',
      severity: 'warning',
      message: '当前矩阵无法生成难度估算，请检查 map / point 数据。'
    })
  } else if (!assessment.valid) {
    checks.push({
      id: 'difficulty-estimate',
      title: '难度估算',
      severity: 'error',
      message: assessment.reason ?? '当前初始状态无法还原到目标 map，请检查 point 草稿。'
    })
  } else {
    checks.push({
      id: 'difficulty-estimate',
      title: '难度估算',
      severity: 'pass',
      message: `预计 ${assessment.estimatedSteps} 步，峰值占用 ${assessment.trayUsagePeak}/${assessment.temporarySlotCount}，难度分 ${assessment.difficultyScore}。`,
      details: suggestedConfig
        ? [
            `建议 difficulty=${suggestedConfig.difficulty}`,
            `建议 storageInitialSlots=${suggestedConfig.storageInitialSlots}`,
            `建议 initialTimeLimit=${suggestedConfig.initialTimeLimit}`,
            `建议 adTimeIncrement=${suggestedConfig.adTimeIncrement}`
          ]
        : undefined
    })
  }

  const metrics: LevelQualityMetrics = {
    width: mapGrid.width,
    height: mapGrid.height,
    colorCount: usedColorIndices.length,
    occupiedCellCount,
    similarColorPairCount: similarColorPairs.length,
    isolatedPixelCount,
    smallRegionCount: smallRegions.length,
    structureRetention: structureMetrics?.structureRetention,
    smallBlockRatio: structureMetrics?.smallBlockRatio,
    greedyTailRun: structureMetrics?.greedyTailRun,
    pickupCount: structureMetrics?.pickupCount,
    fixedCellRatio: structureMetrics?.fixedCellRatio,
    contourPreservation: regionRecolorMetrics?.contourPreservation,
    regionPurity: regionRecolorMetrics?.regionPurity,
    regionCount: regionRecolorMetrics?.regionCount,
    dominantColorRatio
  }

  return {
    severity: getOverallSeverity(checks),
    metrics,
    checks,
    assessment,
    suggestedConfig
  }
}
