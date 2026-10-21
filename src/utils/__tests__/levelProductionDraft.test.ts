import { describe, expect, it } from 'vitest'
import type { PixelConfigItem } from '../../types/pixelConfig'
import type { BeadResourceMatch } from '../beadResourceMatcher'
import { applyBeadResourceMatchesToPixelConfig } from '../levelProductionDraft'
import { countPixelConfigBeads } from '../pixelConfigBeadCount'

const basePixelConfig: PixelConfigItem = {
  id: 1000,
  name: 'flower',
  gridWidthHeight: [2, 2],
  pixelWidthHeight: [2, 2],
  localPixelResource: ['flower_0', 'flower_1'],
  pixelMatrix: [
    [0, 1],
    [1, 0]
  ],
  initPixel: [
    [1, 0],
    [0, 1]
  ],
  beadCount: countPixelConfigBeads([
    [0, 1],
    [1, 0]
  ])
}

const match = (colorIndex: number, resourceName: string | null): BeadResourceMatch => ({
  colorIndex,
  targetColor: { r: 0, g: 0, b: 0, a: 255 },
  resourceName,
  distance: resourceName ? 0 : null,
  confidence: resourceName ? 'high' : 'missing',
  alternatives: []
})

describe('applyBeadResourceMatchesToPixelConfig', () => {
  it('writes resource group names in color index order without state suffixes', () => {
    const result = applyBeadResourceMatchesToPixelConfig(basePixelConfig, [
      match(1, 'banana_b0'),
      match(0, 'bakery0')
    ])

    expect(result.localPixelResource).toEqual(['bakery0', 'banana_b0'])
    expect(result.pixelMatrix).toEqual(basePixelConfig.pixelMatrix)
    expect(result.initPixel).toEqual(basePixelConfig.initPixel)
  })

  it('keeps the previous resource name when a color is missing', () => {
    const result = applyBeadResourceMatchesToPixelConfig(basePixelConfig, [
      match(0, 'bakery0'),
      match(1, null)
    ])

    expect(result.localPixelResource).toEqual(['bakery0', 'flower_1'])
  })
})
