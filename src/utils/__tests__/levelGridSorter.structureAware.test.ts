// @vitest-environment node
// Self-contained synthetic cases; no private workspace files are required.

import { describe, expect, test } from 'vitest'
import type { GridData } from '../../types/grid'
import { EXTERNAL_BACKGROUND_INDEX } from '../subjectGrid'
import {
  generateStructureAwareSortedGrid,
  generateSortedGridByDifficulty,
  SIZE_PROFILES
} from '../levelGridSorter'


// ---- fixture 工具 ----

const createGrid = (colorIndices: number[][]): GridData => ({
  width: colorIndices[0]?.length ?? 0,
  height: colorIndices.length,
  colorIndices,
  colors: [
    { r: 220, g: 40, b: 40, a: 255 },
    { r: 40, g: 220, b: 40, a: 255 },
    { r: 40, g: 40, b: 220, a: 255 },
    { r: 220, g: 180, b: 40, a: 255 },
    { r: 180, g: 40, b: 220, a: 255 },
    { r: 40, g: 180, b: 220, a: 255 }
  ],
  fileName: 'test-grid'
})

const countColorBeads = (indices: number[][]): Map<number, number> => {
  const counts = new Map<number, number>()
  for (const row of indices) {
    for (const v of row) {
      if (v >= 0) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
  }
  return counts
}

// ---- 1. 守恒性（H5） ----

describe('generateStructureAwareSortedGrid 守恒性 (H5)', () => {
  test('多色图：生成后每色豆子数与目标图一致', () => {
    // 关闭背景推断，纯粹验证生成器守恒（避免小矩阵角落实色块被误判为外部背景）
    const source = createGrid([
      [0, 0, 1, 1],
      [0, 0, 1, 1],
      [2, 2, 3, 3],
      [2, 2, 3, 3]
    ])
    const targetCounts = countColorBeads(source.colorIndices)
    const result = generateStructureAwareSortedGrid(source, { seed: 1, inferExternalBackground: false })
    const outCounts = countColorBeads(result.grid.colorIndices)
    for (const [c, n] of targetCounts) {
      expect(outCounts.get(c) ?? 0).toBe(n)
    }
  })

  test('含 EXTERNAL_BACKGROUND 掩码：守恒仍成立，且背景格保持 -2', () => {
    const source = createGrid([
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, 0, 1],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 1],
      [2, 0, 1, 1],
      [2, 2, 2, 1]
    ])
    const targetCounts = countColorBeads(source.colorIndices)
    const result = generateStructureAwareSortedGrid(source, {
      seed: 7,
      normalizeExternalBackground: true,
      // 小图边框主色推断会把颜色 1 误判为背景（真实关卡边框主色是 -2 标记），显式指定
      backgroundIndex: EXTERNAL_BACKGROUND_INDEX
    })
    const outCounts = countColorBeads(result.grid.colorIndices)
    for (const [c, n] of targetCounts) {
      expect(outCounts.get(c) ?? 0).toBe(n)
    }
    // 背景格写回 -2
    expect(result.grid.colorIndices[0][0]).toBe(EXTERNAL_BACKGROUND_INDEX)
    expect(result.grid.colorIndices[0][1]).toBe(EXTERNAL_BACKGROUND_INDEX)
    expect(result.grid.colorIndices[1][0]).toBe(EXTERNAL_BACKGROUND_INDEX)
  })
})

// ---- 2. 可复现 ----

