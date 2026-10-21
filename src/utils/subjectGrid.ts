import type { GridData } from '../types/grid'
import { cloneGridData, cloneColors } from './gridData'

interface Point {
  x: number
  y: number
}

export const EXTERNAL_BACKGROUND_INDEX = -2

export interface ExternalBackgroundOptions {
  backgroundIndex?: number | null
  removeAllMatchingBackground?: boolean
}

export const getBorderDominantIndex = (colorIndices: number[][]): number | null => {
  const height = colorIndices.length
  const width = colorIndices[0]?.length ?? 0
  if (height === 0 || width === 0) return null
  const counts = new Map<number, number>()

  for (let x = 0; x < width; x += 1) {
    const top = colorIndices[0][x]
    const bottom = colorIndices[height - 1][x]
    counts.set(top, (counts.get(top) ?? 0) + 1)
    counts.set(bottom, (counts.get(bottom) ?? 0) + 1)
  }
  for (let y = 0; y < height; y += 1) {
    const left = colorIndices[y][0]
    const right = colorIndices[y][width - 1]
    counts.set(left, (counts.get(left) ?? 0) + 1)
    counts.set(right, (counts.get(right) ?? 0) + 1)
  }

  let maxIndex: number | null = null
  let maxCount = -1
  counts.forEach((count, indexId) => {
    if (count > maxCount) {
      maxCount = count
      maxIndex = indexId
    }
  })
  return maxIndex
}

const markExternalBackground = (colorIndices: number[][], backgroundIndex: number): boolean[][] => {
  const height = colorIndices.length
  const width = colorIndices[0]?.length ?? 0
  const visited = Array.from({ length: height }, () => Array(width).fill(false))
  const queue: Point[] = []
  const directions: Point[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ]

  const tryPush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    if (visited[y][x]) return
    if (colorIndices[y][x] !== backgroundIndex) return
    visited[y][x] = true
    queue.push({ x, y })
  }

  for (let x = 0; x < width; x += 1) {
    tryPush(x, 0)
    tryPush(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    tryPush(0, y)
    tryPush(width - 1, y)
  }

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    for (const direction of directions) {
      tryPush(current.x + direction.x, current.y + direction.y)
    }
  }

  return visited
}

const markAllMatchingBackground = (colorIndices: number[][], backgroundIndex: number): boolean[][] => (
  colorIndices.map((row) => row.map((indexId) => indexId === backgroundIndex))
)

export const getExternalBackgroundMask = (
  colorIndices: number[][],
  options: ExternalBackgroundOptions = {}
): boolean[][] | null => {
  const backgroundIndex = options.backgroundIndex ?? getBorderDominantIndex(colorIndices)
  if (backgroundIndex === null) return null
  if (options.removeAllMatchingBackground) {
    return markAllMatchingBackground(colorIndices, backgroundIndex)
  }
  return markExternalBackground(colorIndices, backgroundIndex)
}

export const extractSubjectGridData = (
  source: GridData,
  options: ExternalBackgroundOptions = {}
): GridData => {
  const base = cloneGridData(source)
  if (base.width === 0 || base.height === 0) return base

  const externalMask = getExternalBackgroundMask(base.colorIndices, options)
  if (!externalMask) return base
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let hasSubject = false

  for (let y = 0; y < base.height; y += 1) {
    for (let x = 0; x < base.width; x += 1) {
      if (externalMask[y][x]) continue
      hasSubject = true
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (!hasSubject) return base

  const croppedIndices: number[][] = []
  for (let y = minY; y <= maxY; y += 1) {
    const row: number[] = []
    for (let x = minX; x <= maxX; x += 1) {
      const isExternal = externalMask[y][x]
      if (isExternal) {
        row.push(EXTERNAL_BACKGROUND_INDEX)
        continue
      }
      const indexId = base.colorIndices[y][x]
      row.push(indexId)
    }
    croppedIndices.push(row)
  }

  return {
    width: croppedIndices[0]?.length ?? 0,
    height: croppedIndices.length,
    colorIndices: croppedIndices,
    colors: cloneColors(base.colors),
    fileName: `${base.fileName}_subject`
  }
}
