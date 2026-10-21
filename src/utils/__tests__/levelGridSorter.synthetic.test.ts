// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { GridData } from '../../types/grid'
import { generateRegionRecolorSortedGrid, generateStructureAwareSortedGrid } from '../levelGridSorter'
import { parseGridDataFile, parsePixelConfigFile } from '../configIO'

const colors = [
  { r: 230, g: 70, b: 90, a: 255 }, { r: 70, g: 160, b: 220, a: 255 },
  { r: 80, g: 190, b: 140, a: 255 }, { r: 240, g: 190, b: 60, a: 255 }
]
const shape = (name: string, pixel: (x: number, y: number) => number): GridData => ({
  width: 24, height: 24, colors, fileName: name,
  colorIndices: Array.from({ length: 24 }, (_, y) => Array.from({ length: 24 }, (_, x) =>
    x < 2 || y < 2 || x >= 22 || y >= 22 ? -2 : pixel(x - 2, y - 2)))
})
const cases = [
  shape('quadrants', (x, y) => (x < 10 ? 0 : 1) + (y < 10 ? 0 : 2)),
  shape('diagonal-bands', (x, y) => Math.floor((x + y) / 5) % 4),
  shape('dominant-frame', (x, y) => x < 4 || y < 4 || x >= 16 || y >= 16 ? 0 : 1 + (Math.floor(x / 4) + Math.floor(y / 4)) % 3)
]
const counts = (grid: GridData) => {
  const result = Array(grid.colors.length).fill(0) as number[]
  for (const row of grid.colorIndices) for (const value of row) if (value >= 0) result[value] += 1
  return result
}

for (const [name, generate] of [
  ['structure-aware', generateStructureAwareSortedGrid],
  ['region-recolor', generateRegionRecolorSortedGrid]
] as const) {
  describe(`${name}: original procedural geometries`, () => {
    for (const input of cases) {
      test(`${input.fileName}: preserves every color count, outline and source`, () => {
        const before = JSON.stringify(input)
        const result = generate(input, { seed: 42, maxRetries: 8, inferExternalBackground: false })
        expect(counts(result.grid)).toEqual(counts(input))
        expect([result.grid.width, result.grid.height]).toEqual([input.width, input.height])
        input.colorIndices.forEach((row, y) => row.forEach((value, x) => {
          if (value < 0) expect(result.grid.colorIndices[y][x]).toBe(value)
          else expect(result.grid.colorIndices[y][x]).toBeGreaterThanOrEqual(0)
        }))
        expect(JSON.stringify(input)).toBe(before)
      })
      test(`${input.fileName}: reproduces the result and metrics from its seed`, () => {
        const options = { seed: 7, maxRetries: 8, inferExternalBackground: false }
        const first = generate(input, options)
        const replay = generate(input, { ...options, seed: first.usedSeed })
        expect(replay.grid).toEqual(first.grid)
        expect(replay.metrics).toEqual(first.metrics)
        expect(replay.passed).toBe(first.passed)
        expect(first.attempts).toBeGreaterThan(0)
        // maxRetries counts retries after the initial attempt.
        expect(first.attempts).toBeLessThanOrEqual(options.maxRetries + 1)
      })
    }
  })
}

test('block size cap increases the number of pickups on a broad geometric design', () => {
  const input = cases[0]
  const options = { seed: 2, maxRetries: 20, inferExternalBackground: false }
  const uncapped = generateRegionRecolorSortedGrid(input, options)
  const capped = generateRegionRecolorSortedGrid(input, { ...options, maxBlockSize: 8 })
  expect(capped.metrics.pickupCount).toBeGreaterThan(uncapped.metrics.pickupCount)
  expect(counts(capped.grid)).toEqual(counts(input))
})

test('published example imports with a balanced starting configuration', () => {
  const example = (name: string) => readFileSync(fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url)), 'utf8')
  const grid = parseGridDataFile(example('geometric-mosaic-map.json'))
  const [config] = parsePixelConfigFile(example('pixelconfig.json'))
  expect(config.pixelMatrix).toEqual(grid.colorIndices)
  expect(config.beadCount).toBe(400)
  expect(counts({ ...grid, colorIndices: config.initPixel })).toEqual(counts(grid))
})
