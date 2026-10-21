// 用 localPixelResource 的真实十六进制颜色把 pixelMatrix 渲染成缩略图。
// 不画网格线、不加载外部图片资源，适合分页批量渲染大量关卡。
// cell>=0 取 localPixelResource[colorIndex] 作为颜色；-1（空槽）/ -2（图外背景）跳过，保持透明。

const isValidHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-fA-F]{6}$/.test(value)

export const drawPixelMatrixThumbnail = (
  canvas: HTMLCanvasElement | null,
  matrix: number[][],
  localPixelResource: string[] | undefined,
  cellSize: number
): void => {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const height = matrix.length
  const width = height > 0 ? (matrix[0]?.length ?? 0) : 0
  if (width === 0 || height === 0 || cellSize <= 0) {
    canvas.width = 1
    canvas.height = 1
    ctx.clearRect(0, 0, 1, 1)
    return
  }

  // canvas 尺寸需在绘制前设定，且仅在尺寸变化时重设以避免清屏抖动。
  const targetWidth = Math.max(1, Math.round(width * cellSize))
  const targetHeight = Math.max(1, Math.round(height * cellSize))
  if (canvas.width !== targetWidth) canvas.width = targetWidth
  if (canvas.height !== targetHeight) canvas.height = targetHeight
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (let y = 0; y < height; y += 1) {
    const row = matrix[y]
    if (!row) continue
    for (let x = 0; x < width; x += 1) {
      const colorIndex = row[x]
      if (colorIndex < 0) continue
      const hex = localPixelResource?.[colorIndex]
      // 兜底：缺色资源时用纯黑，避免整格空白造成误判。
      const fill = isValidHexColor(hex) ? `#${hex.toUpperCase()}` : '#222222'
      ctx.fillStyle = fill
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
    }
  }
}
