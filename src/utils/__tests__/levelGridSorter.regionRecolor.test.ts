// @vitest-environment node
// Self-contained synthetic cases; no private workspace files are required.

import { describe, expect, test } from 'vitest'
import type { GridData } from '../../types/grid'
import { EXTERNAL_BACKGROUND_INDEX } from '../subjectGrid'
import {
  computeContourPreservation,
  computeFixedFloor,
  generateRegionRecolorSortedGrid,
  rrAdaptiveFixedThreshold
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

// ---- 1. 守恒性（R5/H5） ----

describe('generateRegionRecolorSortedGrid 守恒性', () => {
  test('多色图：生成后每色豆子数与目标图一致', () => {
    const source = createGrid([
      [0, 0, 1, 1],
      [0, 0, 1, 1],
      [2, 2, 3, 3],
      [2, 2, 3, 3]
    ])
    const targetCounts = countColorBeads(source.colorIndices)
    const result = generateRegionRecolorSortedGrid(source, { seed: 1, inferExternalBackground: false })
    const outCounts = countColorBeads(result.grid.colorIndices)
    for (const [c, n] of targetCounts) {
      expect(outCounts.get(c) ?? 0).toBe(n)
    }
  })

  test('含 EXTERNAL_BACKGROUND 掩码（显式 backgroundIndex）：守恒成立且背景格保持 -2', () => {
    const source = createGrid([
      [EXTERNAL_BACKGROUND_INDEX, EXTERNAL_BACKGROUND_INDEX, 0, 1],
      [EXTERNAL_BACKGROUND_INDEX, 0, 0, 1],
      [2, 0, 1, 1],
      [2, 2, 2, 1]
    ])
    const targetCounts = countColorBeads(source.colorIndices)
    const result = generateRegionRecolorSortedGrid(source, {
      seed: 7,
      normalizeExternalBackground: true,
      // 小图边框主色推断会把颜色 1 误判为背景（真实关卡边框主色是 -2 标记），显式指定
      backgroundIndex: EXTERNAL_BACKGROUND_INDEX
    })
    const outCounts = countColorBeads(result.grid.colorIndices)
    for (const [c, n] of targetCounts) {
      expect(outCounts.get(c) ?? 0).toBe(n)
    }
    expect(result.grid.colorIndices[0][0]).toBe(EXTERNAL_BACKGROUND_INDEX)
    expect(result.grid.colorIndices[0][1]).toBe(EXTERNAL_BACKGROUND_INDEX)
    expect(result.grid.colorIndices[1][0]).toBe(EXTERNAL_BACKGROUND_INDEX)
  })

  test('轮廓保留指标与定义一致：未打乱的图 contourPreservation = 1', () => {
    const target = [
      [0, 0, 1, 1],
      [0, 0, 1, 1],
      [2, 2, 3, 3],
      [2, 2, 3, 3]
    ]
    expect(computeContourPreservation(target, target)).toBe(1)
  })
})

// ---- 2. 可复现 ----

describe('generateRegionRecolorSortedGrid 可复现', () => {
  test('同 (source, options, seed) 两次生成逐格相等', () => {
    const source = createGrid([
      [0, 0, 1, 1, 2, 2],
      [0, 3, 1, 1, 2, 2],
      [0, 3, 3, 3, 1, 1],
      [2, 2, 0, 0, 1, 1]
    ])
    const a = generateRegionRecolorSortedGrid(source, { seed: 42 })
    const b = generateRegionRecolorSortedGrid(source, { seed: 42 })
    expect(a.grid.colorIndices).toEqual(b.grid.colorIndices)
    expect(a.usedSeed).toBe(b.usedSeed)
  })

  test('不传 seed 时回显所用 usedSeed，且可用该 seed 复现', () => {
    const source = createGrid([
      [0, 0, 1, 1],
      [0, 0, 1, 1],
      [2, 2, 3, 3],
      [2, 2, 3, 3]
    ])
    const a = generateRegionRecolorSortedGrid(source)
    expect(typeof a.usedSeed).toBe('number')
    const b = generateRegionRecolorSortedGrid(source, { seed: a.usedSeed })
    expect(b.grid.colorIndices).toEqual(a.grid.colorIndices)
  })
})

// ---- 5. 退化输入 ----

describe('generateRegionRecolorSortedGrid 退化输入', () => {
  test('单色图：无处可换色，不崩溃、守恒成立（v2.1 自适应 R4 下 floor=1，指标 vacuous 通过）', () => {
    const source = createGrid([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ])
    const result = generateRegionRecolorSortedGrid(source, { seed: 3, inferExternalBackground: false })
    expect(countColorBeads(result.grid.colorIndices).get(0)).toBe(9)
    // v2.1：单色图 fixedFloor=1 → 自适应阈值 1.07，R4 不再判失败；
    // 轮廓无边界边（contour=1 vacuous）、整块一个（R2/R3 通过），passed 可为 true
    expect(result.metrics.fixedFloor).toBeCloseTo(1, 5)
  })

  test('全部颜色各仅 1 颗：不崩溃，守恒成立', () => {
    const source = createGrid([
      [0, 1, 2],
      [3, 4, 5]
    ])
    const targetCounts = countColorBeads(source.colorIndices)
    const result = generateRegionRecolorSortedGrid(source, { seed: 11, inferExternalBackground: false })
    const outCounts = countColorBeads(result.grid.colorIndices)
    for (const [c, n] of targetCounts) {
      expect(outCounts.get(c) ?? 0).toBe(n)
    }
  })

  test('某色只有 1 颗豆：不崩溃，守恒成立', () => {
    const source = createGrid([
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 2]
    ])
    const targetCounts = countColorBeads(source.colorIndices)
    const result = generateRegionRecolorSortedGrid(source, { seed: 5, inferExternalBackground: false })
    const outCounts = countColorBeads(result.grid.colorIndices)
    for (const [c, n] of targetCounts) {
      expect(outCounts.get(c) ?? 0).toBe(n)
    }
    expect(outCounts.get(1)).toBe(1)
    expect(outCounts.get(2)).toBe(1)
  })

  test('空/极小网格：返回不抛异常，passed:false', () => {
    const empty = createGrid([[]])
    const result = generateRegionRecolorSortedGrid(empty, { seed: 1 })
    expect(result.passed).toBe(false)
    expect(result.attempts).toBe(0)
  })
})

describe('自适应阈值', () => {
  test('主色比例给出不可避免的落原位下界', () => {
    const mono = [[0, 0, 0], [0, 0, 0]]
    const slots = new Set([0, 1, 2, 3, 4, 5])
    expect(computeFixedFloor(mono, slots)).toBeCloseTo(1, 5)
    const balanced = [[0, 0, 1, 1], [2, 2, 3, 3]]
    expect(computeFixedFloor(balanced, new Set([0, 1, 2, 3, 4, 5, 6, 7]))).toBe(0)
    expect(rrAdaptiveFixedThreshold(0)).toBeCloseTo(0.07, 9)
    expect(rrAdaptiveFixedThreshold(0.218)).toBeCloseTo(0.288, 3)
  })
})
