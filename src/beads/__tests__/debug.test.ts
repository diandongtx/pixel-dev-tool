import { describe, expect, it } from 'vitest'
import {
  analyzeDebugSuspects,
  buildBeadDebugLayerFilename,
  resolveDebugExportBaseName
} from '../debug'
import {
  analyzeDebugSuspects as analyzeDebugSuspectsFromBarrel,
  buildBeadDebugLayerFilename as buildBeadDebugLayerFilenameFromBarrel,
  resolveDebugExportBaseName as resolveDebugExportBaseNameFromBarrel
} from '../index'
import type { BeadDebugSuspectHint } from '../types'

describe('resolveDebugExportBaseName', () => {
  it('prefers manual basename, then imported file stem, then debug fallback', () => {
    expect(resolveDebugExportBaseName(' custom-name ', 'flower_grid_colors.json')).toBe(
      'custom-name'
    )
    expect(resolveDebugExportBaseName('', 'flower_grid_colors.json')).toBe('flower_grid_colors')
    expect(resolveDebugExportBaseName('', '')).toBe('debug')
  })

  it('preserves dots in a manual basename while still stripping imported extensions', () => {
    expect(resolveDebugExportBaseName(' flower.v2 ', 'flower_grid_colors.json')).toBe('flower.v2')
    expect(resolveDebugExportBaseName('', 'flower.v2.png')).toBe('flower.v2')
  })
})

describe('buildBeadDebugLayerFilename', () => {
  it('uses the agreed debug layer suffix format', () => {
    expect(buildBeadDebugLayerFilename('flower', 0, 4, 'top-frame', 'composite')).toBe(
      'flower0_4_top-frame_composite.png'
    )
  })
})

describe('analyzeDebugSuspects', () => {
  it('marks fixed layers with strong hue mismatch as suspect', () => {
    const hints: BeadDebugSuspectHint[] = analyzeDebugSuspects(
      { r: 240, g: 156, b: 104, a: 255 },
      [
        {
          layerId: 'top-frame',
          kind: 'fixed',
          resolvedColor: { r: 110, g: 8, b: 6, a: 255 },
          usesGrayscaleTint: false
        },
        {
          layerId: 'mid-up',
          kind: 'direct',
          resolvedColor: { r: 240, g: 156, b: 104, a: 255 },
          usesGrayscaleTint: false
        }
      ]
    )

    expect(hints[0]).toMatchObject({
      layerId: 'top-frame',
      reason: 'fixed-hue-mismatch'
    })
  })

  it('marks grayscale-tinted layers that resolve much darker than the target', () => {
    const hints: BeadDebugSuspectHint[] = analyzeDebugSuspects(
      { r: 230, g: 215, b: 90, a: 255 },
      [
        {
          layerId: 'shadow',
          kind: 'tinted-grayscale',
          analysisColor: { r: 24, g: 22, b: 10, a: 255 },
          resolvedColor: { r: 230, g: 215, b: 90, a: 255 },
          usesGrayscaleTint: true
        }
      ]
    )

    expect(hints[0]).toMatchObject({
      layerId: 'shadow',
      reason: 'dark-grayscale'
    })
  })

  it('marks general resolved hue mismatches without duplicating stronger reasons', () => {
    const hints: BeadDebugSuspectHint[] = analyzeDebugSuspects(
      { r: 40, g: 161, b: 115, a: 255 },
      [
        {
          layerId: 'outline',
          kind: 'direct',
          resolvedColor: { r: 185, g: 45, b: 44, a: 255 },
          usesGrayscaleTint: false
        },
        {
          layerId: 'frame',
          kind: 'fixed',
          resolvedColor: { r: 110, g: 8, b: 6, a: 255 },
          usesGrayscaleTint: false
        }
      ]
    )

    expect(hints).toEqual([
      {
        layerId: 'outline',
        reason: 'resolved-hue-mismatch',
        message: expect.any(String)
      },
      {
        layerId: 'frame',
        reason: 'fixed-hue-mismatch',
        message: expect.any(String)
      }
    ])
  })

  it('returns an empty list when layers stay close to the target color intent', () => {
    expect(
      analyzeDebugSuspects(
        { r: 40, g: 161, b: 115, a: 255 },
        [
          {
          layerId: 'base',
          kind: 'direct',
          analysisColor: { r: 38, g: 150, b: 110, a: 255 },
          resolvedColor: { r: 38, g: 150, b: 110, a: 255 },
          usesGrayscaleTint: false
        },
        {
          layerId: 'shine',
          kind: 'fixed',
          analysisColor: { r: 255, g: 255, b: 255, a: 255 },
          resolvedColor: { r: 255, g: 255, b: 255, a: 255 },
          usesGrayscaleTint: false
        },
        {
          layerId: 'shadow',
          kind: 'tinted-grayscale',
          analysisColor: { r: 40, g: 161, b: 115, a: 255 },
          resolvedColor: { r: 40, g: 161, b: 115, a: 255 },
          usesGrayscaleTint: true
        }
        ]
      )
    ).toEqual([])
  })
})

describe('beads barrel exports', () => {
  it('re-exports the debug helpers', () => {
    expect(resolveDebugExportBaseNameFromBarrel).toBe(resolveDebugExportBaseName)
    expect(buildBeadDebugLayerFilenameFromBarrel).toBe(buildBeadDebugLayerFilename)
    expect(analyzeDebugSuspectsFromBarrel).toBe(analyzeDebugSuspects)
  })
})