describe('generateStructureAwareSortedGrid 可复现', () => {
  test('同 (source, options, seed) 两次生成逐格相等', () => {
    const source = createGrid([
      [0, 0, 1, 1, 2, 2],
      [0, 3, 1, 1, 2, 2],
      [0, 3, 3, 3, 1, 1],
      [2, 2, 0, 0, 1, 1]
    ])
    const a = generateStructureAwareSortedGrid(source, { seed: 42 })
    const b = generateStructureAwareSortedGrid(source, { seed: 42 })
    expect(a.grid.colorIndices).toEqual(b.grid.colorIndices)
    expect(a.usedSeed).toBe(b.usedSeed)
  })

  test('不同 seed 结果（大概率）不同', () => {
    const source = createGrid([
      [0, 0, 1, 1, 2, 2],
      [0, 3, 1, 1, 2, 2],
      [0, 3, 3, 3, 1, 1],
      [2, 2, 0, 0, 1, 1]
    ])
    const a = generateStructureAwareSortedGrid(source, { seed: 1 })
    const b = generateStructureAwareSortedGrid(source, { seed: 999 })
    expect(a.grid.colorIndices).not.toEqual(b.grid.colorIndices)
  })

  test('不传 seed 时回显所用 usedSeed，且可用该 seed 复现', () => {
    const source = createGrid([
      [0, 0, 1, 1],
      [0, 0, 1, 1],
      [2, 2, 3, 3],
      [2, 2, 3, 3]
    ])
    const a = generateStructureAwareSortedGrid(source)
    expect(typeof a.usedSeed).toBe('number')
    const b = generateStructureAwareSortedGrid(source, { seed: a.usedSeed })
    expect(b.grid.colorIndices).toEqual(a.grid.colorIndices)
  })
})

// ---- 4. 退化输入 ----

describe('generateStructureAwareSortedGrid 退化输入', () => {
  test('单色图：不崩溃，守恒成立', () => {
    const source = createGrid([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ])
    // 关闭背景推断，避免单色连通块被误判为外部背景
    const result = generateStructureAwareSortedGrid(source, { seed: 3, inferExternalBackground: false })
    expect(countColorBeads(result.grid.colorIndices).get(0)).toBe(9)
  })

  test('某色只有 1 颗豆：不崩溃，守恒成立', () => {
    const source = createGrid([
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 2]
    ])
    const targetCounts = countColorBeads(source.colorIndices)
    const result = generateStructureAwareSortedGrid(source, { seed: 5, inferExternalBackground: false })
    const outCounts = countColorBeads(result.grid.colorIndices)
    for (const [c, n] of targetCounts) {
      expect(outCounts.get(c) ?? 0).toBe(n)
    }
    expect(outCounts.get(1)).toBe(1)
    expect(outCounts.get(2)).toBe(1)
  })

  test('全部颜色各仅 1 颗：不崩溃，守恒成立', () => {
    const source = createGrid([
      [0, 1, 2],
      [3, -1, -1]
    ])
    const targetCounts = countColorBeads(source.colorIndices)
    const result = generateStructureAwareSortedGrid(source, { seed: 11, inferExternalBackground: false })
    const outCounts = countColorBeads(result.grid.colorIndices)
    for (const [c, n] of targetCounts) {
      expect(outCounts.get(c) ?? 0).toBe(n)
    }
  })

  test('空/极小网格：返回不抛异常', () => {
    const empty = createGrid([[]])
    const result = generateStructureAwareSortedGrid(empty, { seed: 1 })
    expect(result.passed).toBe(false)
    expect(result.attempts).toBe(0)
  })
})

// ---- 5. legacy 回归（别名仍可用 + SIZE_PROFILES 完整） ----

describe('legacy 路径兼容', () => {
  test('generateSortedGridByDifficulty 别名仍可用且返回 grid', () => {
    const source = createGrid([
      [0, 0, 1],
      [1, 1, 2],
      [2, 2, 0]
    ])
    const grid = generateSortedGridByDifficulty(source, 3, { overflowConstraint: 2 })
    expect(grid.width).toBe(source.width)
    expect(grid.height).toBe(source.height)
    // 守恒
    const targetCounts = countColorBeads(source.colorIndices)
    const outCounts = countColorBeads(grid.colorIndices)
    for (const [c, n] of targetCounts) {
      expect(outCounts.get(c) ?? 0).toBe(n)
    }
  })

  test('SIZE_PROFILES 三档齐备且分布中无 size=1', () => {
    for (const name of ['loose', 'standard', 'tight'] as const) {
      const dist = SIZE_PROFILES[name]
      expect(dist.length).toBeGreaterThan(0)
      for (const entry of dist) {
        expect(entry.size).toBeGreaterThanOrEqual(2)
        expect(entry.weight).toBeGreaterThan(0)
      }
    }
  })
})
