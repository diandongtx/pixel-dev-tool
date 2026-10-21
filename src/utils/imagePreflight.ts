/**
 * 图源预检核心库（生图规范 v1，docs/生图规范-v1.md §1/§2/§6）
 *
 * 消费方：
 *   - scripts/preflight-check.ts（图库全量体检）
 *   - auto-pipeline CLI `preflight` 子命令（生图管线质量门，Stage3 提格后）
 *
 * 阈值与规范文档一一对应，任何调整须同步两处并在规范 §7 记录。
 */

export type PreflightGrade = 'green' | 'yellow' | 'red'

// ---- 阈值（生图规范 v1 §1/§2，红黄绿边界）----
export const PREFLIGHT_THRESHOLDS = {
  dominant: { green: 0.45, yellow: 0.50 },          // 主色占比
  tau: { green: 0.6, yellow: 1.0 },                 // 单色紧度（0.6–1.0 策略B可救，>1.0 落原位必然显著）
  beads: { greenLo: 300, greenHi: 650, yellowLo: 200, yellowHi: 800 },
  colors: { greenLo: 5, greenHi: 8, yellowLo: 4, yellowHi: 10 },
  minQuota: 25,                                     // 每色目标配额（低于算饥饿色）
  starved: { starvedAt: 12, yellowMax: 1 },         // 饥饿色（<12豆）：1个=黄（点缀色），≥2个=红
  regions: { green: 6, yellow: 4 },                 // 同色连通区域数（≥4格）
  maxRegion: { green: 0.35, yellow: 0.45 },         // 最大单区域占比
  tinyDetails: { green: 2, yellow: 8 },             // <4格孤立块数（复杂图案通常需要人工复核）
  deltaE: { yellowBelow: 20, redBelow: 13 },        // 任意两色 ΔE（CIE76）：<20 黄、<13 红
  // 风格线（规范 §7.5「反死板」，2026-08-06 落地）：硬指标全绿 ≠ 好看。
  // batch1 十张「10/10 绿」里八张镜像度 100%，熊猫/猫在指标最优状态下是横条纹方盒子。
  // 这三条专治该盲区；阈值见规范 §9 校准表。
  // 镜像度按题材分线：皇冠/礼物盒/闹钟这类静物天然对称（实测 crown 98% 但视觉不死板，
  // 靠内部细节救回），动物/人物对称即死板（panda/cat 100% 全是方盒子）。
  mirror: { green: 0.85, yellow: 0.95 },            // 静物默认线
  mirrorAnimate: { green: 0.70, yellow: 0.85 },     // 有生命题材（规范 §7.5；penguin-v5 为 0.56）
  // stripe 只拦极端值：该口径对窄主体天生偏高（penguin-v5 主体窄，条纹 72% 却是人工唯一
  // 认可的一张），做主闸门会把好图判红。真正的主判据是 rect —— 整行横切产生的就是扁矩形。
  stripe: { green: 0.80, yellow: 0.92 },            // 非空行中仅含 ≤2 色的行占比
  rect: { green: 0.60, yellow: 0.72 }               // 色块矩形度：区域面积/其包围盒面积（面积加权）
} as const

// 带背景档（2026-08-05 选项A）：整图全豆的带背景关卡，天然对应竞品 800+ 难度档。
// 画布色（触边最多的最大色）豁免主色/τ/最大区域判定，豆量带宽独立。
export const PREFLIGHT_THRESHOLDS_BG = {
  beads: { greenLo: 650, greenHi: 1200, yellowLo: 500, yellowHi: 1500 }
} as const

const D8 = [-1, 0, 1]
  .flatMap((dy) => [-1, 0, 1].map((dx) => [dy, dx] as const))
  .filter(([dy, dx]) => dy !== 0 || dx !== 0)

export const HEX_COLOR_RE = /^[0-9A-F]{6}$/i

