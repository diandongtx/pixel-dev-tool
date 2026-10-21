import type { LevelStepEstimate } from './levelGridSorter'
import { estimateLevelRestoreSteps } from './levelGridSorter'
import type { PixelConfigItem } from '../types/pixelConfig'
import { buildPreviewGridDataFromMatrix } from './previewGrid'

export interface LevelQuickAssessment {
  valid: boolean
  reason: string | null
  estimatedSteps: number
  colorCount: number
  occupiedCellCount: number
  trayUsagePeak: number
  directPlacementStepCount: number
  trayTransferStepCount: number
  temporarySlotCount: number
  difficultyScore: number
  rawEstimate: LevelStepEstimate
}

export interface LevelSuggestedConfig {
  difficulty: number
  storageInitialSlots: number
  initialTimeLimit: number
  adTimeIncrement: number
}

// 统计矩阵集合中实际使用的颜色索引数（负值=空槽/图外，不计入）
export const countDistinctColors = (matrices: number[][][]): number => {
  const ids = new Set<number>()
  for (const matrix of matrices) {
    for (const row of matrix) {
      for (const value of row) {
        if (value >= 0) {
          ids.add(value)
        }
      }
    }
  }
  return ids.size
}

const countOccupiedCells = (matrix: number[][]): number => {
  let count = 0
  for (const row of matrix) {
    for (const value of row) {
      if (value >= 0) {
        count += 1
      }
    }
  }
  return count
}

export const assessLevelWithPixelConfig = (
  pixelConfig: PixelConfigItem,
  temporarySlotCount: number
): LevelQuickAssessment | null => {
  const target = buildPreviewGridDataFromMatrix(pixelConfig.pixelMatrix, `${pixelConfig.name}_target`)
  const current = buildPreviewGridDataFromMatrix(pixelConfig.initPixel, `${pixelConfig.name}_current`)
  if (!target || !current) {
    return null
  }

  const rawEstimate = estimateLevelRestoreSteps(target, current, temporarySlotCount)
  const colorCount = countDistinctColors([pixelConfig.pixelMatrix, pixelConfig.initPixel])
  const occupiedCellCount = countOccupiedCells(pixelConfig.pixelMatrix)
  const difficultyScore = Math.max(
    1,
    rawEstimate.estimatedStepCount +
      (rawEstimate.trayUsagePeak * 4) +
      (rawEstimate.trayTransferStepCount * 2) +
      (colorCount * 3)
  )

  return {
    valid: rawEstimate.valid,
    reason: rawEstimate.reason,
    estimatedSteps: rawEstimate.estimatedStepCount,
    colorCount,
    occupiedCellCount,
    trayUsagePeak: rawEstimate.trayUsagePeak,
    directPlacementStepCount: rawEstimate.directPlacementStepCount,
    trayTransferStepCount: rawEstimate.trayTransferStepCount,
    temporarySlotCount,
    difficultyScore,
    rawEstimate
  }
}

const pickTimeLimit = (estimatedSteps: number, difficultyScore: number): number => {
  if (estimatedSteps >= 80 || difficultyScore >= 120) return 300
  if (estimatedSteps >= 55 || difficultyScore >= 90) return 240
  if (estimatedSteps >= 36 || difficultyScore >= 60) return 210
  if (estimatedSteps >= 20 || difficultyScore >= 35) return 180
  return 150
}

const pickAdTimeIncrement = (initialTimeLimit: number, difficultyScore: number): number => {
  if (difficultyScore >= 120) return 300
  if (difficultyScore >= 90) return 240
  if (difficultyScore >= 60) return 180
  if (initialTimeLimit >= 180) return 150
  return 120
}

export const suggestLevelConfigValues = (
  assessment: LevelQuickAssessment | null
): LevelSuggestedConfig | null => {
  if (!assessment || !assessment.valid) {
    return null
  }

  const suggestedDifficulty =
    assessment.difficultyScore >= 100 ? 3
      : assessment.difficultyScore >= 45 ? 2
        : 1

  const suggestedStorageInitialSlots =
    assessment.trayUsagePeak >= 24 ? 36
      : assessment.trayUsagePeak >= 8 ? 24
        : 12

  const suggestedInitialTimeLimit = pickTimeLimit(
    assessment.estimatedSteps,
    assessment.difficultyScore
  )

  return {
    difficulty: suggestedDifficulty,
    storageInitialSlots: suggestedStorageInitialSlots,
    initialTimeLimit: suggestedInitialTimeLimit,
    adTimeIncrement: pickAdTimeIncrement(
      suggestedInitialTimeLimit,
      assessment.difficultyScore
    )
  }
}
