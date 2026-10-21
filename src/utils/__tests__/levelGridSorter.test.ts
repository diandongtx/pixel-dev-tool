import { describe, expect, test, vi } from 'vitest'
import type { GridData } from '../../types/grid'
import { generateSortedGridByTargetBlockCount } from '../levelGridSorter'
import { EXTERNAL_BACKGROUND_INDEX } from '../subjectGrid'

const directions = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
]

const createGrid = (colorIndices: number[][]): GridData => ({
  width: colorIndices[0]?.length ?? 0,
  height: colorIndices.length,
  colorIndices,
  colors: [
    { r: 220, g: 40, b: 40, a: 255 },
    { r: 40, g: 220, b: 40, a: 255 },
    { r: 40, g: 40, b: 220, a: 255 },
    { r: 220, g: 180, b: 40, a: 255 }
  ],
  fileName: 'test-grid'
})

const countColors = (grid: number[][]): Map<number, number> => {
  const counts = new Map<number, number>()
  for (const row of grid) {
    for (const value of row) {
      if (value < 0) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return counts
}

const countColorComponents = (grid: number[][]): number => {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const visited = Array.from({ length: height }, () => Array(width).fill(false))
  let componentCount = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colorId = grid[y][x]
      if (colorId < 0 || visited[y][x]) continue

      componentCount += 1
      visited[y][x] = true
      const queue = [{ x, y }]

      while (queue.length > 0) {
        const current = queue.shift()
        if (!current) continue

        for (const direction of directions) {
          const nx = current.x + direction.x
          const ny = current.y + direction.y
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (visited[ny][nx] || grid[ny][nx] !== colorId) continue
          visited[ny][nx] = true
          queue.push({ x: nx, y: ny })
        }
      }
    }
  }

  return componentCount
}

const collectColorComponents = (grid: number[][]): Array<{ colorId: number, cells: Array<{ x: number, y: number }> }> => {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const visited = Array.from({ length: height }, () => Array(width).fill(false))
  const components: Array<{ colorId: number, cells: Array<{ x: number, y: number }> }> = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colorId = grid[y][x]
      if (colorId < 0 || visited[y][x]) continue

      const cells = [{ x, y }]
      const queue = [{ x, y }]
      visited[y][x] = true

      while (queue.length > 0) {
        const current = queue.shift()
        if (!current) continue

        for (const direction of directions) {
          const nx = current.x + direction.x
          const ny = current.y + direction.y
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (visited[ny][nx] || grid[ny][nx] !== colorId) continue
          visited[ny][nx] = true
          const next = { x: nx, y: ny }
          queue.push(next)
          cells.push(next)
        }
      }

      components.push({ colorId, cells })
    }
  }

  return components
}

const buildSourceTemplateIds = (grid: number[][]): number[][] => {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const templateIds = Array.from({ length: height }, () => Array(width).fill(-1))
  let nextTemplateId = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colorId = grid[y][x]
      if (colorId < 0 || templateIds[y][x] >= 0) continue

      const queue = [{ x, y }]
      templateIds[y][x] = nextTemplateId

      while (queue.length > 0) {
        const current = queue.shift()
        if (!current) continue

        for (const direction of directions) {
          const nx = current.x + direction.x
          const ny = current.y + direction.y
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (templateIds[ny][nx] >= 0 || grid[ny][nx] !== colorId) continue
          templateIds[ny][nx] = nextTemplateId
          queue.push({ x: nx, y: ny })
        }
      }

      nextTemplateId += 1
    }
  }

  return templateIds
}

const getTemplateAffinityRatio = (
  component: { cells: Array<{ x: number, y: number }> },
  templateIds: number[][]
): number => {
  const counts = new Map<number, number>()
  for (const cell of component.cells) {
    const templateId = templateIds[cell.y][cell.x]
    counts.set(templateId, (counts.get(templateId) ?? 0) + 1)
  }
  return Math.max(...counts.values()) / component.cells.length
}

const getLongestStraightColorRun = (grid: number[][]): number => {
  let longestRun = 0

  for (const row of grid) {
    let previous = Number.NaN
    let currentRun = 0
    for (const value of row) {
      if (value >= 0 && value === previous) {
        currentRun += 1
      } else {
        currentRun = value >= 0 ? 1 : 0
      }
      previous = value
      longestRun = Math.max(longestRun, currentRun)
    }
  }

  const width = grid[0]?.length ?? 0
  for (let x = 0; x < width; x += 1) {
    let previous = Number.NaN
    let currentRun = 0
    for (let y = 0; y < grid.length; y += 1) {
      const value = grid[y][x]
      if (value >= 0 && value === previous) {
        currentRun += 1
      } else {
        currentRun = value >= 0 ? 1 : 0
      }
      previous = value
      longestRun = Math.max(longestRun, currentRun)
    }
  }

  return longestRun
}

