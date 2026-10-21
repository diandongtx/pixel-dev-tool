import { describe, expect, it } from 'vitest'
import type { LevelSuggestedConfig } from '../levelAssessment'
import type { PixelConfigItem } from '../../types/pixelConfig'
import type { LevelConfigItem } from '../../types/levelConfig'
import { countPixelConfigBeads } from '../pixelConfigBeadCount'
import {
  buildLevelConfigForPixelConfig,
  upsertPixelConfigDraft
} from '../levelProductionPublish'

const createPixelConfig = (
  id: number,
  name: string,
  widthHeight: [number, number] = [2, 3]
): PixelConfigItem => ({
  id,
  name,
  gridWidthHeight: widthHeight,
  pixelWidthHeight: widthHeight,
  localPixelResource: ['bakery0'],
  pixelMatrix: [[0]],
  initPixel: [[0]],
  beadCount: countPixelConfigBeads([[0]])
})

const createLevelConfig = (id: number, pixelImageId: number): LevelConfigItem => ({
  id,
  thumbnail: `level-${id}`,
  type: 1,
  difficulty: 1,
  pixelImageId,
  widthHeight: [2, 3],
  storageMaxSlots: 3,
  storageCols: 12,
  storageInitialSlots: 12,
  adUnlockIncrement: 12,
  initialTimeLimit: 180,
  adTimeIncrement: 180,
  reviveCount: 5,
  propConfigs: []
})

describe('upsertPixelConfigDraft', () => {
  it('replaces an existing pixel config with the same name and keeps its id', () => {
    const result = upsertPixelConfigDraft(
      [createPixelConfig(1000, 'flower')],
      createPixelConfig(1008, 'flower')
    )

    expect(result.action).toBe('replaced')
    expect(result.item.id).toBe(1000)
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 1000,
        name: 'flower'
      })
    ])
  })

  it('assigns the next id when a new draft conflicts with an existing id', () => {
    const result = upsertPixelConfigDraft(
      [createPixelConfig(1000, 'flower')],
      createPixelConfig(1000, 'cat')
    )

    expect(result.action).toBe('added')
    expect(result.item).toEqual(
      expect.objectContaining({
        id: 1001,
        name: 'cat'
      })
    )
    expect(result.items.map((item) => item.id)).toEqual([1000, 1001])
  })
})

describe('buildLevelConfigForPixelConfig', () => {
  it('appends a main level using suggested config values when available', () => {
    const suggestedConfig: LevelSuggestedConfig = {
      difficulty: 2,
      storageInitialSlots: 24,
      initialTimeLimit: 210,
      adTimeIncrement: 180
    }
    const result = buildLevelConfigForPixelConfig(
      [createLevelConfig(1, 999)],
      createPixelConfig(1001, 'cat', [5, 6]),
      1,
      suggestedConfig
    )

    expect(result.level).toEqual(
      expect.objectContaining({
        id: 2,
        thumbnail: 'cat',
        type: 1,
        difficulty: 2,
        pixelImageId: 1001,
        widthHeight: [5, 6],
        storageInitialSlots: 24,
        initialTimeLimit: 210,
        adTimeIncrement: 180
      })
    )
    expect(result.items.map((item) => item.id)).toEqual([1, 2])
  })

  it('uses the pixel difficulty as the source when creating a level', () => {
    const result = buildLevelConfigForPixelConfig(
      [],
      {
        ...createPixelConfig(1001, 'cat', [5, 6]),
        difficulty: 3
      },
      1,
      {
        difficulty: 2,
        storageInitialSlots: 24,
        initialTimeLimit: 210,
        adTimeIncrement: 180
      }
    )

    expect(result.level.difficulty).toBe(3)
  })
})
