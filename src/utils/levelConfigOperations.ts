import type { LevelConfigItem } from '../types/levelConfig'

export type LevelIdMoveMode = 'swap' | 'insert'

const cloneLevel = (level: LevelConfigItem): LevelConfigItem => ({
  ...level,
  widthHeight: [...level.widthHeight],
  propConfigs: [...level.propConfigs]
})

const sortLevels = (levels: LevelConfigItem[]): LevelConfigItem[] =>
  [...levels].sort((left, right) => left.id - right.id)

const getNextLevelId = (levels: LevelConfigItem[]): number =>
  levels.reduce((currentMax, level) => Math.max(currentMax, level.id), 0) + 1

export const appendLevel = (
  levels: LevelConfigItem[],
  level: LevelConfigItem
): LevelConfigItem[] => {
  const nextLevel = cloneLevel(level)
  nextLevel.id = getNextLevelId(levels)

  return sortLevels([
    ...levels.map(cloneLevel),
    nextLevel
  ])
}

export const deleteLevelAndShift = (
  levels: LevelConfigItem[],
  targetId: number
): LevelConfigItem[] =>
  sortLevels(
    levels
      .filter((level) => level.id !== targetId)
      .map((level) => {
        const nextLevel = cloneLevel(level)
        if (nextLevel.id > targetId) {
          nextLevel.id -= 1
        }
        return nextLevel
      })
  )

const moveLevelIdWithSwap = (
  levels: LevelConfigItem[],
  sourceId: number,
  targetId: number
): LevelConfigItem[] =>
  sortLevels(levels.map((level) => {
    const nextLevel = cloneLevel(level)
    if (nextLevel.id === sourceId) {
      nextLevel.id = targetId
    } else if (nextLevel.id === targetId) {
      nextLevel.id = sourceId
    }
    return nextLevel
  }))

const moveLevelIdWithInsert = (
  levels: LevelConfigItem[],
  sourceId: number,
  targetId: number
): LevelConfigItem[] => {
  if (sourceId === targetId) {
    return sortLevels(levels.map(cloneLevel))
  }

  return sortLevels(levels.map((level) => {
    const nextLevel = cloneLevel(level)

    if (nextLevel.id === sourceId) {
      nextLevel.id = targetId
    } else if (targetId < sourceId && nextLevel.id >= targetId && nextLevel.id < sourceId) {
      nextLevel.id += 1
    } else if (targetId > sourceId && nextLevel.id > sourceId && nextLevel.id <= targetId) {
      nextLevel.id -= 1
    }

    return nextLevel
  }))
}

export const moveLevelId = (
  levels: LevelConfigItem[],
  sourceId: number,
  targetId: number,
  mode: LevelIdMoveMode
): LevelConfigItem[] => {
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return sortLevels(levels.map(cloneLevel))
  }

  if (mode === 'swap') {
    return moveLevelIdWithSwap(levels, sourceId, targetId)
  }

  return moveLevelIdWithInsert(levels, sourceId, targetId)
}
