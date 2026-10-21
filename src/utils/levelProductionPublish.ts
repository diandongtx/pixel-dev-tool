import type { LevelConfigFile, LevelConfigItem } from '../types/levelConfig'
import type { PixelConfigFile, PixelConfigItem } from '../types/pixelConfig'
import type { LevelSuggestedConfig } from './levelAssessment'
import { inferNextPixelConfigId } from './configIO'
import { appendLevel } from './levelConfigOperations'

export const DEFAULT_MAIN_LEVEL_TYPE = 1

export const DEFAULT_LEVEL_VALUES = {
  difficulty: 1,
  storageMaxSlots: 3,
  storageCols: 12,
  storageInitialSlots: 12,
  adUnlockIncrement: 12,
  initialTimeLimit: 180,
  adTimeIncrement: 180,
  reviveCount: 5
} as const

export type LevelConfigValueOverrides = Partial<Pick<
  LevelConfigItem,
  | 'difficulty'
  | 'storageMaxSlots'
  | 'storageCols'
  | 'storageInitialSlots'
  | 'adUnlockIncrement'
  | 'initialTimeLimit'
  | 'adTimeIncrement'
  | 'reviveCount'
>>

export type PixelConfigPublishAction = 'added' | 'replaced'

export interface PixelConfigPublishResult {
  action: PixelConfigPublishAction
  item: PixelConfigItem
  items: PixelConfigFile
}

export interface LevelConfigPublishResult {
  level: LevelConfigItem
  items: LevelConfigFile
}

export const clonePixelConfigItem = (item: PixelConfigItem): PixelConfigItem => ({
  ...item,
  gridWidthHeight: [...item.gridWidthHeight],
  pixelWidthHeight: [...item.pixelWidthHeight],
  localPixelResource: [...item.localPixelResource],
  pixelMatrix: item.pixelMatrix.map((row) => [...row]),
  initPixel: item.initPixel.map((row) => [...row])
})

const sortPixelConfigs = (items: PixelConfigFile): PixelConfigFile =>
  [...items].sort((left, right) => left.id - right.id || left.name.localeCompare(right.name))

export const upsertPixelConfigDraft = (
  existingItems: PixelConfigFile,
  draftItem: PixelConfigItem
): PixelConfigPublishResult => {
  const nextItems = existingItems.map(clonePixelConfigItem)
  const nextItem = clonePixelConfigItem(draftItem)
  const sameNameIndex = nextItems.findIndex((item) => item.name === nextItem.name)

  if (sameNameIndex >= 0) {
    nextItem.id = nextItems[sameNameIndex].id
    nextItems.splice(sameNameIndex, 1, nextItem)
    return {
      action: 'replaced',
      item: clonePixelConfigItem(nextItem),
      items: sortPixelConfigs(nextItems)
    }
  }

  if (nextItems.some((item) => item.id === nextItem.id)) {
    nextItem.id = inferNextPixelConfigId(nextItems)
  }

  nextItems.push(nextItem)

  return {
    action: 'added',
    item: clonePixelConfigItem(nextItem),
    items: sortPixelConfigs(nextItems)
  }
}

export const createLevelConfigItem = (
  pixelConfig: PixelConfigItem,
  type: number,
  id: number,
  suggestedConfig: LevelSuggestedConfig | null,
  overrides: LevelConfigValueOverrides = {}
): LevelConfigItem => ({
  id,
  thumbnail: pixelConfig.name,
  type,
  difficulty: overrides.difficulty ?? pixelConfig.difficulty ?? suggestedConfig?.difficulty ?? DEFAULT_LEVEL_VALUES.difficulty,
  pixelImageId: pixelConfig.id,
  widthHeight: [...pixelConfig.pixelWidthHeight] as [number, number],
  storageMaxSlots: overrides.storageMaxSlots ?? DEFAULT_LEVEL_VALUES.storageMaxSlots,
  storageCols: overrides.storageCols ?? DEFAULT_LEVEL_VALUES.storageCols,
  storageInitialSlots: overrides.storageInitialSlots ?? suggestedConfig?.storageInitialSlots ?? DEFAULT_LEVEL_VALUES.storageInitialSlots,
  adUnlockIncrement: overrides.adUnlockIncrement ?? DEFAULT_LEVEL_VALUES.adUnlockIncrement,
  initialTimeLimit: overrides.initialTimeLimit ?? suggestedConfig?.initialTimeLimit ?? DEFAULT_LEVEL_VALUES.initialTimeLimit,
  adTimeIncrement: overrides.adTimeIncrement ?? suggestedConfig?.adTimeIncrement ?? DEFAULT_LEVEL_VALUES.adTimeIncrement,
  reviveCount: overrides.reviveCount ?? DEFAULT_LEVEL_VALUES.reviveCount,
  propConfigs: []
})

export const buildLevelConfigForPixelConfig = (
  existingLevels: LevelConfigFile,
  pixelConfig: PixelConfigItem,
  type = DEFAULT_MAIN_LEVEL_TYPE,
  suggestedConfig: LevelSuggestedConfig | null = null,
  overrides: LevelConfigValueOverrides = {}
): LevelConfigPublishResult => {
  const levelDraft = createLevelConfigItem(pixelConfig, type, 0, suggestedConfig, overrides)
  const items = appendLevel(existingLevels, levelDraft)
  const level = items.find((item) => item.pixelImageId === pixelConfig.id && item.thumbnail === pixelConfig.name)
    ?? items[items.length - 1]

  return {
    level,
    items
  }
}
