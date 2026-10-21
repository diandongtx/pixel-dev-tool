import { describe, expect, it } from 'vitest'
import type { BeadResourceCatalogItem } from '../beadResourceCatalog'
import { matchBeadResourcesForColors } from '../beadResourceMatcher'
import type { RGBColor } from '../../types/grid'

const color = (r: number, g: number, b: number): RGBColor => ({ r, g, b, a: 255 })

const catalogItem = (resourceName: string, compareColor: RGBColor): BeadResourceCatalogItem => ({
  resourceName,
  compareColor,
  stateFiles: {},
  compareSource: {
    stateCode: 4,
    samplingRule: 'state4-side-regions'
  }
})

describe('matchBeadResourcesForColors', () => {
  it('returns the closest resource group and alternatives', () => {
    const matches = matchBeadResourcesForColors(
      [color(240, 240, 230)],
      [
        catalogItem('bakery0', color(241, 240, 231)),
        catalogItem('banana_b0', color(149, 91, 38))
      ]
    )

    expect(matches[0]).toMatchObject({
      colorIndex: 0,
      resourceName: 'bakery0',
      confidence: 'high'
    })
    expect(matches[0]?.alternatives).toEqual([
      {
        resourceName: 'bakery0',
        distance: Math.sqrt(2)
      },
      {
        resourceName: 'banana_b0',
        distance: Math.sqrt(91 ** 2 + 149 ** 2 + 192 ** 2)
      }
    ])
  })

  it('marks far matches as low confidence', () => {
    const matches = matchBeadResourcesForColors(
      [color(0, 0, 255)],
      [catalogItem('bakery0', color(241, 240, 231))]
    )

    expect(matches[0]).toMatchObject({
      resourceName: 'bakery0',
      confidence: 'low'
    })
  })

  it('marks colors as missing when the catalog is empty', () => {
    expect(matchBeadResourcesForColors([color(1, 2, 3)], [])).toEqual([
      {
        colorIndex: 0,
        targetColor: color(1, 2, 3),
        resourceName: null,
        distance: null,
        confidence: 'missing',
        alternatives: []
      }
    ])
  })
})
