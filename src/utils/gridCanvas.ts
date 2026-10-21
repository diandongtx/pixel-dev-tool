import type { GridData } from '../types/grid'

const GRID_LINE_WIDTH = 0.5

export const drawGridToCanvas = (
  canvas: HTMLCanvasElement | null,
  data: GridData | null,
  gridSize: number
) => {
  if (!canvas) return
  if (!data || data.width <= 0 || data.height <= 0) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = data.width * gridSize
  canvas.height = data.height * gridSize
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.lineWidth = GRID_LINE_WIDTH

  for (let y = 0; y < data.height; y += 1) {
    const row = data.colorIndices[y]
    for (let x = 0; x < data.width; x += 1) {
      const indexId = row[x]
      const color = data.colors[indexId]
      if (!color) continue
      ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`
      ctx.fillRect(x * gridSize, y * gridSize, gridSize, gridSize)
      ctx.strokeStyle = '#000'
      ctx.strokeRect(x * gridSize, y * gridSize, gridSize, gridSize)
    }
  }
}
