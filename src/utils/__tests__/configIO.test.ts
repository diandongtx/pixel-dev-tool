import { describe, expect, it } from 'vitest'
import type { GridData } from '../../types/grid'
import type { PixelConfigItem } from '../../types/pixelConfig'
import {
  buildPixelConfigFromGridPair,
  isDailyLevelDate,
  parseLevelConfigFile,
  parsePixelConfigFile,
  serializePixelConfigFile
} from '../configIO'
import { countPixelConfigBeads } from '../pixelConfigBeadCount'

const createGrid = (fileName: string, width: number, height: number): GridData => ({
  fileName,
  width,
  height,
  colorIndices: Array.from({ length: height }, () => Array.from({ length: width }, () => 0)),
  colors: [{ r: 255, g: 255, b: 255, a: 255 }]
})

describe('daily level dates', () => {
  it.each(['2026-02-30', '2026-02-29', '2026-13-01', '1', '2026-5-01'])('rejects invalid date %s', (date) => {
    expect(isDailyLevelDate(date)).toBe(false)
  })
  it('accepts calendar dates including leap days', () => {
    expect(isDailyLevelDate('2026-05-01')).toBe(true)
    expect(isDailyLevelDate('2028-02-29')).toBe(true)
  })
})

describe('buildPixelConfigFromGridPair', () => {
  it('keeps pixelWidthHeight fixed at 21x21 regardless of source grid dimensions', () => {
    const mapGrid = createGrid('flower_map', 8, 9)
    const pointGrid = createGrid('flower_point', 12, 13)

    const pixelConfig = buildPixelConfigFromGridPair(mapGrid, pointGrid, 1000)

    expect(pixelConfig.gridWidthHeight).toEqual([8, 9])
    expect(pixelConfig.pixelWidthHeight).toEqual([21, 21])
    expect(pixelConfig.beadCount).toBe(72)
  })

  it('fills v0.5 metadata defaults for new pixel config records', () => {
    const mapGrid = createGrid('flower_map', 8, 9)
    const pointGrid = createGrid('flower_point', 8, 9)

    const pixelConfig = buildPixelConfigFromGridPair(mapGrid, pointGrid, 1000)

    expect(pixelConfig).toMatchObject({
      difficulty: 1,
      quality: 1,
      imageType: 1,
      albumId: null
    })
  })
})

