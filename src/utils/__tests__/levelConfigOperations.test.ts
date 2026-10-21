import { describe, expect, it } from 'vitest'
import type { LevelConfigItem } from '../../types/levelConfig'
import {
  appendLevel,
  deleteLevelAndShift,
  moveLevelId
} from '../levelConfigOperations'

const createLevel = (id: number, pixelImageId = 1000 + id): LevelConfigItem => ({
  id,
  thumbnail: `image${pixelImageId}`,
  type: 1,
  difficulty: 1,
  pixelImageId,
  widthHeight: [1, 1],
  storageMaxSlots: 3,
  storageCols: 12,
  storageInitialSlots: 12,
  adUnlockIncrement: 12,
  initialTimeLimit: 180,
  adTimeIncrement: 180,
  reviveCount: 5,
  propConfigs: []
})

describe('level config operations', () => {
  it('appends a level to the next sequential id', () => {
    const nextLevels = appendLevel([
      createLevel(1, 1001),
      createLevel(2, 1002)
    ], createLevel(99, 2000))

    expect(nextLevels.map((item) => item.id)).toEqual([1, 2, 3])
    expect(nextLevels[nextLevels.length - 1]).toMatchObject({
      id: 3,
      pixelImageId: 2000
    })
  })

  it('deletes a level and shifts later ids forward', () => {
    const nextLevels = deleteLevelAndShift([
      createLevel(1, 1001),
      createLevel(2, 1002),
      createLevel(3, 1003)
    ], 2)

    expect(nextLevels.map((item) => [item.id, item.pixelImageId])).toEqual([
      [1, 1001],
      [2, 1003]
    ])
  })

  it('swaps ids when moving onto an existing level in swap mode', () => {
    const nextLevels = moveLevelId([
      createLevel(1, 1001),
      createLevel(2, 1002),
      createLevel(3, 1003),
      createLevel(4, 1004)
    ], 2, 4, 'swap')

    expect(nextLevels.map((item) => [item.id, item.pixelImageId])).toEqual([
      [1, 1001],
      [2, 1004],
      [3, 1003],
      [4, 1002]
    ])
  })

  it('inserts ids when moving onto an existing level in insert mode', () => {
    const nextLevels = moveLevelId([
      createLevel(1, 1001),
      createLevel(2, 1002),
      createLevel(3, 1003),
      createLevel(4, 1004),
      createLevel(5, 1005)
    ], 5, 2, 'insert')

    expect(nextLevels.map((item) => [item.id, item.pixelImageId])).toEqual([
      [1, 1001],
      [2, 1005],
      [3, 1002],
      [4, 1003],
      [5, 1004]
    ])
  })

  it('does not mutate the original levels', () => {
    const levels = [
      createLevel(1, 1001),
      createLevel(2, 1002)
    ]

    deleteLevelAndShift(levels, 1)

    expect(levels.map((item) => [item.id, item.pixelImageId])).toEqual([
      [1, 1001],
      [2, 1002]
    ])
  })
})
