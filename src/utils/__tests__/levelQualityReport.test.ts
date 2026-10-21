import { describe, expect, it } from 'vitest'
import type { GridData } from '../../types/grid'
import type { PixelConfigItem } from '../../types/pixelConfig'
import { buildLevelQualityReport } from '../levelQualityReport'
import { countPixelConfigBeads } from '../pixelConfigBeadCount'

const colors = [
  { r: 255, g: 255, b: 255, a: 255 },
  { r: 248, g: 248, b: 246, a: 255 },
  { r: 30, g: 130, b: 70, a: 255 },
  { r: 210, g: 80, b: 40, a: 255 }
]

const createGrid = (
  colorIndices: number[][],
  gridColors = colors,
  fileName = 'test-map'
): GridData => ({
  width: colorIndices[0]?.length ?? 0,
  height: colorIndices.length,
  colorIndices,
  colors: gridColors,
  fileName
})

const createPixelConfig = (mapGrid: GridData, pointGrid = mapGrid): PixelConfigItem => ({
  id: 1000,
  name: mapGrid.fileName,
  gridWidthHeight: [mapGrid.width, mapGrid.height],
  pixelWidthHeight: [pointGrid.width, pointGrid.height],
  localPixelResource: mapGrid.colors.map((_, index) => `test${index}`),
  pixelMatrix: mapGrid.colorIndices,
  initPixel: pointGrid.colorIndices,
  beadCount: countPixelConfigBeads(mapGrid.colorIndices)
})

describe('buildLevelQualityReport', () => {
  it('marks mismatched map and point dimensions as an error', () => {
    const mapGrid = createGrid([
      [0, 0],
      [0, 0]
    ])
    const pointGrid = createGrid([[0, 0, 0]])
    const report = buildLevelQualityReport(mapGrid, pointGrid, createPixelConfig(mapGrid, pointGrid))

    expect(report.severity).toBe('error')
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dimension-consistency',
          severity: 'error'
        })
      ])
    )
  })

  it('reports similar colors and isolated pixels without blocking the level', () => {
    const mapGrid = createGrid([
      [0, 0, -2, -2],
      [0, 1, -2, 2],
      [-2, -2, -2, -2],
      [3, -2, 2, 2]
    ])
    const report = buildLevelQualityReport(mapGrid, mapGrid, createPixelConfig(mapGrid))

    expect(report.severity).toBe('warning')
    expect(report.metrics.similarColorPairCount).toBeGreaterThan(0)
    expect(report.metrics.isolatedPixelCount).toBeGreaterThan(0)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'similar-colors', severity: 'warning' }),
        expect.objectContaining({ id: 'small-regions', severity: 'warning' })
      ])
    )
  })

  it('includes difficulty metrics and suggested level config for valid drafts', () => {
    const mapGrid = createGrid([
      [0, 0, 1],
      [2, 2, 1],
      [3, 3, 3]
    ])
    const pointGrid = createGrid([
      [0, 0, 1],
      [2, 2, 1],
      [3, 3, 3]
    ])
    const report = buildLevelQualityReport(mapGrid, pointGrid, createPixelConfig(mapGrid, pointGrid))

    expect(report.metrics.occupiedCellCount).toBe(9)
    expect(report.assessment?.valid).toBe(true)
    expect(report.suggestedConfig).toEqual(
      expect.objectContaining({
        difficulty: expect.any(Number),
        storageInitialSlots: expect.any(Number),
        initialTimeLimit: expect.any(Number),
        adTimeIncrement: expect.any(Number)
      })
    )
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'difficulty-estimate', severity: 'pass' })
      ])
    )
  })
})
