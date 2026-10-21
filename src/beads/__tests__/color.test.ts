import { describe, expect, it } from 'vitest'
import {
  clampByte,
  mapBean0_4LayerColor,
  mapDirectLayerColor,
  tintGrayPixel
} from '../color'

const referenceColor = { r: 219, g: 57, b: 55, a: 255 }
const baseLayerColor = { r: 153, g: 13, b: 12, a: 255 }
const targetColor = { r: 40, g: 161, b: 115, a: 255 }

describe('clampByte', () => {
  it('rounds and clamps to the 0 to 255 byte range', () => {
    expect(clampByte(-12.4)).toBe(0)
    expect(clampByte(12.4)).toBe(12)
    expect(clampByte(12.5)).toBe(13)
    expect(clampByte(300.1)).toBe(255)
  })
})

describe('mapDirectLayerColor', () => {
  it('returns the base layer color when the target matches the reference', () => {
    expect(mapDirectLayerColor(referenceColor, baseLayerColor, referenceColor)).toEqual(
      baseLayerColor
    )
  })

  it('preserves darker-versus-lighter ordering for a new target', () => {
    const darkerLayer = mapDirectLayerColor(referenceColor, baseLayerColor, targetColor)
    const lighterLayer = mapDirectLayerColor(referenceColor, referenceColor, targetColor)

    expect(darkerLayer.g).toBeLessThan(lighterLayer.g)
    expect(darkerLayer.a).toBe(255)
    expect(lighterLayer.a).toBe(255)
  })
})