const countSingletonComponents = (grid: number[][]): number => (
  collectColorComponents(grid).filter((component) => component.cells.length === 1).length
)

const countOriginalColorMatches = (source: number[][], generated: number[][]): number => {
  let matches = 0
  for (let y = 0; y < source.length; y += 1) {
    for (let x = 0; x < (source[y]?.length ?? 0); x += 1) {
      if (source[y][x] >= 0 && source[y][x] === generated[y]?.[x]) {
        matches += 1
      }
    }
  }
  return matches
}

const getMaxTemplateOverflowRatio = (source: number[][], generated: number[][]): number => {
  const templateIds = buildSourceTemplateIds(source)
  const components = collectColorComponents(generated)
  if (components.length === 0) return 0

  return Math.max(...components.map((component) => {
    const templateCounts = new Map<number, number>()
    for (const cell of component.cells) {
      const templateId = templateIds[cell.y][cell.x]
      templateCounts.set(templateId, (templateCounts.get(templateId) ?? 0) + 1)
    }
    const dominantCount = Math.max(...templateCounts.values())
    return (component.cells.length - dominantCount) / component.cells.length
  }))
}

describe('generateSortedGridByTargetBlockCount', () => {
  test('preserves color counts and only fills original bead slots', () => {
    const source = createGrid([
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 1, -1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 1, 2, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 6)

    expect(countColors(generated.colorIndices)).toEqual(countColors(source.colorIndices))
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        if (source.colorIndices[y][x] < 0) {
          expect(generated.colorIndices[y][x]).toBe(source.colorIndices[y][x])
        } else {
          expect(generated.colorIndices[y][x]).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  test('normalizes detected external background slots to -2 in the generated grid', () => {
    const source = createGrid([
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, EXTERNAL_BACKGROUND_INDEX],
      [0, 1, 1, 2, 0],
      [0, 1, 2, 2, 0],
      [0, 3, 3, 2, 0],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, EXTERNAL_BACKGROUND_INDEX]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 4, {
      normalizeExternalBackground: true
    })

    expect(generated.colorIndices[0]).toEqual([
      EXTERNAL_BACKGROUND_INDEX,
      EXTERNAL_BACKGROUND_INDEX,
      EXTERNAL_BACKGROUND_INDEX,
      EXTERNAL_BACKGROUND_INDEX,
      EXTERNAL_BACKGROUND_INDEX
    ])
    expect(generated.colorIndices[4]).toEqual([
      EXTERNAL_BACKGROUND_INDEX,
      EXTERNAL_BACKGROUND_INDEX,
      EXTERNAL_BACKGROUND_INDEX,
      EXTERNAL_BACKGROUND_INDEX,
      EXTERNAL_BACKGROUND_INDEX
    ])
    for (let y = 1; y <= 3; y += 1) {
      expect(generated.colorIndices[y][0]).toBe(EXTERNAL_BACKGROUND_INDEX)
      expect(generated.colorIndices[y][4]).toBe(EXTERNAL_BACKGROUND_INDEX)
    }
  })

  test('uses an explicit background index when normalizing external background slots', () => {
    const source = createGrid([
      [0, 1, 1, 1, 0],
      [0, 1, 2, 1, 0],
      [0, 1, 2, 1, 0],
      [0, 1, 2, 1, 0],
      [0, 0, 0, 0, 0]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 2, {
      backgroundIndex: 1,
      normalizeExternalBackground: true
    })

    expect(generated.colorIndices[0][1]).toBe(EXTERNAL_BACKGROUND_INDEX)
    expect(generated.colorIndices[2][1]).toBe(EXTERNAL_BACKGROUND_INDEX)
    expect(generated.colorIndices[1][0]).not.toBe(EXTERNAL_BACKGROUND_INDEX)
    expect(generated.colorIndices[1][0]).toBeGreaterThanOrEqual(0)
  })

  test('does not infer a new edge background from an already cropped subject grid', () => {
    const source = createGrid([
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, EXTERNAL_BACKGROUND_INDEX],
      [0, 0, 1, 1, 0, 0],
      [0, 1, 2, 2, 1, 0],
      [0, 1, 2, 2, 1, 0],
      [0, 0, 1, 1, 0, 0],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, EXTERNAL_BACKGROUND_INDEX]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 4, {
      inferExternalBackground: false,
      normalizeExternalBackground: true
    })

    expect(countColors(generated.colorIndices)).toEqual(countColors(source.colorIndices))
  })

  test('does not normalize a solid subject rectangle without explicit external markers', () => {
    const source = createGrid([
      [0, 1],
      [1, 0]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 2, {
      normalizeExternalBackground: true
    })

    expect(generated.colorIndices.flat()).not.toContain(EXTERNAL_BACKGROUND_INDEX)
  })

  test('keeps requested blocks below color count near one block per color', () => {
    const source = createGrid([
      [0, 0, 1, 1],
      [0, 0, 1, 1],
      [2, 2, 3, 3],
      [2, 2, 3, 3]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 2)

    expect(countColorComponents(generated.colorIndices)).toBeGreaterThanOrEqual(4)
    expect(countColorComponents(generated.colorIndices)).toBeLessThanOrEqual(6)
  })

  test('allows target block count to soften when template fill merges same colors', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42)
    const source = createGrid([
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 1, 1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 1, 1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 1, 1, 0, 0, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 1, 1, 0, 0, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 4)

    expect(countColors(generated.colorIndices)).toEqual(countColors(source.colorIndices))
    expect(countColorComponents(generated.colorIndices)).toBeGreaterThanOrEqual(2)
    expect(countColorComponents(generated.colorIndices)).toBeLessThanOrEqual(4)
    vi.restoreAllMocks()
  })

  test('keeps large block contours two-dimensional instead of scanline bands', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42)
    const source = createGrid([
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, 1, 1, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, 1, 1, 1, 1, EXTERNAL_BACKGROUND_INDEX],
      [0, 0, 0, 2, 2, 1, 1, 1, 1, 1],
      [0, 0, 2, 2, 2, 2, 1, 1, 1, 1],
      [EXTERNAL_BACKGROUND_INDEX, 2, 2, 2, 2, 3, 3, 1, 1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 2, 2, 2, 3, 3, 3, 3, 1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, 2, 3, 3, 3, 3, 3, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, 3, 3, 3, 3, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 8)
    const largeComponents = collectColorComponents(generated.colorIndices)
      .filter((component) => component.cells.length >= 5)

    for (const component of largeComponents) {
      const xs = component.cells.map((cell) => cell.x)
      const ys = component.cells.map((cell) => cell.y)
      expect(Math.max(...xs) - Math.min(...xs) + 1).toBeGreaterThan(1)
      expect(Math.max(...ys) - Math.min(...ys) + 1).toBeGreaterThan(1)
    }
    vi.restoreAllMocks()
  })

  test('does not fall back to long scanline bands for high block targets', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42)
    const source = createGrid([
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, 1, 1, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, 1, 1, 1, 1, EXTERNAL_BACKGROUND_INDEX],
      [0, 0, 0, 2, 2, 1, 1, 1, 1, 1],
      [0, 0, 2, 2, 2, 2, 1, 1, 1, 1],
      [EXTERNAL_BACKGROUND_INDEX, 2, 2, 2, 2, 3, 3, 1, 1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 2, 2, 2, 3, 3, 3, 3, 1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, 2, 3, 3, 3, 3, 3, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, 3, 3, 3, 3, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 30)

    expect(countColors(generated.colorIndices)).toEqual(countColors(source.colorIndices))
    expect(getLongestStraightColorRun(generated.colorIndices)).toBeLessThanOrEqual(5)
    vi.restoreAllMocks()
  })

  test('keeps generated blocks concentrated in source same-color component templates', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42)
    const source = createGrid([
      [0, 0, 0, 0, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 1, 1, 1],
      [2, 2, 2, 2, 3, 3, 3, 3],
      [2, 2, 2, 2, 3, 3, 3, 3],
      [2, 2, 2, 2, 3, 3, 3, 3],
      [2, 2, 2, 2, 3, 3, 3, 3]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 4)
    const templateIds = buildSourceTemplateIds(source.colorIndices)
    const largeComponents = collectColorComponents(generated.colorIndices)
      .filter((component) => component.cells.length >= 8)

    expect(countColors(generated.colorIndices)).toEqual(countColors(source.colorIndices))
    for (const component of largeComponents) {
      expect(getTemplateAffinityRatio(component, templateIds)).toBeGreaterThanOrEqual(0.9)
    }
    vi.restoreAllMocks()
  })

  test('uses coarse block overflow instead of leaving single-cell islands', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42)
    const source = createGrid([
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, 1, 1, 1, 1, 3, 3, EXTERNAL_BACKGROUND_INDEX],
      [0, 0, 2, 2, 0, 1, EXTERNAL_BACKGROUND_INDEX, 1, 1, 3, 3, 3],
      [0, 2, 2, 2, 0, 1, 1, 1, EXTERNAL_BACKGROUND_INDEX, 3, 3, 3],
      [0, 2, EXTERNAL_BACKGROUND_INDEX, 2, 0, 0, 0, 1, 1, 1, 3, 3],
      [0, 2, 2, 2, 2, 0, 0, 0, 1, 1, 1, 3],
      [0, 0, 0, 2, 2, 2, EXTERNAL_BACKGROUND_INDEX, 0, 0, 1, 1, 3],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 2, 2, 2, 2, 0, 0, 1, 1],
      [3, 3, 0, 0, 0, EXTERNAL_BACKGROUND_INDEX, 2, 2, 2, 0, 0, 1],
      [3, 3, 3, 0, 0, 0, 0, 2, 2, 2, 0, 1],
      [3, 3, 3, 3, 0, 0, 0, 0, 2, 2, 2, 1],
      [EXTERNAL_BACKGROUND_INDEX, 3, 3, 3, 3, 0, 0, 0, 2, 2, 2, EXTERNAL_BACKGROUND_INDEX]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 12)

    expect(countColors(generated.colorIndices)).toEqual(countColors(source.colorIndices))
    expect(countSingletonComponents(generated.colorIndices)).toBe(0)
    vi.restoreAllMocks()
  })

  test('prefers placing colors away from their original same-color slots', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42)
    const source = createGrid([
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, 1, 1, 1, 1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, 1, 1, 1, 1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, 1, 1, 1, 1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 0, 0, 1, 1, 1, 1, EXTERNAL_BACKGROUND_INDEX],
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 2)

    expect(countColors(generated.colorIndices)).toEqual(countColors(source.colorIndices))
    expect(countOriginalColorMatches(source.colorIndices, generated.colorIndices)).toBeLessThanOrEqual(2)
    vi.restoreAllMocks()
  })

  test('splits blocks instead of crossing source templates when overflow is zero', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42)
    const source = createGrid([
      [0, 0, 1, 1, 2, 2, 0, 0, 1, 1, 2, 2],
      [0, 0, 1, 1, 2, 2, 0, 0, 1, 1, 2, 2]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 3, {
      overflowConstraint: 0
    })

    expect(countColors(generated.colorIndices)).toEqual(countColors(source.colorIndices))
    expect(countColorComponents(generated.colorIndices)).toBeGreaterThan(3)
    expect(getMaxTemplateOverflowRatio(source.colorIndices, generated.colorIndices)).toBe(0)
    vi.restoreAllMocks()
  })

  test('keeps overflow five equivalent to the default sorter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42)
    const source = createGrid([
      [0, 0, 1, 1, 0, 0, 1, 1],
      [0, 0, 1, 1, 0, 0, 1, 1]
    ])

    const defaultGenerated = generateSortedGridByTargetBlockCount(source, 2)
    const unconstrainedGenerated = generateSortedGridByTargetBlockCount(source, 2, {
      overflowConstraint: 5
    })

    expect(unconstrainedGenerated.colorIndices).toEqual(defaultGenerated.colorIndices)
    vi.restoreAllMocks()
  })

  test('limits source template overflow by the selected ratio', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42)
    const source = createGrid([
      [0, 0, 1, 1, 2, 2, 0, 0, 1, 1, 2, 2],
      [0, 0, 1, 1, 2, 2, 0, 0, 1, 1, 2, 2]
    ])

    const generated = generateSortedGridByTargetBlockCount(source, 3, {
      overflowConstraint: 1
    })

    expect(countColors(generated.colorIndices)).toEqual(countColors(source.colorIndices))
    expect(getMaxTemplateOverflowRatio(source.colorIndices, generated.colorIndices)).toBeLessThanOrEqual(0.2)
    vi.restoreAllMocks()
  })
})
