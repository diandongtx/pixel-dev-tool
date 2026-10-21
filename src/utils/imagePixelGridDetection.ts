export interface PixelGridDetectionInput {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface PixelGridDetectionResult {
  cellSize: number | null
  confidence: 'none' | 'low' | 'medium' | 'high'
  score: number
}

const MIN_CELL_SIZE = 2
const MAX_CELL_SIZE = 80

const getPixelOffset = (width: number, x: number, y: number): number => ((y * width) + x) * 4

const getColorDistance = (
  data: Uint8ClampedArray,
  width: number,
  leftX: number,
  leftY: number,
  rightX: number,
  rightY: number
): number => {
  const leftOffset = getPixelOffset(width, leftX, leftY)
  const rightOffset = getPixelOffset(width, rightX, rightY)
  const red = data[leftOffset] - data[rightOffset]
  const green = data[leftOffset + 1] - data[rightOffset + 1]
  const blue = data[leftOffset + 2] - data[rightOffset + 2]

  return Math.sqrt((red * red) + (green * green) + (blue * blue))
}

const mean = (values: number[]): number => {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const buildVerticalEdgeScores = ({ data, width, height }: PixelGridDetectionInput): number[] => {
  const scores: number[] = []

  for (let x = 1; x < width; x += 1) {
    let total = 0
    for (let y = 0; y < height; y += 1) {
      total += getColorDistance(data, width, x - 1, y, x, y)
    }
    scores.push(total / height)
  }

  return scores
}

const buildHorizontalEdgeScores = ({ data, width, height }: PixelGridDetectionInput): number[] => {
  const scores: number[] = []

  for (let y = 1; y < height; y += 1) {
    let total = 0
    for (let x = 0; x < width; x += 1) {
      total += getColorDistance(data, width, x, y - 1, x, y)
    }
    scores.push(total / width)
  }

  return scores
}

const scoreAxisCellSize = (edgeScores: number[], cellSize: number): number => {
  if (edgeScores.length < cellSize * 2) return 0

  const allMean = mean(edgeScores)
  const maxScore = Math.max(...edgeScores, 1)
  let bestScore = 0

  for (let offset = 0; offset < cellSize; offset += 1) {
    const boundaryScores: number[] = []
    const interiorScores: number[] = []

    edgeScores.forEach((score, index) => {
      const edgePosition = index + 1
      if (edgePosition % cellSize === offset) {
        boundaryScores.push(score)
      } else {
        interiorScores.push(score)
      }
    })

    if (boundaryScores.length < 2 || interiorScores.length === 0) {
      continue
    }

    const boundaryMean = mean(boundaryScores)
    const interiorMean = mean(interiorScores)
    const contrast = Math.max(0, boundaryMean - interiorMean) / maxScore
    const boundaryCoverage = boundaryScores.filter((score) => score > allMean).length / boundaryScores.length
    const boundaryCountWeight = boundaryScores.length / (boundaryScores.length + 2)
    const candidateScore = contrast * (0.65 + (0.35 * boundaryCoverage)) * boundaryCountWeight

    bestScore = Math.max(bestScore, candidateScore)
  }

  return bestScore
}

const getConfidence = (score: number): PixelGridDetectionResult['confidence'] => {
  if (score >= 0.42) return 'high'
  if (score >= 0.28) return 'medium'
  if (score >= 0.18) return 'low'
  return 'none'
}

export const detectPixelGridSize = (
  input: PixelGridDetectionInput
): PixelGridDetectionResult => {
  const maxCandidate = Math.min(MAX_CELL_SIZE, Math.floor(Math.min(input.width, input.height) / 2))
  if (maxCandidate < MIN_CELL_SIZE) {
    return { cellSize: null, confidence: 'none', score: 0 }
  }

  const verticalScores = buildVerticalEdgeScores(input)
  const horizontalScores = buildHorizontalEdgeScores(input)
  let bestCellSize: number | null = null
  let bestScore = 0

  for (let cellSize = MIN_CELL_SIZE; cellSize <= maxCandidate; cellSize += 1) {
    const verticalScore = scoreAxisCellSize(verticalScores, cellSize)
    const horizontalScore = scoreAxisCellSize(horizontalScores, cellSize)
    const score = (verticalScore + horizontalScore) / 2

    if (score > bestScore + 0.02 || (Math.abs(score - bestScore) <= 0.02 && bestCellSize !== null && cellSize < bestCellSize)) {
      bestScore = score
      bestCellSize = cellSize
    }
  }

  const confidence = getConfidence(bestScore)
  return {
    cellSize: confidence === 'none' ? null : bestCellSize,
    confidence,
    score: Number(bestScore.toFixed(3))
  }
}
