import { describe, expect, it } from 'vitest'
import { detectPixelGridSize } from '../imagePixelGridDetection'

const paintCell = (
  data: Uint8ClampedArray,
  width: number,
  cellSize: number,
  cellX: number,
  cellY: number,
  color: [number, number, number],
  noise = 0
) => {
  for (let y = cellY * cellSize; y < (cellY + 1) * cellSize; y += 1) {
    for (let x = cellX * cellSize; x < (cellX + 1) * cellSize; x += 1) {
      const offset = ((y * width) + x) * 4
      const noiseValue = noise === 0 ? 0 : (((x * 17) + (y * 11)) % ((noise * 2) + 1)) - noise
      data[offset] = Math.min(255, Math.max(0, color[0] + noiseValue))
      data[offset + 1] = Math.min(255, Math.max(0, color[1] + noiseValue))
      data[offset + 2] = Math.min(255, Math.max(0, color[2] + noiseValue))
      data[offset + 3] = 255
    }
  }
}

const buildPixelArtImage = (cellSize: number, noise = 0) => {
  const matrix = [
    [0, 0, 1, 1, 2, 2],
    [0, 3, 3, 1, 2, 4],
    [5, 5, 3, 6, 6, 4],
    [5, 7, 7, 7, 6, 4],
    [8, 8, 7, 9, 9, 9]
  ]
  const colors: Array<[number, number, number]> = [
    [240, 240, 220],
    [230, 70, 40],
    [20, 20, 25],
    [250, 180, 40],
    [80, 170, 70],
    [245, 120, 30],
    [70, 120, 210],
    [250, 210, 90],
    [190, 80, 160],
    [40, 40, 45]
  ]
  const width = matrix[0].length * cellSize
  const height = matrix.length * cellSize
  const data = new Uint8ClampedArray(width * height * 4)

  matrix.forEach((row, cellY) => {
    row.forEach((colorIndex, cellX) => {
      paintCell(data, width, cellSize, cellX, cellY, colors[colorIndex], noise)
    })
  })

  return { data, width, height }
}

describe('detectPixelGridSize', () => {
  it('detects the block size of a regular pixel-art image with high confidence', () => {
    const image = buildPixelArtImage(6)

    expect(detectPixelGridSize(image)).toEqual({
      cellSize: 6,
      confidence: 'high',
      score: expect.any(Number)
    })
  })

  it('does not report high confidence for a smooth gradient image', () => {
    const width = 48
    const height = 36
    const data = new Uint8ClampedArray(width * height * 4)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = ((y * width) + x) * 4
        data[offset] = x * 4
        data[offset + 1] = y * 5
        data[offset + 2] = 120
        data[offset + 3] = 255
      }
    }

    expect(detectPixelGridSize({ data, width, height }).confidence).not.toBe('high')
  })

  it('detects the block size when pixel cells contain light texture noise', () => {
    const image = buildPixelArtImage(8, 4)

    expect(detectPixelGridSize(image)).toEqual({
      cellSize: 8,
      confidence: 'high',
      score: expect.any(Number)
    })
  })
})
