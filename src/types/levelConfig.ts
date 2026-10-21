export interface LevelConfigItem<Id extends number | string = number> {
  [key: string]: unknown
  id: Id
  thumbnail: string
  type: number
  difficulty: number
  pixelImageId: number
  widthHeight: [number, number]
  storageMaxSlots: number
  storageCols: number
  storageInitialSlots: number
  adUnlockIncrement: number
  initialTimeLimit: number
  adTimeIncrement: number
  reviveCount: number
  propConfigs: unknown[]
}

export type LevelConfigFile = LevelConfigItem[]
export type ManagedLevelConfigItem = LevelConfigItem<number | string>
export type DailyLevelConfigItem = LevelConfigItem<string>
