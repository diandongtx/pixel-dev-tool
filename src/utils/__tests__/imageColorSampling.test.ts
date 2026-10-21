import { describe, expect, it } from 'vitest'
import {
  extractDominantOpaqueColor,
  extractSideRegionCompareColor,
  pickDominantOpaqueColor
} from '../imageColorSampling'

const rgba = (r: number, g: number, b: number, a = 255): [number, number, number, number] => [r, g, b, a]

const createImageDataLike = (
  width: number,
  height: number,
  fill: [number, number, number, number],
  patches: Array<{ x: number, y: number, width: number, height: number, color: [number, number, number, number] }> = []
) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    data.set(fill, index * 4)
  }

  for (const patch of patches) {
    for (let y = patch.y; y < patch.y + patch.height; y += 1) {
      for (let x = patch.x; x < patch.x + patch.width; x += 1) {
        data.set(patch.color, ((y * width) + x) * 4)
      }
    }
  }

  return { width, height, data }
}

describe('pickDominantOpaqueColor', () => {
  it('ignores transparent pixels and returns the most frequent opaque color', () => {
    const color = pickDominantOpaqueColor([
      rgba(1, 2, 3, 0),
      rgba(10, 20, 30),
      rgba(10, 20, 30),
      rgba(40, 50, 60)
    ])

    expect(color).toEqual({ r: 10, g: 20, b: 30, a: 255 })
  })
})

describe('extractSideRegionCompareColor', () => {
  it('uses left and right middle regions instead of center, top, or bottom colors', () => {
    const image = createImageDataLike(84, 84, rgba(99, 99, 99), [
      { x: 17, y: 34, width: 10, height: 16, color: rgba(241, 240, 231) },
      { x: 57, y: 34, width: 10, height: 16, color: rgba(241, 240, 231) },
      { x: 38, y: 34, width: 10, height: 16, color: rgba(234, 233, 220) },
      { x: 38, y: 17, width: 10, height: 16, color: rgba(255, 255, 246) }
    ])

    expect(extractSideRegionCompareColor(image)).toEqual({
      r: 241,
      g: 240,
      b: 231,
      a: 255
    })
  })
})

describe('extractDominantOpaqueColor', () => {
  it('uses the dominant opaque color from the whole image for fallback resources', () => {
    const image = createImageDataLike(4, 1, rgba(0, 0, 0, 0), [
      { x: 0, y: 0, width: 3, height: 1, color: rgba(12, 34, 56) },
      { x: 3, y: 0, width: 1, height: 1, color: rgba(90, 80, 70) }
    ])

    expect(extractDominantOpaqueColor(image)).toEqual({
      r: 12,
      g: 34,
      b: 56,
      a: 255
    })
  })
})