// CIE76 ΔE（sRGB → Lab）
export const hexToLab = (hex: string): [number, number, number] => {
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  const [r, g, b] = lin
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export const deltaE76 = (a: [number, number, number], b: [number, number, number]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export interface PreflightMetrics {
  beadCount: number
  colorCount: number
  dominantRatio: number
  maxTau: number
  minQuota: number
  starvedColorCount: number
  hexValid: boolean
  regionCount: number
  maxRegionRatio: number
  tinyDetailCount: number
  minDeltaE: number
  nearPairCount: number
  /** 底边条纹：底部 1-2 行被单一颜色横贯（参考图"地面线"传染，2026-08-04 人工标注教训） */
  hasBottomStrip: boolean
  /** 游离装饰件数：与主体（最大连通豆群）不相连的小型色块群（云/星/闪光传染） */
  floatingDecorCount: number
  /** 带背景档：识别出的画布色索引（-1 = 非带背景模式或未识别） */
  canvasColorIndex: number
  /** 画布色占比（带背景档参考信息） */
  canvasRatio: number
  /** 风格：左右镜像格占比。1.0 = 完全轴对称（死板主因，规范 §7.5） */
  mirrorRatio: number
  /** 风格：非空行中「仅含 ≤2 色」的行占比。高 = 整行横切填色 */
  stripeRatio: number
  /** 风格：色块矩形度（≥6 格区域的 面积/包围盒面积，按面积加权）。高 = 色块是规整矩形 */
  rectangularity: number
  /** 风格：填充率（豆数/网格格数）。规范 §7.1 建议 0.45–0.60，过高则姿态无伸展空间 */
  fillRatio: number
}

export interface PreflightOptions {
  /** 带背景档（keepBackground 批）：识别画布色并在主色/τ/最大区域判定中豁免 */
  canvasBackground?: boolean
  /** 有生命题材（动物/人物）：镜像度走严线 0.70/0.85。静物默认走宽线（对称合法） */
  animateSubject?: boolean
}

export interface PreflightCheck {
  key: string
  grade: PreflightGrade
  detail: string
}

export interface PreflightVerdict {
  grade: PreflightGrade
  checks: PreflightCheck[]
  redKeys: string[]
  yellowKeys: string[]
}

/**
 * 计算预检指标。
 * @param matrix 颜色索引矩阵（>=0 颜色索引，<0 背景/空位）
 * @param paletteHex 调色板（6 位 hex，无 # 前缀）；索引与 matrix 中的值对应
 */
export const analyzeImage = (
  matrix: number[][],
  paletteHex: string[],
  opts: PreflightOptions = {}
): PreflightMetrics => {
  const T = PREFLIGHT_THRESHOLDS
  const h = matrix.length
  const w = h > 0 ? matrix[0].length : 0

  // 配额（只数实际出现的颜色，palette 可能有未使用项）
  const quota = new Map<number, number>()
  let beads = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = matrix[y][x]
      if (v < 0) continue
      quota.set(v, (quota.get(v) ?? 0) + 1)
      beads += 1
    }
  }
  const quotas = [...quota.values()]
  const minQuota = quotas.length > 0 ? Math.min(...quotas) : 0
  const starvedColorCount = quotas.filter((q) => q < T.starved.starvedAt).length

  // ---- 带背景档：识别画布色（触边最多的颜色，且占比 ≥15%）----
  let canvasColorIndex = -1
  let canvasRatio = 0
  if (opts.canvasBackground && beads > 0) {
    const edgeCount = new Map<number, number>()
    for (let x = 0; x < w; x += 1) {
      if (matrix[0][x] >= 0) edgeCount.set(matrix[0][x], (edgeCount.get(matrix[0][x]) ?? 0) + 1)
      if (matrix[h - 1][x] >= 0) edgeCount.set(matrix[h - 1][x], (edgeCount.get(matrix[h - 1][x]) ?? 0) + 1)
    }
    for (let y = 0; y < h; y += 1) {
      if (matrix[y][0] >= 0) edgeCount.set(matrix[y][0], (edgeCount.get(matrix[y][0]) ?? 0) + 1)
      if (matrix[y][w - 1] >= 0) edgeCount.set(matrix[y][w - 1], (edgeCount.get(matrix[y][w - 1]) ?? 0) + 1)
    }
    const best = [...edgeCount.entries()].sort((a, b) => b[1] - a[1])[0]
    if (best && (quota.get(best[0]) ?? 0) / beads >= 0.15) {
      canvasColorIndex = best[0]
      canvasRatio = (quota.get(best[0]) ?? 0) / beads
    }
  }
  // 画布色豁免口径：主色/τ 只在非画布色上计算
  const fgQuotas = [...quota.entries()].filter(([c]) => c !== canvasColorIndex).map(([, q]) => q)
  const fgBeads = fgQuotas.reduce((s, q) => s + q, 0)
  const effQuotas = canvasColorIndex >= 0 ? fgQuotas : quotas
  const effBeads = canvasColorIndex >= 0 ? fgBeads : beads
  const effMax = effQuotas.length > 0 ? Math.max(...effQuotas) : 0
  const dominantRatio = effBeads > 0 ? effMax / effBeads : 0
  // τ = quota / (beads - quota)，取最大色（带背景档：非画布色相对全图空间——
  // 画布区域也是可换空间，故分母仍用全豆数）
  const maxTau = effQuotas.length > 0
    ? Math.max(...effQuotas.map((q) => (beads - q > 0 ? q / (beads - q) : Infinity)))
    : 0

  // 8 邻域同色连通区域
  const visited = Array.from({ length: h }, () => new Array<boolean>(w).fill(false))
  let regionCount = 0
  let maxRegionSize = 0
  let tinyDetailCount = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (matrix[y][x] < 0 || visited[y][x]) continue
      const color = matrix[y][x]
      let size = 0
      const queue: [number, number][] = [[y, x]]
      visited[y][x] = true
      while (queue.length > 0) {
        const [cy, cx] = queue.pop()!
        size += 1
        for (const [dy, dx] of D8) {
          const ny = cy + dy
          const nx = cx + dx
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
          if (visited[ny][nx] || matrix[ny][nx] !== color) continue
          visited[ny][nx] = true
          queue.push([ny, nx])
        }
      }
      if (size >= 4) {
        regionCount += 1
        // 带背景档：画布色区域不参与最大区域判定（画布是"底"，不是内容块）
        if (color !== canvasColorIndex && size > maxRegionSize) maxRegionSize = size
      } else {
        tinyDetailCount += 1
      }
    }
  }
  const maxRegionRatio = beads > 0 ? maxRegionSize / beads : 0

  // 调色板（仅实际使用的颜色索引）
  const usedHex = [...quota.keys()]
    .map((idx) => paletteHex[idx])
    .filter((hex): hex is string => typeof hex === 'string')
  const hexValid = usedHex.every((hex) => HEX_COLOR_RE.test(hex))
  let minDeltaE = Infinity
  let nearPairCount = 0
  const labs = usedHex.filter((hex) => HEX_COLOR_RE.test(hex)).map(hexToLab)
  for (let i = 0; i < labs.length; i += 1) {
    for (let j = i + 1; j < labs.length; j += 1) {
      const d = deltaE76(labs[i], labs[j])
      if (d < minDeltaE) minDeltaE = d
      if (d < T.deltaE.yellowBelow) nearPairCount += 1
    }
  }

  // ---- 几何检测器（2026-08-04 人工标注回灌：参考图传染缺陷，指标层不可见）----
  // ① 底边条纹：底部有豆行中，存在某行 ≥80% 的豆是同一颜色、行宽 ≥ 主体宽度一半，
  //    且该颜色在其余行几乎不出现（占其总量 <30%）→ 判为"地面线"
  let hasBottomStrip = false
  {
    const rowBeads: number[] = []
    for (let y = 0; y < h; y += 1) {
      rowBeads.push(matrix[y].reduce((s, v) => s + (v >= 0 ? 1 : 0), 0))
    }
    const beadRows = rowBeads.map((n, y) => ({ n, y })).filter((r) => r.n > 0)
    const maxRowWidth = Math.max(0, ...rowBeads)
    // 只查最底部 2 个有豆行
    for (const { y, n } of beadRows.slice(-2)) {
      const rowCount = new Map<number, number>()
      for (const v of matrix[y]) {
        if (v >= 0) rowCount.set(v, (rowCount.get(v) ?? 0) + 1)
      }
      for (const [c, cnt] of rowCount) {
        if (cnt / n < 0.8 || n < maxRowWidth * 0.5) continue
        const totalOfC = quota.get(c) ?? 0
        // 这两行以外该色几乎不出现 → 地面线
        let inStripRows = 0
        for (const { y: sy } of beadRows.slice(-2)) {
          for (const v of matrix[sy]) if (v === c) inStripRows += 1
        }
        if (totalOfC > 0 && (totalOfC - inStripRows) / totalOfC < 0.3) {
          hasBottomStrip = true
        }
      }
    }
  }
  // ② 游离装饰：豆群（不分颜色的 8 邻域连通）中，除最大主体外的独立小群
  //    （尺寸 < 主体的 15% 且 < 30 豆）计为装饰件（云/星/闪光）
  let floatingDecorCount = 0
  {
    const seen = Array.from({ length: h }, () => new Array<boolean>(w).fill(false))
    const clusterSizes: number[] = []
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (matrix[y][x] < 0 || seen[y][x]) continue
        let size = 0
        const queue: [number, number][] = [[y, x]]
        seen[y][x] = true
        while (queue.length > 0) {
          const [cy, cx] = queue.pop()!
          size += 1
          for (const [dy, dx] of D8) {
            const ny = cy + dy
            const nx = cx + dx
            if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
            if (seen[ny][nx] || matrix[ny][nx] < 0) continue
            seen[ny][nx] = true
            queue.push([ny, nx])
          }
        }
        clusterSizes.push(size)
      }
    }
    const main = Math.max(0, ...clusterSizes)
    floatingDecorCount = clusterSizes.filter((s) => s < main && s < Math.max(30, main * 0.15)).length
  }

  // ---- 风格指标（规范 §7.5）：硬指标查「能不能玩」，这三条查「死不死板」----
  // 镜像度：逐格与左右镜像位比对（含空位，空对空也算镜像 —— 对称剪影本身就是死板的一部分）
  let mirrorSame = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (matrix[y][x] === matrix[y][w - 1 - x]) mirrorSame += 1
    }
  }
  const mirrorRatio = h * w > 0 ? mirrorSame / (h * w) : 0

  // 条纹度：非空行中「仅含 ≤2 种颜色」的行占比。「整行 × N 行」凑配额的直接表现
  let stripedRows = 0
  let filledRows = 0
  for (let y = 0; y < h; y += 1) {
    const colors = new Set<number>()
    for (let x = 0; x < w; x += 1) if (matrix[y][x] >= 0) colors.add(matrix[y][x])
    if (colors.size === 0) continue
    filledRows += 1
    if (colors.size <= 2) stripedRows += 1
  }
  const stripeRatio = filledRows > 0 ? stripedRows / filledRows : 0

  // 矩形度：≥6 格的同色 4 邻域连通区，面积/包围盒面积，按面积加权。
  // 用 4 邻域而非 8 邻域 —— 阶梯边在 8 邻域下会与相邻块连通，掩盖「块是不是方的」这件事。
  const D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
  const rectSeen = Array.from({ length: h }, () => new Array<boolean>(w).fill(false))
  let rectWeighted = 0
  let rectTotal = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (rectSeen[y][x] || matrix[y][x] < 0) continue
      const color = matrix[y][x]
      const stack: [number, number][] = [[y, x]]
      rectSeen[y][x] = true
      let size = 0
      let minY = y
      let maxY = y
      let minX = x
      let maxX = x
      while (stack.length > 0) {
        const [cy, cx] = stack.pop() as [number, number]
        size += 1
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        for (const [dy, dx] of D4) {
          const ny = cy + dy
          const nx = cx + dx
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
          if (rectSeen[ny][nx] || matrix[ny][nx] !== color) continue
          rectSeen[ny][nx] = true
          stack.push([ny, nx])
        }
      }
      if (size < 6) continue
      const bbox = (maxY - minY + 1) * (maxX - minX + 1)
      rectWeighted += (size / bbox) * size
      rectTotal += size
    }
  }
  const rectangularity = rectTotal > 0 ? rectWeighted / rectTotal : 0

  return {
    beadCount: beads,
    colorCount: quota.size,
    dominantRatio,
    maxTau,
    minQuota,
    starvedColorCount,
    hexValid,
    regionCount,
    maxRegionRatio,
    tinyDetailCount,
    minDeltaE: labs.length >= 2 ? minDeltaE : NaN,
    nearPairCount,
    hasBottomStrip,
    floatingDecorCount,
    canvasColorIndex,
    canvasRatio,
    mirrorRatio,
    stripeRatio,
    rectangularity,
    fillRatio: h * w > 0 ? beads / (h * w) : 0
  }
}