describe('parsePixelConfigFile', () => {
  it('preserves v0.5 and future metadata fields while normalizing required fields', () => {
    const [item] = parsePixelConfigFile(JSON.stringify([
      {
        id: '1000',
        name: ' flower ',
        gridWidthHeight: ['2', 3],
        pixelWidthHeight: [21, '21'],
        localPixelResource: [123, 'ABCDEF'],
        pixelMatrix: [['0', 1]],
        initPixel: [[0, '1']],
        theme: 'animal',
        difficulty: '3',
        quality: '5',
        imageType: '2',
        albumId: 88,
        originRunId: 'run-1',
        futureField: { keep: true }
      }
    ]))

    expect(item).toEqual({
      id: 1000,
      name: 'flower',
      gridWidthHeight: [2, 3],
      pixelWidthHeight: [21, 21],
      localPixelResource: ['123', 'ABCDEF'],
      pixelMatrix: [[0, 1]],
      initPixel: [[0, 1]],
      beadCount: 2,
      theme: 'animal',
      difficulty: 3,
      quality: 5,
      imageType: 2,
      albumId: '88',
      originRunId: 'run-1',
      futureField: { keep: true }
    })
  })

  it('derives absent and invalid bead counts while retaining valid saved counts', () => {
    const basePixelConfig: Omit<PixelConfigItem, 'beadCount'> = {
      id: 1000,
      name: 'flower',
      gridWidthHeight: [2, 1],
      pixelWidthHeight: [21, 21],
      localPixelResource: [],
      pixelMatrix: [[0, 1]],
      initPixel: [[0, 1]]
    }

    const items = parsePixelConfigFile(JSON.stringify([
      basePixelConfig,
      { ...basePixelConfig, beadCount: undefined },
      { ...basePixelConfig, pixelMatrix: [[0, -1, 2]], beadCount: -1 },
      { ...basePixelConfig, beadCount: '' },
      { ...basePixelConfig, beadCount: null },
      { ...basePixelConfig, beadCount: 1.5 },
      { ...basePixelConfig, beadCount: '99' },
      { ...basePixelConfig, beadCount: 99 }
    ]))

    expect(items.map((item) => item.beadCount)).toEqual([2, 2, 2, 2, 2, 2, 2, 99])
  })

  it('accepts five difficulty tiers and rejects values outside the tier range', () => {
    const basePixelConfig = {
      id: 1000,
      name: 'flower',
      gridWidthHeight: [2, 3],
      pixelWidthHeight: [21, 21],
      localPixelResource: [],
      pixelMatrix: [[0]],
      initPixel: [[0]]
    }

    expect(parsePixelConfigFile(JSON.stringify([{ ...basePixelConfig, difficulty: 5 }]))[0].difficulty).toBe(5)
    expect(() => parsePixelConfigFile(JSON.stringify([{ ...basePixelConfig, difficulty: 6 }]))).toThrow(
      'difficulty 必须是 1-5 的整数'
    )
  })

  it('defaults missing v0.5 numeric metadata to mainline values', () => {
    const [item] = parsePixelConfigFile(JSON.stringify([
      {
        id: 1000,
        name: 'flower',
        gridWidthHeight: [2, 3],
        pixelWidthHeight: [21, 21],
        localPixelResource: [],
        pixelMatrix: [[0]],
        initPixel: [[0]]
      }
    ]))

    expect(item.difficulty).toBe(1)
    expect(item.quality).toBe(1)
    expect(item.imageType).toBe(1)
    expect(item.albumId).toBeNull()
    expect(serializePixelConfigFile([item])).toBe(`${JSON.stringify([item])}\n`)
  })
})

describe('countPixelConfigBeads', () => {
  it('counts zero and positive cells but excludes negative cells', () => {
    expect(countPixelConfigBeads([[0, 2, -1], [-5, 0, 4], []])).toBe(4)
    expect(countPixelConfigBeads([])).toBe(0)
  })
})

describe('parseLevelConfigFile', () => {
  it('preserves unused legacy and future fields while normalizing known fields', () => {
    const [item] = parseLevelConfigFile(JSON.stringify([
      {
        id: '1',
        thumbnail: 'flower',
        type: '1',
        difficulty: '2',
        pixelImageId: '1000',
        widthHeight: ['21', 21],
        storageMaxSlots: '3',
        storageCols: '12',
        storageInitialSlots: '36',
        adUnlockIncrement: '12',
        initialTimeLimit: '300',
        adTimeIncrement: '300',
        reviveCount: '5',
        propConfigs: [{ id: 'hammer' }],
        theme: 'legacy-theme',
        futureField: 'keep'
      }
    ]))

    expect(item).toMatchObject({
      id: 1,
      difficulty: 2,
      pixelImageId: 1000,
      widthHeight: [21, 21],
      theme: 'legacy-theme',
      futureField: 'keep'
    })
  })

  it('accepts five difficulty tiers for level config and rejects values outside the tier range', () => {
    const baseLevelConfig = {
      id: 1,
      thumbnail: 'flower',
      type: 1,
      pixelImageId: 1000,
      widthHeight: [21, 21],
      storageMaxSlots: 3,
      storageCols: 12,
      storageInitialSlots: 36,
      adUnlockIncrement: 12,
      initialTimeLimit: 300,
      adTimeIncrement: 300,
      reviveCount: 5,
      propConfigs: []
    }

    expect(parseLevelConfigFile(JSON.stringify([{ ...baseLevelConfig, difficulty: 5 }]))[0].difficulty).toBe(5)
    expect(() => parseLevelConfigFile(JSON.stringify([{ ...baseLevelConfig, difficulty: 6 }]))).toThrow(
      'difficulty 必须是 1-5 的整数'
    )
  })
})
