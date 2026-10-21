// 关卡豆子连通区域统计：对乱序矩阵 initPixel 按「同色 8 连通」规则
// 统计每个连通区域包含的豆子数量，再汇总成「区域大小 → 该大小的区域个数」直方图。
// 单元格值含义：>=0 豆子（颜色索引），-1 空槽，-2 图外背景。仅 cell>=0 参与统计。

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1]
]

export interface BeadRegionStats {
  regionCount: number
  totalBeads: number
  // 区域大小（豆子数）→ 该大小的连通区域数量；按大小升序遍历更直观。
  sizeHistogram: Map<number, number>
}

/**
 * 计算 initPixel 矩阵中同色 8 连通区域的大小分布。
 * 算法为显式栈 flood fill，O(n) 时间复杂度，不保留每区域的坐标列表以节省内存。
 */
export const computeBeadRegionStats = (initPixel: number[][]): BeadRegionStats => {
  const height = initPixel.length
  const width = height > 0 ? initPixel[0].length : 0

  const sizeHistogram = new Map<number, number>()
  let regionCount = 0
  let totalBeads = 0

  if (height === 0 || width === 0) {
    return { regionCount, totalBeads, sizeHistogram }
  }

  // 用一维 Uint8Array 作访问标记，比二维布尔数组更紧凑。
  const visited = new Uint8Array(width * height)

  for (let y = 0; y < height; y += 1) {
    const row = initPixel[y]
    if (!row) continue
    for (let x = 0; x < width; x += 1) {
      const colorId = row[x]
      if (colorId < 0) continue
      const startKey = y * width + x
      if (visited[startKey]) continue

      // 从该起点扩散同色 8 连通区域
      let areaSize = 0
      const stack: number[] = [x, y]
      visited[startKey] = 1

      while (stack.length > 0) {
        const cy = stack.pop() as number
        const cx = stack.pop() as number
        areaSize += 1

        for (const [dx, dy] of DIRECTIONS) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const nKey = ny * width + nx
          if (visited[nKey]) continue
          const nRow = initPixel[ny]
          if (!nRow) continue
          if (nRow[nx] !== colorId) continue
          visited[nKey] = 1
          stack.push(nx, ny)
        }
      }

      regionCount += 1
      totalBeads += areaSize
      sizeHistogram.set(areaSize, (sizeHistogram.get(areaSize) ?? 0) + 1)
    }
  }

  return { regionCount, totalBeads, sizeHistogram }
}

/**
 * 将直方图转为按区域大小升序排列的数组，便于 UI 渲染。
 */
export const histogramToSortedEntries = (
  histogram: Map<number, number>
): Array<{ size: number; count: number }> =>
  Array.from(histogram.entries())
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => a.size - b.size)