describe('mapBean0_4LayerColor', () => {
  const anchorCases = [
    {
      name: 'orange',
      sideColor: { r: 252, g: 140, b: 15, a: 255 },
      expected: {
        'mid-up': { r: 249, g: 176, b: 62, a: 255 },
        'mid-left': { r: 252, g: 140, b: 15, a: 255 },
        'mid-right': { r: 252, g: 140, b: 15, a: 255 },
        'mid-down': { r: 229, g: 106, b: 0, a: 255 },
        'base-1': { r: 213, g: 89, b: 7, a: 255 },
        'top-frame': { r: 147, g: 49, b: 22, a: 255 }
      }
    },
    {
      name: 'green',
      sideColor: { r: 167, g: 191, b: 63, a: 255 },
      expected: {
        'mid-up': { r: 195, g: 219, b: 92, a: 255 },
        'mid-left': { r: 167, g: 191, b: 63, a: 255 },
        'mid-right': { r: 167, g: 191, b: 63, a: 255 },
        'mid-down': { r: 146, g: 171, b: 42, a: 255 },
        'base-1': { r: 124, g: 147, b: 31, a: 255 },
        'top-frame': { r: 96, g: 102, b: 12, a: 255 }
      }
    },
    {
      name: 'reference red',
      sideColor: { r: 171, g: 31, b: 30, a: 255 },
      expected: {
        'mid-up': { r: 219, g: 57, b: 55, a: 255 },
        'mid-left': { r: 171, g: 31, b: 30, a: 255 },
        'mid-right': { r: 171, g: 31, b: 30, a: 255 },
        'mid-down': { r: 153, g: 13, b: 12, a: 255 },
        'base-1': { r: 129, g: 13, b: 13, a: 255 },
        'top-frame': { r: 110, g: 8, b: 6, a: 255 }
      }
    },
    {
      name: 'white',
      sideColor: { r: 241, g: 240, b: 231, a: 255 },
      expected: {
        'mid-up': { r: 255, g: 255, b: 246, a: 255 },
        'mid-left': { r: 241, g: 240, b: 231, a: 255 },
        'mid-right': { r: 241, g: 240, b: 231, a: 255 },
        'mid-down': { r: 234, g: 233, b: 220, a: 255 },
        'base-1': { r: 205, g: 204, b: 190, a: 255 },
        'top-frame': { r: 121, g: 117, b: 114, a: 255 }
      }
    },
    {
      name: 'black',
      sideColor: { r: 55, g: 55, b: 55, a: 255 },
      expected: {
        'mid-up': { r: 81, g: 83, b: 84, a: 255 },
        'mid-left': { r: 55, g: 55, b: 55, a: 255 },
        'mid-right': { r: 55, g: 55, b: 55, a: 255 },
        'mid-down': { r: 45, g: 45, b: 45, a: 255 },
        'base-1': { r: 27, g: 26, b: 28, a: 255 },
        'top-frame': { r: 7, g: 2, b: 0, a: 255 }
      }
    },
    {
      name: 'cool blue',
      sideColor: { r: 31, g: 167, b: 219, a: 255 },
      expected: {
        'mid-up': { r: 72, g: 200, b: 245, a: 255 },
        'mid-left': { r: 31, g: 167, b: 219, a: 255 },
        'mid-right': { r: 31, g: 167, b: 219, a: 255 },
        'mid-down': { r: 16, g: 144, b: 199, a: 255 },
        'base-1': { r: 13, g: 120, b: 166, a: 255 },
        'top-frame': { r: 0, g: 80, b: 87, a: 255 }
      }
    },
    {
      name: 'purple',
      sideColor: { r: 134, g: 48, b: 174, a: 255 },
      expected: {
        'mid-up': { r: 178, g: 92, b: 218, a: 255 },
        'mid-left': { r: 134, g: 48, b: 174, a: 255 },
        'mid-right': { r: 134, g: 48, b: 174, a: 255 },
        'mid-down': { r: 125, g: 39, b: 165, a: 255 },
        'base-1': { r: 100, g: 14, b: 140, a: 255 },
        'top-frame': { r: 71, g: 1, b: 104, a: 255 }
      }
    },
    {
      name: 'soft amber',
      sideColor: { r: 247, g: 180, b: 103, a: 255 },
      expected: {
        'mid-up': { r: 247, g: 206, b: 153, a: 255 },
        'mid-left': { r: 247, g: 180, b: 103, a: 255 },
        'mid-right': { r: 247, g: 180, b: 103, a: 255 },
        'mid-down': { r: 243, g: 160, b: 71, a: 255 },
        'base-1': { r: 198, g: 120, b: 39, a: 255 },
        'top-frame': { r: 150, g: 79, b: 5, a: 255 }
      }
    },
    {
      name: 'rosewood',
      sideColor: { r: 121, g: 47, b: 64, a: 255 },
      expected: {
        'mid-up': { r: 160, g: 89, b: 97, a: 255 },
        'mid-left': { r: 121, g: 47, b: 64, a: 255 },
        'mid-right': { r: 121, g: 47, b: 64, a: 255 },
        'mid-down': { r: 110, g: 36, b: 49, a: 255 },
        'base-1': { r: 91, g: 26, b: 32, a: 255 },
        'top-frame': { r: 82, g: 8, b: 6, a: 255 }
      }
    },
    {
      name: 'bright yellow',
      sideColor: { r: 248, g: 199, b: 18, a: 255 },
      expected: {
        'mid-up': { r: 255, g: 224, b: 81, a: 255 },
        'mid-left': { r: 248, g: 199, b: 18, a: 255 },
        'mid-right': { r: 248, g: 199, b: 18, a: 255 },
        'mid-down': { r: 233, g: 152, b: 0, a: 255 },
        'base-1': { r: 203, g: 101, b: 0, a: 255 },
        'top-frame': { r: 147, g: 49, b: 22, a: 255 }
      }
    },
    {
      name: 'lavender',
      sideColor: { r: 185, g: 180, b: 222, a: 255 },
      expected: {
        'mid-up': { r: 204, g: 199, b: 241, a: 255 },
        'mid-left': { r: 185, g: 180, b: 222, a: 255 },
        'mid-right': { r: 185, g: 180, b: 222, a: 255 },
        'mid-down': { r: 157, g: 152, b: 194, a: 255 },
        'base-1': { r: 110, g: 105, b: 147, a: 255 },
        'top-frame': { r: 69, g: 64, b: 106, a: 255 }
      }
    },
    {
      name: 'warm coral',
      sideColor: { r: 240, g: 90, b: 78, a: 255 },
      expected: {
        'mid-up': { r: 255, g: 123, b: 112, a: 255 },
        'mid-left': { r: 240, g: 90, b: 78, a: 255 },
        'mid-right': { r: 240, g: 90, b: 78, a: 255 },
        'mid-down': { r: 213, g: 63, b: 51, a: 255 },
        'base-1': { r: 192, g: 42, b: 30, a: 255 },
        'top-frame': { r: 156, g: 13, b: 1, a: 255 }
      }
    }
  ] as const

  it('returns the exact hand-authored bean0_4 layer colors for known anchor side colors', () => {
    for (const anchorCase of anchorCases) {
      for (const [layerId, expectedColor] of Object.entries(anchorCase.expected)) {
        expect(
          mapBean0_4LayerColor(layerId, anchorCase.sideColor),
          `${anchorCase.name} ${layerId}`
        ).toEqual(expectedColor)
      }
    }
  })
})

describe('tintGrayPixel', () => {
  it('maps gray endpoints to black and the target color while preserving alpha', () => {
    expect(tintGrayPixel({ gray: 0, alpha: 128 }, targetColor)).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 128
    })

    expect(tintGrayPixel({ gray: 255, alpha: 128 }, targetColor)).toEqual({
      ...targetColor,
      a: 128
    })
  })
})