/** 按规范 §1/§2 分档。带背景档（canvasBackground）豆量走 650-1200 独立带宽。 */
export const gradeImage = (m: PreflightMetrics, opts: PreflightOptions = {}): PreflightVerdict => {
  const T = PREFLIGHT_THRESHOLDS
  const bandBg = opts.canvasBackground && m.canvasColorIndex >= 0
  const B = bandBg ? PREFLIGHT_THRESHOLDS_BG.beads : T.beads
  const checks: PreflightCheck[] = []
  const push = (key: string, grade: PreflightGrade, detail: string) => checks.push({ key, grade, detail })

  push('dominant', m.dominantRatio <= T.dominant.green ? 'green' : m.dominantRatio <= T.dominant.yellow ? 'yellow' : 'red',
    m.dominantRatio.toFixed(3))
  push('tau', m.maxTau <= T.tau.green ? 'green' : m.maxTau <= T.tau.yellow ? 'yellow' : 'red',
    Number.isFinite(m.maxTau) ? m.maxTau.toFixed(3) : 'inf')
  push('beads',
    m.beadCount >= B.greenLo && m.beadCount <= B.greenHi ? 'green'
      : m.beadCount >= B.yellowLo && m.beadCount <= B.yellowHi ? 'yellow' : 'red',
    `${m.beadCount}${bandBg ? ' (bg-band)' : ''}`)
  push('colors',
    m.colorCount >= T.colors.greenLo && m.colorCount <= T.colors.greenHi ? 'green'
      : m.colorCount >= T.colors.yellowLo && m.colorCount <= T.colors.yellowHi ? 'yellow' : 'red',
    String(m.colorCount))
  push('minQuota',
    m.minQuota >= T.minQuota ? 'green'
      : m.starvedColorCount <= T.starved.yellowMax ? 'yellow' : 'red',
    `min=${m.minQuota} starved=${m.starvedColorCount}`)
  push('hex', m.hexValid ? 'green' : 'red', m.hexValid ? 'ok' : 'invalid')
  push('regions', m.regionCount >= T.regions.green ? 'green' : m.regionCount >= T.regions.yellow ? 'yellow' : 'red',
    String(m.regionCount))
  push('maxRegion', m.maxRegionRatio <= T.maxRegion.green ? 'green' : m.maxRegionRatio <= T.maxRegion.yellow ? 'yellow' : 'red',
    m.maxRegionRatio.toFixed(3))
  push('tinyDetails',
    m.tinyDetailCount <= T.tinyDetails.green ? 'green'
      // 带背景档：小云朵/星点是场景合法元素（降采样也会碎化云），只黄不红，人工定夺
      : (bandBg || m.tinyDetailCount <= T.tinyDetails.yellow) ? 'yellow' : 'red',
    String(m.tinyDetailCount))
  // ΔE：规范 §3 —— <20 黄（同族色阶允许但必须可辨），<13 红（现库反例 13.6 近白对）
  push('deltaE',
    !Number.isFinite(m.minDeltaE) || m.minDeltaE >= T.deltaE.yellowBelow ? 'green'
      : m.minDeltaE >= T.deltaE.redBelow ? 'yellow' : 'red',
    Number.isFinite(m.minDeltaE) ? `${m.minDeltaE.toFixed(1)} (near=${m.nearPairCount})` : 'n/a')
  // 几何检测器（人工标注回灌）：均为黄级——底边可裁、装饰可清，人工或后处理定夺
  // 带背景档豁免：场景图的地面线/漂浮云朵是合法构图元素
  push('bottomStrip', !bandBg && m.hasBottomStrip ? 'yellow' : 'green', m.hasBottomStrip ? 'detected' : 'none')
  push('floatingDecor', !bandBg && m.floatingDecorCount > 0 ? 'yellow' : 'green', String(m.floatingDecorCount))
  // 风格三项（规范 §7.5）：拦「指标全绿但是个方盒子」。天然对称题材（闹钟/皇冠）
  // 仍应靠内部细节打破完全对称，因此 100% 镜像一律判红，不按题材豁免。
  const MIR = opts.animateSubject ? T.mirrorAnimate : T.mirror
  push('mirror',
    m.mirrorRatio <= MIR.green ? 'green' : m.mirrorRatio <= MIR.yellow ? 'yellow' : 'red',
    `${m.mirrorRatio.toFixed(2)}${opts.animateSubject ? ' (animate)' : ''}`)
  push('stripe',
    m.stripeRatio <= T.stripe.green ? 'green' : m.stripeRatio <= T.stripe.yellow ? 'yellow' : 'red',
    m.stripeRatio.toFixed(2))
  push('rect',
    m.rectangularity <= T.rect.green ? 'green' : m.rectangularity <= T.rect.yellow ? 'yellow' : 'red',
    m.rectangularity.toFixed(2))

  const grade: PreflightGrade = checks.some((c) => c.grade === 'red') ? 'red'
    : checks.some((c) => c.grade === 'yellow') ? 'yellow' : 'green'
  return {
    grade,
    checks,
    redKeys: checks.filter((c) => c.grade === 'red').map((c) => c.key),
    yellowKeys: checks.filter((c) => c.grade === 'yellow').map((c) => c.key)
  }
}
