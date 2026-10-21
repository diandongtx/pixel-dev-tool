import type { GridData } from '../types/grid'
import { cloneGridData } from './gridData'
import { EXTERNAL_BACKGROUND_INDEX, getExternalBackgroundMask } from './subjectGrid'

interface Point {
  x: number
  y: number
}

export interface LevelStepEstimate {
  valid: boolean
  reason: string | null
  occupiedSlotCount: number
  fixedSlotCount: number
  misplacedSlotCount: number
  imageSpareSlotCount: number
  temporarySlotCount: number
  totalSpareSlotCount: number
  estimatedStepCount: number
  directPlacementStepCount: number
  trayTransferStepCount: number
  trayUsagePeak: number
  remainingMismatchCount: number
  ruleAssumptionVersion: string
}

type AreaType = 'board' | 'tray'

interface BoardColorComponent {
  area: 'board'
  colorId: number
  cells: Point[]
}

interface TrayColorComponent {
  area: 'tray'
  colorId: number
  cells: number[]
}

type ColorComponent = BoardColorComponent | TrayColorComponent

interface BoardEmptyComponent {
  area: 'board'
  cells: Point[]
}

interface TrayEmptyComponent {
  area: 'tray'
  cells: number[]
}

type EmptyComponent = BoardEmptyComponent | TrayEmptyComponent

interface SimulationState {
  board: number[][]
  tray: number[]
}

interface SimulatedAction {
  nextState: SimulationState
  signature: string
  score: number
  destinationArea: AreaType
}

interface BlockSpec {
  id: number
  colorId: number
  size: number
  preferredTemplateIds: number[]
  primaryTemplateId?: number
}

interface BlockPlacement {
  spec: BlockSpec
  cells: Point[]
}

interface SourceTemplate {
  id: number
  colorId: number
  cells: Point[]
  adjacentIds: Set<number>
}

interface SourceTemplateInfo {
  templates: SourceTemplate[]
  templateIds: number[][]
}

interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface GridColorComponent {
  colorId: number
  cells: Point[]
}

export interface LevelGridSortOptions {
  overflowConstraint?: number
  normalizeExternalBackground?: boolean
  backgroundIndex?: number | null
  inferExternalBackground?: boolean
}

const DIRECTIONS: Point[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
]

const ORTHOGONAL_DIRECTIONS: Point[] = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 }
]

const EMPTY_SLOT_INDEX = -1
const RULE_ASSUMPTION_VERSION = 'v2026-04-08'

const normalizeOverflowConstraint = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 5
  return Math.min(5, Math.max(0, Math.floor(value)))
}

const getOverflowRatio = (constraint: number): number => constraint / 5

const shuffle = <T,>(source: T[]): T[] => {
  const result = [...source]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }
  return result
}

const createInvalidStepEstimate = (
  reason: string,
  temporarySlotCount: number,
  imageSpareSlotCount = 0,
  occupiedSlotCount = 0,
  fixedSlotCount = 0,
  misplacedSlotCount = 0
): LevelStepEstimate => ({
  valid: false,
  reason,
  occupiedSlotCount,
  fixedSlotCount,
  misplacedSlotCount,
  imageSpareSlotCount,
  temporarySlotCount,
  totalSpareSlotCount: imageSpareSlotCount + temporarySlotCount,
  estimatedStepCount: 0,
  directPlacementStepCount: 0,
  trayTransferStepCount: 0,
  trayUsagePeak: 0,
  remainingMismatchCount: misplacedSlotCount,
  ruleAssumptionVersion: RULE_ASSUMPTION_VERSION
})

const comparePoints = (left: Point, right: Point): number => {
  if (left.y !== right.y) return left.y - right.y
  return left.x - right.x
}

const cloneBoard = (board: number[][]): number[][] => board.map((row) => [...row])

const countBoardFixedSlots = (board: number[][], targetGrid: number[][]): number => {
  let fixedCount = 0
  for (let y = 0; y < targetGrid.length; y += 1) {
    for (let x = 0; x < (targetGrid[y]?.length ?? 0); x += 1) {
      const targetValue = targetGrid[y][x]
      if (targetValue === EXTERNAL_BACKGROUND_INDEX) continue
      if (board[y][x] === targetValue) {
        fixedCount += 1
      }
    }
  }
  return fixedCount
}

const countBoardEmptySlots = (board: number[][]): number => {
  let emptyCount = 0
  for (const row of board) {
    for (const value of row) {
      if (value === EMPTY_SLOT_INDEX) {
        emptyCount += 1
      }
    }
  }
  return emptyCount
}

const countTrayOccupiedSlots = (tray: number[]): number => tray.filter((value) => value !== EMPTY_SLOT_INDEX).length

const countGlobalMismatch = (board: number[][], targetGrid: number[][], tray: number[]): number => {
  let mismatchCount = 0
  for (let y = 0; y < targetGrid.length; y += 1) {
    for (let x = 0; x < (targetGrid[y]?.length ?? 0); x += 1) {
      const targetValue = targetGrid[y][x]
      if (targetValue === EXTERNAL_BACKGROUND_INDEX) continue
      if (board[y][x] !== targetValue) {
        mismatchCount += 1
      }
    }
  }
  return mismatchCount + countTrayOccupiedSlots(tray)
}

const buildStateSignature = (state: SimulationState): string => (
  `${state.board.map((row) => row.join(',')).join('|')}::${state.tray.join(',')}`
)

const countTargetNeighbors = (targetGrid: number[][], point: Point, colorId: number): number => {
  const height = targetGrid.length
  const width = targetGrid[0]?.length ?? 0
  let matchCount = 0

  for (const direction of DIRECTIONS) {
    const nx = point.x + direction.x
    const ny = point.y + direction.y
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
    if (targetGrid[ny][nx] === colorId) {
      matchCount += 1
    }
  }

  return matchCount
}

const selectBoardCellsForColor = (
  cells: Point[],
  count: number,
  targetGrid: number[][],
  colorId: number
): Point[] => {
  if (count <= 0) return []
  if (count >= cells.length) return [...cells].sort(comparePoints)

  return [...cells]
    .sort((left, right) => {
      const leftMatch = targetGrid[left.y][left.x] === colorId ? 1 : 0
      const rightMatch = targetGrid[right.y][right.x] === colorId ? 1 : 0
      if (leftMatch !== rightMatch) return rightMatch - leftMatch

      const leftNeighborCount = countTargetNeighbors(targetGrid, left, colorId)
      const rightNeighborCount = countTargetNeighbors(targetGrid, right, colorId)
      if (leftNeighborCount !== rightNeighborCount) return rightNeighborCount - leftNeighborCount

      return comparePoints(left, right)
    })
    .slice(0, count)
}

const getTrayLayoutScore = (tray: number[]): number => {
  let maxEmptyRun = 0
  let currentEmptyRun = 0
  let occupiedSegmentCount = 0
  let inOccupiedSegment = false

  for (const value of tray) {
    if (value === EMPTY_SLOT_INDEX) {
      currentEmptyRun += 1
      maxEmptyRun = Math.max(maxEmptyRun, currentEmptyRun)
      inOccupiedSegment = false
      continue
    }

    currentEmptyRun = 0
    if (!inOccupiedSegment) {
      occupiedSegmentCount += 1
      inOccupiedSegment = true
    }
  }

  return (maxEmptyRun * 20) - (occupiedSegmentCount * 15)
}

const applyTrayCells = (tray: number[], indices: number[], colorId: number): number[] => {
  const nextTray = [...tray]
  for (const index of indices) {
    nextTray[index] = colorId
  }
  return nextTray
}

const selectTrayCells = (
  indices: number[],
  count: number,
  tray: number[],
  colorId: number
): number[] => {
  if (count <= 0) return []
  if (count >= indices.length) return [...indices]

  const leftOption = indices.slice(0, count)
  const rightOption = indices.slice(indices.length - count)
  const leftScore = getTrayLayoutScore(applyTrayCells(tray, leftOption, colorId))
  const rightScore = getTrayLayoutScore(applyTrayCells(tray, rightOption, colorId))

  if (rightScore > leftScore) {
    return rightOption
  }

  return leftOption
}

const collectBoardColorComponents = (board: number[][]): BoardColorComponent[] => {
  const height = board.length
  const width = board[0]?.length ?? 0
  const visited = Array.from({ length: height }, () => Array(width).fill(false))
  const components: BoardColorComponent[] = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colorId = board[y][x]
      if (visited[y][x]) continue
      if (colorId < 0) continue

      const stack: Point[] = [{ x, y }]
      const cells: Point[] = []
      visited[y][x] = true

      while (stack.length > 0) {
        const current = stack.pop()
        if (!current) continue
        cells.push(current)

        for (const direction of DIRECTIONS) {
          const nx = current.x + direction.x
          const ny = current.y + direction.y
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (visited[ny][nx]) continue
          if (board[ny][nx] !== colorId) continue
          visited[ny][nx] = true
          stack.push({ x: nx, y: ny })
        }
      }

      components.push({
        area: 'board',
        colorId,
        cells: cells.sort(comparePoints)
      })
    }
  }

  return components
}

const collectBoardEmptyComponents = (board: number[][]): BoardEmptyComponent[] => {
  const height = board.length
  const width = board[0]?.length ?? 0
  const visited = Array.from({ length: height }, () => Array(width).fill(false))
  const components: BoardEmptyComponent[] = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (visited[y][x]) continue
      if (board[y][x] !== EMPTY_SLOT_INDEX) continue

      const stack: Point[] = [{ x, y }]
      const cells: Point[] = []
      visited[y][x] = true

      while (stack.length > 0) {
        const current = stack.pop()
        if (!current) continue
        cells.push(current)

        for (const direction of DIRECTIONS) {
          const nx = current.x + direction.x
          const ny = current.y + direction.y
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (visited[ny][nx]) continue
          if (board[ny][nx] !== EMPTY_SLOT_INDEX) continue
          visited[ny][nx] = true
          stack.push({ x: nx, y: ny })
        }
      }

      components.push({
        area: 'board',
        cells: cells.sort(comparePoints)
      })
    }
  }

  return components
}

const collectTrayColorComponents = (tray: number[]): TrayColorComponent[] => {
  const components: TrayColorComponent[] = []
  let index = 0

  while (index < tray.length) {
    const colorId = tray[index]
    if (colorId === EMPTY_SLOT_INDEX) {
      index += 1
      continue
    }

    const cells: number[] = [index]
    let nextIndex = index + 1
    while (nextIndex < tray.length && tray[nextIndex] === colorId) {
      cells.push(nextIndex)
      nextIndex += 1
    }

    components.push({
      area: 'tray',
      colorId,
      cells
    })
    index = nextIndex
  }

  return components
}

const collectTrayEmptyComponents = (tray: number[]): TrayEmptyComponent[] => {
  const components: TrayEmptyComponent[] = []
  let index = 0

  while (index < tray.length) {
    if (tray[index] !== EMPTY_SLOT_INDEX) {
      index += 1
      continue
    }

    const cells: number[] = [index]
    let nextIndex = index + 1
    while (nextIndex < tray.length && tray[nextIndex] === EMPTY_SLOT_INDEX) {
      cells.push(nextIndex)
      nextIndex += 1
    }

    components.push({
      area: 'tray',
      cells
    })
    index = nextIndex
  }

  return components
}

const simulateAction = (
  state: SimulationState,
  targetGrid: number[][],
  source: ColorComponent,
  destination: EmptyComponent
): SimulatedAction | null => {
  const movedCount = Math.min(source.cells.length, destination.cells.length)
  if (movedCount <= 0) return null

  const beforeMismatchCount = countGlobalMismatch(state.board, targetGrid, state.tray)
  const beforeFixedCount = countBoardFixedSlots(state.board, targetGrid)
  const nextState: SimulationState = {
    board: cloneBoard(state.board),
    tray: [...state.tray]
  }

  if (source.area === 'board') {
    for (const point of source.cells) {
      nextState.board[point.y][point.x] = EMPTY_SLOT_INDEX
    }
  } else {
    for (const index of source.cells) {
      nextState.tray[index] = EMPTY_SLOT_INDEX
    }
  }

  const keepCount = source.cells.length - movedCount
  let disturbedCorrectCount = 0
  let freedWrongCount = 0
  let targetPlacedCount = 0

  if (source.area === 'board') {
    const keepCells = selectBoardCellsForColor(source.cells, keepCount, targetGrid, source.colorId)
    const keepSet = new Set(keepCells.map((point) => `${point.x},${point.y}`))

    for (const point of keepCells) {
      nextState.board[point.y][point.x] = source.colorId
    }

    for (const point of source.cells) {
      const key = `${point.x},${point.y}`
      if (keepSet.has(key)) continue
      if (targetGrid[point.y][point.x] === source.colorId) {
        disturbedCorrectCount += 1
      } else {
        freedWrongCount += 1
      }
    }
  } else {
    const keepIndices = selectTrayCells(source.cells, keepCount, nextState.tray, source.colorId)
    for (const index of keepIndices) {
      nextState.tray[index] = source.colorId
    }
  }

  if (destination.area === 'board') {
    const fillCells = selectBoardCellsForColor(destination.cells, movedCount, targetGrid, source.colorId)
    for (const point of fillCells) {
      nextState.board[point.y][point.x] = source.colorId
      if (targetGrid[point.y][point.x] === source.colorId) {
        targetPlacedCount += 1
      }
    }
  } else {
    const fillIndices = selectTrayCells(destination.cells, movedCount, nextState.tray, source.colorId)
    for (const index of fillIndices) {
      nextState.tray[index] = source.colorId
    }
  }

  const afterMismatchCount = countGlobalMismatch(nextState.board, targetGrid, nextState.tray)
  const afterFixedCount = countBoardFixedSlots(nextState.board, targetGrid)
  const mismatchDelta = beforeMismatchCount - afterMismatchCount
  const fixedDelta = afterFixedCount - beforeFixedCount
  const trayLayoutScore = getTrayLayoutScore(nextState.tray)

  const score = (
    (mismatchDelta * 1000) +
    (fixedDelta * 180) +
    (targetPlacedCount * 120) +
    (freedWrongCount * 35) -
    (disturbedCorrectCount * 260) +
    trayLayoutScore +
    (destination.area === 'tray' ? (movedCount * 12) : (movedCount * 6))
  )

  return {
    nextState,
    signature: buildStateSignature(nextState),
    score,
    destinationArea: destination.area
  }
}

const pointKey = (point: Point): string => `${point.x},${point.y}`

const getDistanceSquared = (left: Point, right: Point): number => {
  const dx = left.x - right.x
  const dy = left.y - right.y
  return (dx * dx) + (dy * dy)
}

const collectBeanSlots = (grid: number[][], sortableMask: boolean[][]): Point[] => {
  const slots: Point[] = []
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x += 1) {
      if (!sortableMask[y]?.[x]) continue
      if (grid[y][x] < 0) continue
      slots.push({ x, y })
    }
  }
  return slots
}

const countSlotColors = (grid: number[][], slots: Point[]): Map<number, number> => {
  const counts = new Map<number, number>()
  for (const slot of slots) {
    const colorId = grid[slot.y][slot.x]
    counts.set(colorId, (counts.get(colorId) ?? 0) + 1)
  }
  return counts
}

const collectSourceTemplates = (grid: number[][], slots: Point[]): SourceTemplateInfo => {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const slotKeys = new Set(slots.map(pointKey))
  const templateIds = Array.from({ length: height }, () => Array(width).fill(-1))
  const templates: SourceTemplate[] = []

  for (const slot of slots) {
    if (templateIds[slot.y][slot.x] >= 0) continue

    const colorId = grid[slot.y][slot.x]
    const id = templates.length
    const cells: Point[] = []
    const queue: Point[] = [slot]
    templateIds[slot.y][slot.x] = id

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      cells.push(current)

      for (const direction of DIRECTIONS) {
        const next = { x: current.x + direction.x, y: current.y + direction.y }
        if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) continue
        if (!slotKeys.has(pointKey(next))) continue
        if (templateIds[next.y][next.x] >= 0 || grid[next.y][next.x] !== colorId) continue
        templateIds[next.y][next.x] = id
        queue.push(next)
      }
    }

    templates.push({ id, colorId, cells, adjacentIds: new Set<number>() })
  }

  for (const template of templates) {
    for (const cell of template.cells) {
      for (const direction of DIRECTIONS) {
        const nx = cell.x + direction.x
        const ny = cell.y + direction.y
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const neighborTemplateId = templateIds[ny][nx]
        if (neighborTemplateId < 0 || neighborTemplateId === template.id) continue
        template.adjacentIds.add(neighborTemplateId)
      }
    }
  }

  return { templates, templateIds }
}

const normalizeTargetBlockCount = (requestedBlockCount: number, colorCount: number, beadCount: number): number => {
  if (beadCount <= 0 || colorCount <= 0) return 0
  const requested = Math.max(1, Math.floor(requestedBlockCount))
  return Math.min(beadCount, Math.max(colorCount, requested))
}

const pickWeightedColor = (colorIds: number[], weights: Map<number, number>): number => {
  const totalWeight = colorIds.reduce((sum, colorId) => sum + (weights.get(colorId) ?? 0), 0)
  if (totalWeight <= 0) return colorIds[0]

  let cursor = Math.random() * totalWeight
  for (const colorId of colorIds) {
    cursor -= weights.get(colorId) ?? 0
    if (cursor <= 0) return colorId
  }
  return colorIds[colorIds.length - 1]
}

const allocateBlockCounts = (colorCounts: Map<number, number>, targetBlockCount: number): Map<number, number> => {
  const blockCounts = new Map<number, number>()
  const colorIds = Array.from(colorCounts.keys()).sort((left, right) => left - right)
  for (const colorId of colorIds) {
    blockCounts.set(colorId, 1)
  }

  let remainingBlocks = targetBlockCount - colorIds.length
  while (remainingBlocks > 0) {
    const preferredCandidates = colorIds.filter((colorId) => {
      const beadCount = colorCounts.get(colorId) ?? 0
      const currentBlockCount = blockCounts.get(colorId) ?? 1
      return beadCount >= ((currentBlockCount + 1) * 2)
    })
    const fallbackCandidates = colorIds.filter((colorId) => {
      const beadCount = colorCounts.get(colorId) ?? 0
      const currentBlockCount = blockCounts.get(colorId) ?? 1
      return beadCount > currentBlockCount
    })
    const candidates = preferredCandidates.length > 0 ? preferredCandidates : fallbackCandidates
    if (candidates.length === 0) break

    const weights = new Map<number, number>()
    for (const colorId of candidates) {
      const beadCount = colorCounts.get(colorId) ?? 0
      const currentBlockCount = blockCounts.get(colorId) ?? 1
      weights.set(colorId, beadCount / (currentBlockCount + 1))
    }

    const selectedColorId = pickWeightedColor(candidates, weights)
    blockCounts.set(selectedColorId, (blockCounts.get(selectedColorId) ?? 1) + 1)
    remainingBlocks -= 1
  }

  return blockCounts
}

const splitColorIntoBlockSizes = (beadCount: number, blockCount: number): number[] => {
  if (blockCount <= 1) return [beadCount]
  const minimumSize = beadCount >= blockCount * 2 ? 2 : 1
  const sizes: number[] = []
  let remainingBeads = beadCount
  let remainingBlocks = blockCount

  while (remainingBlocks > 1) {
    const averageSize = remainingBeads / remainingBlocks
    const randomOffset = (Math.random() - 0.5) * averageSize
    const minimumRemaining = minimumSize * (remainingBlocks - 1)
    const maximumSize = remainingBeads - minimumRemaining
    const size = Math.min(
      maximumSize,
      Math.max(minimumSize, Math.round(averageSize + randomOffset))
    )
    sizes.push(size)
    remainingBeads -= size
    remainingBlocks -= 1
  }
  sizes.push(remainingBeads)

  return shuffle(sizes)
}

const buildBlockSpecs = (colorCounts: Map<number, number>, targetBlockCount: number): BlockSpec[] => {
  const blockCounts = allocateBlockCounts(colorCounts, targetBlockCount)
  const specs: BlockSpec[] = []
  let nextId = 0

  for (const colorId of Array.from(colorCounts.keys()).sort((left, right) => left - right)) {
    const beadCount = colorCounts.get(colorId) ?? 0
    const blockCount = blockCounts.get(colorId) ?? 1
    const sizes = splitColorIntoBlockSizes(beadCount, blockCount)
    for (const size of sizes) {
      specs.push({ id: nextId, colorId, size, preferredTemplateIds: [] })
      nextId += 1
    }
  }

  return specs.sort((left, right) => {
    if (right.size !== left.size) return right.size - left.size
    if (left.colorId !== right.colorId) return left.colorId - right.colorId
    return left.id - right.id
  })
}

const assignBlockSpecsToSourceTemplates = (
  specs: BlockSpec[],
  templates: SourceTemplate[],
  overflowConstraint = 5
): BlockSpec[] => {
  if (templates.length === 0) return specs

  const remainingCapacity = new Map(templates.map((template) => [template.id, template.cells.length]))
  const byId = new Map(templates.map((template) => [template.id, template]))
  const compareTemplatesForSpec = (spec: BlockSpec) => (left: SourceTemplate, right: SourceTemplate): number => {
    const leftAvoidsOriginalColor = left.colorId !== spec.colorId
    const rightAvoidsOriginalColor = right.colorId !== spec.colorId
    if (leftAvoidsOriginalColor !== rightAvoidsOriginalColor) {
      return leftAvoidsOriginalColor ? -1 : 1
    }

    const leftCapacity = remainingCapacity.get(left.id) ?? 0
    const rightCapacity = remainingCapacity.get(right.id) ?? 0
    if (rightCapacity !== leftCapacity) return rightCapacity - leftCapacity
    return left.id - right.id
  }

  const normalizedOverflowConstraint = normalizeOverflowConstraint(overflowConstraint)
  if (normalizedOverflowConstraint >= 5) {
    return specs.map((spec) => {
      const preferredTemplateIds: number[] = []
      let remainingSize = spec.size

      const sortedTemplates = [...templates].sort(compareTemplatesForSpec(spec))
      const primaryTemplate = sortedTemplates[0]
      preferredTemplateIds.push(primaryTemplate.id)

      const consumeCapacity = (templateId: number) => {
        const capacity = remainingCapacity.get(templateId) ?? 0
        const used = Math.min(capacity, remainingSize)
        remainingCapacity.set(templateId, capacity - used)
        remainingSize -= used
      }

      consumeCapacity(primaryTemplate.id)

      const adjacentCandidates = Array.from(primaryTemplate.adjacentIds)
        .map((id) => byId.get(id))
        .filter((template): template is SourceTemplate => Boolean(template))
        .sort(compareTemplatesForSpec(spec))

      for (const candidate of adjacentCandidates) {
        if (remainingSize <= 0) break
        if ((remainingCapacity.get(candidate.id) ?? 0) <= 0) continue
        preferredTemplateIds.push(candidate.id)
        consumeCapacity(candidate.id)
      }

      for (const candidate of sortedTemplates) {
        if (remainingSize <= 0) break
        if (preferredTemplateIds.includes(candidate.id)) continue
        if ((remainingCapacity.get(candidate.id) ?? 0) <= 0) continue
        preferredTemplateIds.push(candidate.id)
        consumeCapacity(candidate.id)
      }

      return {
        ...spec,
        preferredTemplateIds
      }
    })
  }

  const overflowRatio = getOverflowRatio(normalizedOverflowConstraint)
  let nextSpecId = specs.reduce((currentMax, spec) => Math.max(currentMax, spec.id), -1) + 1
  const constrainedSpecs: BlockSpec[] = []

  const buildAllowedTemplateIds = (spec: BlockSpec, primaryTemplate: SourceTemplate, chunkSize: number): number[] => {
    const allowedTemplateIds = [primaryTemplate.id]
    if (overflowRatio <= 0) return allowedTemplateIds

    let availableCapacity = remainingCapacity.get(primaryTemplate.id) ?? 0
    const candidates = [
      ...Array.from(primaryTemplate.adjacentIds)
        .map((id) => byId.get(id))
        .filter((template): template is SourceTemplate => Boolean(template)),
      ...templates
    ].sort(compareTemplatesForSpec(spec))

    for (const candidate of candidates) {
      if (availableCapacity >= chunkSize) break
      if (allowedTemplateIds.includes(candidate.id)) continue
      const capacity = remainingCapacity.get(candidate.id) ?? 0
      if (capacity <= 0) continue
      allowedTemplateIds.push(candidate.id)
      availableCapacity += capacity
    }

    return allowedTemplateIds
  }

  for (const spec of specs) {
    let remainingSize = spec.size
    let hasEmittedSpecChunk = false

    while (remainingSize > 0) {
      const sortedTemplates = [...templates]
        .filter((template) => (remainingCapacity.get(template.id) ?? 0) > 0)
        .sort(compareTemplatesForSpec(spec))
      const primaryTemplate = sortedTemplates[0]
      if (!primaryTemplate) break

      const primaryCapacity = remainingCapacity.get(primaryTemplate.id) ?? 0
      const minimumPrimaryShare = 1 - overflowRatio
      const maximumChunkSize = minimumPrimaryShare >= 1
        ? primaryCapacity
        : Math.max(1, Math.floor(primaryCapacity / minimumPrimaryShare))
      const chunkSize = Math.min(remainingSize, Math.max(1, maximumChunkSize))
      const primaryUse = Math.min(primaryCapacity, Math.ceil(chunkSize * minimumPrimaryShare))
      const nextSpec: BlockSpec = {
        ...spec,
        id: hasEmittedSpecChunk ? nextSpecId : spec.id,
        size: chunkSize,
        primaryTemplateId: primaryTemplate.id,
        preferredTemplateIds: buildAllowedTemplateIds(spec, primaryTemplate, chunkSize)
      }

      if (nextSpec.id === nextSpecId) nextSpecId += 1
      constrainedSpecs.push(nextSpec)
      hasEmittedSpecChunk = true
      remainingCapacity.set(primaryTemplate.id, primaryCapacity - primaryUse)
      remainingSize -= chunkSize
    }

    if (remainingSize > 0) {
      constrainedSpecs.push({
        ...spec,
        id: nextSpecId,
        size: remainingSize,
        preferredTemplateIds: []
      })
      nextSpecId += 1
    }
  }

  return constrainedSpecs
}

const createPlacementGrid = (height: number, width: number): (number | null)[][] => (
  Array.from({ length: height }, () => Array(width).fill(null))
)

const countNeighboringCells = (
  point: Point,
  placementGrid: (number | null)[][],
  placements: BlockPlacement[],
  blockIndex: number
): { ownNeighborCount: number, sameColorOtherBlockCount: number } => {
  let ownNeighborCount = 0
  let sameColorOtherBlockCount = 0
  const colorId = placements[blockIndex].spec.colorId
  const height = placementGrid.length
  const width = placementGrid[0]?.length ?? 0

  for (const direction of DIRECTIONS) {
    const nx = point.x + direction.x
    const ny = point.y + direction.y
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
    const neighborBlockIndex = placementGrid[ny][nx]
    if (neighborBlockIndex === null) continue
    if (neighborBlockIndex === blockIndex) {
      ownNeighborCount += 1
      continue
    }
    if (placements[neighborBlockIndex].spec.colorId === colorId) {
      sameColorOtherBlockCount += 1
    }
  }

  return { ownNeighborCount, sameColorOtherBlockCount }
}

const countDirectionalRun = (
  point: Point,
  placementGrid: (number | null)[][],
  blockIndex: number,
  delta: Point
): number => {
  const height = placementGrid.length
  const width = placementGrid[0]?.length ?? 0
  let count = 1

  for (const sign of [-1, 1]) {
    let x = point.x + (delta.x * sign)
    let y = point.y + (delta.y * sign)
    while (x >= 0 && y >= 0 && x < width && y < height && placementGrid[y][x] === blockIndex) {
      count += 1
      x += delta.x * sign
      y += delta.y * sign
    }
  }

  return count
}

const getStraightRunPenalty = (
  point: Point,
  placementGrid: (number | null)[][],
  blockIndex: number
): number => {
  const horizontalRun = countDirectionalRun(point, placementGrid, blockIndex, { x: 1, y: 0 })
  const verticalRun = countDirectionalRun(point, placementGrid, blockIndex, { x: 0, y: 1 })
  return Math.max(0, horizontalRun - 3) + Math.max(0, verticalRun - 3)
}

const getCellsBounds = (cells: Point[]): Bounds => {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const cell of cells) {
    minX = Math.min(minX, cell.x)
    maxX = Math.max(maxX, cell.x)
    minY = Math.min(minY, cell.y)
    maxY = Math.max(maxY, cell.y)
  }

  return { minX, maxX, minY, maxY }
}

const getExpandedBounds = (bounds: Bounds, point: Point): Bounds => ({
  minX: Math.min(bounds.minX, point.x),
  maxX: Math.max(bounds.maxX, point.x),
  minY: Math.min(bounds.minY, point.y),
  maxY: Math.max(bounds.maxY, point.y)
})

const getBoundsArea = (bounds: Bounds): number => (
  (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1)
)

const countOrthogonalBlockNeighbors = (
  point: Point,
  placementGrid: (number | null)[][],
  blockIndex: number
): number => {
  const height = placementGrid.length
  const width = placementGrid[0]?.length ?? 0
  let count = 0

  for (const direction of ORTHOGONAL_DIRECTIONS) {
    const nx = point.x + direction.x
    const ny = point.y + direction.y
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
    if (placementGrid[ny][nx] === blockIndex) count += 1
  }

  return count
}

const getSquarePackingScore = (
  point: Point,
  placementGrid: (number | null)[][],
  blockIndex: number
): number => {
  const height = placementGrid.length
  const width = placementGrid[0]?.length ?? 0
  let score = 0

  for (const offsetY of [-1, 0]) {
    for (const offsetX of [-1, 0]) {
      let occupiedCorners = 0
      let validCorners = 0
      for (let y = point.y + offsetY; y <= point.y + offsetY + 1; y += 1) {
        for (let x = point.x + offsetX; x <= point.x + offsetX + 1; x += 1) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue
          validCorners += 1
          if (x === point.x && y === point.y) {
            occupiedCorners += 1
          } else if (placementGrid[y][x] === blockIndex) {
            occupiedCorners += 1
          }
        }
      }
      if (validCorners === 4 && occupiedCorners >= 3) {
        score += occupiedCorners === 4 ? 3 : 2
      }
    }
  }

  return score
}

const isPointInPreferredTemplate = (
  point: Point,
  spec: BlockSpec,
  templateIds: number[][] | null
): boolean => {
  if (!templateIds || spec.preferredTemplateIds.length === 0) return true
  return spec.preferredTemplateIds.includes(templateIds[point.y]?.[point.x] ?? -1)
}

const getSpecPrimaryTemplateId = (spec: BlockSpec): number | null => {
  if (typeof spec.primaryTemplateId === 'number') return spec.primaryTemplateId
  return spec.preferredTemplateIds[0] ?? null
}

const isPointWithinSpecOverflowLimit = (
  spec: BlockSpec,
  cells: Point[],
  point: Point,
  templateIds: number[][] | null,
  overflowRatio: number
): boolean => {
  if (!templateIds || overflowRatio >= 1) return true
  const primaryTemplateId = getSpecPrimaryTemplateId(spec)
  if (primaryTemplateId === null) return true

  const nextSize = cells.length + 1
  const outsideCount = cells.reduce((count, cell) => (
    templateIds[cell.y]?.[cell.x] === primaryTemplateId ? count : count + 1
  ), templateIds[point.y]?.[point.x] === primaryTemplateId ? 0 : 1)
  return outsideCount <= Math.floor(nextSize * overflowRatio)
}

const isOriginalSameColorSlot = (sourceGrid: number[][], point: Point, colorId: number): boolean => (
  sourceGrid[point.y]?.[point.x] === colorId
)

const chooseSeed = (
  spec: BlockSpec,
  slots: Point[],
  usedSeedKeys: Set<string>,
  seededPlacements: BlockPlacement[],
  templateIds: number[][] | null = null,
  sourceGrid: number[][] | null = null
): Point | null => {
  let bestPoint: Point | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const slot of slots) {
    if (usedSeedKeys.has(pointKey(slot))) continue

    let sameColorDistance = 400
    let anySeedDistance = 400
    let sameColorTouchPenalty = 0

    for (const placement of seededPlacements) {
      const seed = placement.cells[0]
      const distance = getDistanceSquared(slot, seed)
      anySeedDistance = Math.min(anySeedDistance, distance)
      if (placement.spec.colorId !== spec.colorId) continue
      sameColorDistance = Math.min(sameColorDistance, distance)
      if (Math.abs(slot.x - seed.x) <= 1 && Math.abs(slot.y - seed.y) <= 1) {
        sameColorTouchPenalty += 1000
      }
    }

    const templateScore = isPointInPreferredTemplate(slot, spec, templateIds) ? 1200 : -1200
    const originalSameColorPenalty = sourceGrid && isOriginalSameColorSlot(sourceGrid, slot, spec.colorId) ? 1800 : 0
    const score = (
      templateScore +
      (sameColorDistance * 8) +
      anySeedDistance -
      sameColorTouchPenalty -
      originalSameColorPenalty +
      Math.random()
    )
    if (score > bestScore) {
      bestScore = score
      bestPoint = slot
    }
  }

  return bestPoint
}

const buildGridFromPlacements = (
  sourceGrid: number[][],
  placements: BlockPlacement[]
): number[][] => {
  const grid = sourceGrid.map((row) => [...row])
  for (const placement of placements) {
    for (const cell of placement.cells) {
      grid[cell.y][cell.x] = placement.spec.colorId
    }
  }
  return grid
}

const arrangeSpecsForTemplateFill = (specs: BlockSpec[]): BlockSpec[] => (
  [...specs].sort((left, right) => {
    const leftTemplateId = left.preferredTemplateIds[0] ?? Number.MAX_SAFE_INTEGER
    const rightTemplateId = right.preferredTemplateIds[0] ?? Number.MAX_SAFE_INTEGER
    if (leftTemplateId !== rightTemplateId) return leftTemplateId - rightTemplateId
    if (right.size !== left.size) return right.size - left.size
    if (left.colorId !== right.colorId) return left.colorId - right.colorId
    return left.id - right.id
  })
)

const getRemainingNeighborCandidates = (
  placement: BlockPlacement,
  placementGrid: (number | null)[][],
  remainingSlots: Map<string, Point>
): Point[] => {
  const candidates = new Map<string, Point>()
  const height = placementGrid.length
  const width = placementGrid[0]?.length ?? 0

  for (const cell of placement.cells) {
    for (const direction of DIRECTIONS) {
      const point = { x: cell.x + direction.x, y: cell.y + direction.y }
      if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) continue
      const key = pointKey(point)
      if (!remainingSlots.has(key)) continue
      candidates.set(key, point)
    }
  }

  return Array.from(candidates.values())
}

const getPreferredRemainingSlots = (
  spec: BlockSpec,
  remainingSlots: Map<string, Point>,
  templateIds: number[][] | null
): Point[] => (
  Array.from(remainingSlots.values()).filter((point) => isPointInPreferredTemplate(point, spec, templateIds))
)

const getPrimaryRemainingSlots = (
  spec: BlockSpec,
  remainingSlots: Map<string, Point>,
  templateIds: number[][] | null
): Point[] => {
  const primaryTemplateId = getSpecPrimaryTemplateId(spec)
  if (!templateIds || primaryTemplateId === null) {
    return getPreferredRemainingSlots(spec, remainingSlots, templateIds)
  }
  return Array.from(remainingSlots.values()).filter((point) => (
    templateIds[point.y]?.[point.x] === primaryTemplateId
  ))
}

const chooseNearestRemainingSlot = (
  origin: Point,
  remainingSlots: Map<string, Point>,
  spec: BlockSpec,
  templateIds: number[][] | null,
  sourceGrid: number[][]
): Point | null => {
  let bestPoint: Point | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const point of remainingSlots.values()) {
    const templatePenalty = isPointInPreferredTemplate(point, spec, templateIds) ? 0 : 1000
    const originalSameColorPenalty = isOriginalSameColorSlot(sourceGrid, point, spec.colorId) ? 900 : 0
    const score = templatePenalty + originalSameColorPenalty + getDistanceSquared(origin, point) + Math.random()
    if (score < bestScore) {
      bestScore = score
      bestPoint = point
    }
  }

  return bestPoint
}

const chooseSequentialCandidate = (
  candidates: Point[],
  placementGrid: (number | null)[][],
  placements: BlockPlacement[],
  blockIndex: number,
  templateIds: number[][] | null,
  sourceGrid: number[][]
): Point => {
  let selected = candidates[0]
  let bestScore = Number.NEGATIVE_INFINITY

  for (const candidate of candidates) {
    const { ownNeighborCount, sameColorOtherBlockCount } = countNeighboringCells(
      candidate,
      placementGrid,
      placements,
      blockIndex
    )
    const seed = placements[blockIndex].cells[0]
    const spec = placements[blockIndex].spec
    const currentBounds = getCellsBounds(placements[blockIndex].cells)
    const expandedBounds = getExpandedBounds(currentBounds, candidate)
    const expandedWidth = expandedBounds.maxX - expandedBounds.minX + 1
    const expandedHeight = expandedBounds.maxY - expandedBounds.minY + 1
    const expandedArea = getBoundsArea(expandedBounds)
    const nextSize = placements[blockIndex].cells.length + 1
    const emptyRectSpace = expandedArea - nextSize
    const aspectPenalty = Math.abs(expandedWidth - expandedHeight)
    const orthogonalNeighborCount = countOrthogonalBlockNeighbors(candidate, placementGrid, blockIndex)
    const squarePackingScore = getSquarePackingScore(candidate, placementGrid, blockIndex)
    const distanceFromSeed = getDistanceSquared(candidate, seed)
    const straightRunPenalty = getStraightRunPenalty(candidate, placementGrid, blockIndex)
    const templateScore = isPointInPreferredTemplate(candidate, spec, templateIds) ? 90 : -160
    const originalSameColorPenalty = isOriginalSameColorSlot(sourceGrid, candidate, spec.colorId) ? 260 : 0
    const score = (
      templateScore +
      (orthogonalNeighborCount * 110) +
      (Math.max(0, ownNeighborCount - orthogonalNeighborCount) * 18) +
      (squarePackingScore * 150) -
      (emptyRectSpace * 28) -
      (aspectPenalty * 24) -
      (straightRunPenalty * 12) -
      (sameColorOtherBlockCount * 500) -
      originalSameColorPenalty -
      (distanceFromSeed * 0.2) +
      Math.random()
    )

    if (score > bestScore) {
      bestScore = score
      selected = candidate
    }
  }

  return selected
}

const collectGridColorComponents = (grid: number[][], slots: Point[]): GridColorComponent[] => {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const slotKeys = new Set(slots.map(pointKey))
  const visited = Array.from({ length: height }, () => Array(width).fill(false))
  const components: GridColorComponent[] = []

  for (const slot of slots) {
    if (visited[slot.y][slot.x]) continue
    const colorId = grid[slot.y][slot.x]
    if (colorId < 0) continue

    const cells: Point[] = []
    const queue: Point[] = [slot]
    visited[slot.y][slot.x] = true

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      cells.push(current)

      for (const direction of DIRECTIONS) {
        const next = { x: current.x + direction.x, y: current.y + direction.y }
        if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) continue
        if (!slotKeys.has(pointKey(next))) continue
        if (visited[next.y][next.x] || grid[next.y][next.x] !== colorId) continue
        visited[next.y][next.x] = true
        queue.push(next)
      }
    }

    components.push({ colorId, cells })
  }

  return components
}

const getMaxTemplateOverflowRatio = (
  grid: number[][],
  slots: Point[],
  templateIds: number[][]
): number => {
  const components = collectGridColorComponents(grid, slots)
  if (components.length === 0) return 0

  return Math.max(...components.map((component) => {
    const templateCounts = new Map<number, number>()
    for (const cell of component.cells) {
      const templateId = templateIds[cell.y]?.[cell.x] ?? -1
      templateCounts.set(templateId, (templateCounts.get(templateId) ?? 0) + 1)
    }
    const dominantCount = Math.max(...templateCounts.values())
    return (component.cells.length - dominantCount) / component.cells.length
  }))
}

const satisfiesTemplateOverflow = (
  grid: number[][],
  slots: Point[],
  templateIds: number[][] | null,
  overflowRatio: number
): boolean => {
  if (!templateIds || overflowRatio >= 1) return true
  return getMaxTemplateOverflowRatio(grid, slots, templateIds) <= overflowRatio
}

const getGridValueAfterSwap = (
  grid: number[][],
  point: Point,
  left: Point,
  right: Point
): number => {
  if (point.x === left.x && point.y === left.y) return grid[right.y][right.x]
  if (point.x === right.x && point.y === right.y) return grid[left.y][left.x]
  return grid[point.y][point.x]
}

const countColorNeighborsAfterSwap = (
  grid: number[][],
  point: Point,
  colorId: number,
  left: Point,
  right: Point
): number => {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  let count = 0

  for (const direction of DIRECTIONS) {
    const next = { x: point.x + direction.x, y: point.y + direction.y }
    if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) continue
    if (getGridValueAfterSwap(grid, next, left, right) === colorId) count += 1
  }

  return count
}

const buildComponentSizeByCell = (components: GridColorComponent[]): Map<string, number> => {
  const componentSizeByCell = new Map<string, number>()
  for (const component of components) {
    for (const cell of component.cells) {
      componentSizeByCell.set(pointKey(cell), component.cells.length)
    }
  }
  return componentSizeByCell
}

const findSingletonAbsorbingSwap = (
  grid: number[][],
  slots: Point[],
  singleton: Point,
  componentSizeByCell: Map<string, number>
): Point | null => {
  const singletonColor = grid[singleton.y][singleton.x]
  let bestPoint: Point | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidate of slots) {
    const candidateColor = grid[candidate.y][candidate.x]
    if (candidateColor < 0 || candidateColor === singletonColor) continue
    if ((componentSizeByCell.get(pointKey(candidate)) ?? 0) <= 2) continue

    const singletonColorNeighbors = countColorNeighborsAfterSwap(
      grid,
      candidate,
      singletonColor,
      singleton,
      candidate
    )
    if (singletonColorNeighbors <= 0) continue

    const candidateColorNeighbors = countColorNeighborsAfterSwap(
      grid,
      singleton,
      candidateColor,
      singleton,
      candidate
    )
    if (candidateColorNeighbors <= 0) continue

    const score = getDistanceSquared(singleton, candidate) - (singletonColorNeighbors * 10) - candidateColorNeighbors
    if (score < bestScore) {
      bestScore = score
      bestPoint = candidate
    }
  }

  return bestPoint
}

const absorbSingletonColorIslands = (
  grid: number[][],
  slots: Point[],
  templateIds: number[][] | null = null,
  overflowRatio = 1
): number[][] => {
  const result = grid.map((row) => [...row])

  for (let pass = 0; pass < 3; pass += 1) {
    const components = collectGridColorComponents(result, slots)
    const singletons = components.filter((component) => component.cells.length === 1)
    if (singletons.length === 0) break

    let changed = false

    for (const component of singletons) {
      const singleton = component.cells[0]
      const currentComponents = collectGridColorComponents(result, slots)
      const currentComponent = currentComponents.find((candidate) => (
        candidate.cells.some((cell) => cell.x === singleton.x && cell.y === singleton.y)
      ))
      if (!currentComponent || currentComponent.cells.length !== 1) continue

      const componentSizeByCell = buildComponentSizeByCell(currentComponents)
      const swapPoint = findSingletonAbsorbingSwap(result, slots, singleton, componentSizeByCell)
      if (!swapPoint) continue

      const temp = result[singleton.y][singleton.x]
      result[singleton.y][singleton.x] = result[swapPoint.y][swapPoint.x]
      result[swapPoint.y][swapPoint.x] = temp
      if (!satisfiesTemplateOverflow(result, slots, templateIds, overflowRatio)) {
        result[swapPoint.y][swapPoint.x] = result[singleton.y][singleton.x]
        result[singleton.y][singleton.x] = temp
        continue
      }
      changed = true
    }

    if (!changed) break
  }

  return result
}

const getOriginalColorMatchDeltaAfterSwap = (
  sourceGrid: number[][],
  grid: number[][],
  left: Point,
  right: Point
): number => {
  const before = (
    (sourceGrid[left.y]?.[left.x] === grid[left.y]?.[left.x] ? 1 : 0) +
    (sourceGrid[right.y]?.[right.x] === grid[right.y]?.[right.x] ? 1 : 0)
  )
  const after = (
    (sourceGrid[left.y]?.[left.x] === grid[right.y]?.[right.x] ? 1 : 0) +
    (sourceGrid[right.y]?.[right.x] === grid[left.y]?.[left.x] ? 1 : 0)
  )
  return after - before
}

const findOriginalColorAvoidingSwap = (
  sourceGrid: number[][],
  grid: number[][],
  slots: Point[],
  matchedPoint: Point,
  componentSizeByCell: Map<string, number>
): Point | null => {
  const matchedColor = grid[matchedPoint.y][matchedPoint.x]
  let bestPoint: Point | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidate of slots) {
    const candidateColor = grid[candidate.y][candidate.x]
    if (candidateColor < 0 || candidateColor === matchedColor) continue
    if ((componentSizeByCell.get(pointKey(candidate)) ?? 0) <= 2) continue

    const delta = getOriginalColorMatchDeltaAfterSwap(sourceGrid, grid, matchedPoint, candidate)
    if (delta >= 0) continue

    const matchedColorNeighbors = countColorNeighborsAfterSwap(
      grid,
      candidate,
      matchedColor,
      matchedPoint,
      candidate
    )
    const candidateColorNeighbors = countColorNeighborsAfterSwap(
      grid,
      matchedPoint,
      candidateColor,
      matchedPoint,
      candidate
    )
    if (matchedColorNeighbors <= 0 || candidateColorNeighbors <= 0) continue

    const score = getDistanceSquared(matchedPoint, candidate) + (delta * 60)
    if (score < bestScore) {
      bestScore = score
      bestPoint = candidate
    }
  }

  return bestPoint
}

const reduceOriginalSameColorMatches = (
  sourceGrid: number[][],
  grid: number[][],
  slots: Point[],
  templateIds: number[][] | null = null,
  overflowRatio = 1
): number[][] => {
  const result = grid.map((row) => [...row])

  for (let pass = 0; pass < 2; pass += 1) {
    const components = collectGridColorComponents(result, slots)
    const componentSizeByCell = buildComponentSizeByCell(components)
    const matchedSlots = slots.filter((slot) => (
      sourceGrid[slot.y]?.[slot.x] >= 0 &&
      sourceGrid[slot.y]?.[slot.x] === result[slot.y]?.[slot.x] &&
      (componentSizeByCell.get(pointKey(slot)) ?? 0) > 2
    ))
    if (matchedSlots.length === 0) break

    let changed = false
    for (const matchedPoint of matchedSlots) {
      if (sourceGrid[matchedPoint.y]?.[matchedPoint.x] !== result[matchedPoint.y]?.[matchedPoint.x]) continue
      const currentComponents = collectGridColorComponents(result, slots)
      const currentComponentSizeByCell = buildComponentSizeByCell(currentComponents)
      if ((currentComponentSizeByCell.get(pointKey(matchedPoint)) ?? 0) <= 2) continue

      const swapPoint = findOriginalColorAvoidingSwap(
        sourceGrid,
        result,
        slots,
        matchedPoint,
        currentComponentSizeByCell
      )
      if (!swapPoint) continue

      const temp = result[matchedPoint.y][matchedPoint.x]
      result[matchedPoint.y][matchedPoint.x] = result[swapPoint.y][swapPoint.x]
      result[swapPoint.y][swapPoint.x] = temp
      if (!satisfiesTemplateOverflow(result, slots, templateIds, overflowRatio)) {
        result[swapPoint.y][swapPoint.x] = result[matchedPoint.y][matchedPoint.x]
        result[matchedPoint.y][matchedPoint.x] = temp
        continue
      }
      changed = true
    }

    if (!changed) break
  }

  return result
}

const buildSequentialBlockGrid = (
  sourceGrid: number[][],
  slots: Point[],
  specs: BlockSpec[],
  templateIds: number[][] | null,
  overflowRatio = 1
): number[][] => {
  const height = sourceGrid.length
  const width = sourceGrid[0]?.length ?? 0
  const placementGrid = createPlacementGrid(height, width)
  const remainingSlots = new Map(slots.map((slot) => [pointKey(slot), slot]))
  const placements: BlockPlacement[] = []

  for (const spec of arrangeSpecsForTemplateFill(specs)) {
    const blockIndex = placements.length
    const preferredSeedSlots = overflowRatio >= 1
      ? getPreferredRemainingSlots(spec, remainingSlots, templateIds)
      : getPrimaryRemainingSlots(spec, remainingSlots, templateIds)
    const seedSlots = preferredSeedSlots.length > 0 ? preferredSeedSlots : Array.from(remainingSlots.values())
    const seed = chooseSeed(spec, seedSlots, new Set(), placements, templateIds, sourceGrid)
    if (!seed) break

    remainingSlots.delete(pointKey(seed))
    placementGrid[seed.y][seed.x] = blockIndex
    placements.push({ spec, cells: [seed] })

    while (placements[blockIndex].cells.length < spec.size && remainingSlots.size > 0) {
      const candidates = getRemainingNeighborCandidates(placements[blockIndex], placementGrid, remainingSlots)
      const preferredRemainingSlots = getPreferredRemainingSlots(spec, remainingSlots, templateIds)
      const preferredCandidates = candidates.filter((candidate) => (
        isPointInPreferredTemplate(candidate, spec, templateIds) &&
        isPointWithinSpecOverflowLimit(
          spec,
          placements[blockIndex].cells,
          candidate,
          templateIds,
          overflowRatio
        )
      ))
      const candidatePool = overflowRatio >= 1
        ? (preferredCandidates.length > 0 ? preferredCandidates : candidates)
        : preferredCandidates
      const nearestRemainingSlots = overflowRatio >= 1
        ? (preferredRemainingSlots.length > 0
          ? new Map(preferredRemainingSlots.map((point) => [pointKey(point), point]))
          : remainingSlots)
        : new Map(preferredRemainingSlots
          .filter((point) => isPointWithinSpecOverflowLimit(
            spec,
            placements[blockIndex].cells,
            point,
            templateIds,
            overflowRatio
          ))
          .map((point) => [pointKey(point), point]))
      const selected = candidatePool.length > 0
        ? chooseSequentialCandidate(candidatePool, placementGrid, placements, blockIndex, templateIds, sourceGrid)
        : chooseNearestRemainingSlot(
          seed,
          nearestRemainingSlots,
          spec,
          templateIds,
          sourceGrid
        )
      if (!selected) break

      remainingSlots.delete(pointKey(selected))
      placementGrid[selected.y][selected.x] = blockIndex
      placements[blockIndex].cells.push(selected)
    }
  }

  const grid = buildGridFromPlacements(sourceGrid, placements)
  const unplacedColors = specs.flatMap((spec) => {
    const placed = placements.find((placement) => placement.spec.id === spec.id)?.cells.length ?? 0
    return Array(Math.max(0, spec.size - placed)).fill(spec.colorId)
  })

  let index = 0
  for (const point of remainingSlots.values()) {
    const colorId = unplacedColors[index]
    if (typeof colorId !== 'number') break
    grid[point.y][point.x] = colorId
    index += 1
  }

  const blockyGrid = absorbSingletonColorIslands(grid, slots, templateIds, overflowRatio)
  const displacedGrid = reduceOriginalSameColorMatches(sourceGrid, blockyGrid, slots, templateIds, overflowRatio)
  return absorbSingletonColorIslands(displacedGrid, slots, templateIds, overflowRatio)
}

const generateTargetBlockGrid = (
  sourceGrid: number[][],
  slots: Point[],
  specs: BlockSpec[],
  templateIds: number[][] | null,
  overflowRatio = 1
): number[][] => {
  return buildSequentialBlockGrid(sourceGrid, slots, specs, templateIds, overflowRatio)
}

export const estimateLevelRestoreSteps = (
  target: GridData,
  current: GridData,
  temporarySlotCount: number
): LevelStepEstimate => {
  const normalizedTemporarySlotCount = Math.max(0, Math.floor(temporarySlotCount))
  if (target.width !== current.width || target.height !== current.height) {
    return createInvalidStepEstimate('目标网格与当前网格尺寸不一致', normalizedTemporarySlotCount)
  }

  const width = target.width
  const height = target.height
  if (width <= 0 || height <= 0) {
    return createInvalidStepEstimate('网格尺寸无效', normalizedTemporarySlotCount)
  }

  const board = cloneBoard(current.colorIndices)
  const targetGrid = cloneBoard(target.colorIndices)
  const imageSpareSlotCount = countBoardEmptySlots(board)
  const currentColorCounts = new Map<number, number>()
  const targetColorCounts = new Map<number, number>()

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const currentValue = board[y]?.[x] ?? EXTERNAL_BACKGROUND_INDEX
      const targetValue = targetGrid[y]?.[x] ?? EXTERNAL_BACKGROUND_INDEX

      if (targetValue === EXTERNAL_BACKGROUND_INDEX && currentValue !== EXTERNAL_BACKGROUND_INDEX) {
        return createInvalidStepEstimate(
          '当前网格存在目标图外像素，无法估算',
          normalizedTemporarySlotCount,
          imageSpareSlotCount
        )
      }

      if (targetValue !== EXTERNAL_BACKGROUND_INDEX && currentValue === EXTERNAL_BACKGROUND_INDEX) {
        return createInvalidStepEstimate(
          '当前网格的可玩区域与目标图不一致',
          normalizedTemporarySlotCount,
          imageSpareSlotCount
        )
      }

      if (currentValue >= 0) {
        currentColorCounts.set(currentValue, (currentColorCounts.get(currentValue) ?? 0) + 1)
      }
      if (targetValue >= 0) {
        targetColorCounts.set(targetValue, (targetColorCounts.get(targetValue) ?? 0) + 1)
      }
    }
  }

  const occupiedSlotCount = Array.from(targetColorCounts.values()).reduce((sum, count) => sum + count, 0)
  const fixedSlotCount = countBoardFixedSlots(board, targetGrid)
  const misplacedSlotCount = occupiedSlotCount - fixedSlotCount
  const allColors = new Set<number>([
    ...currentColorCounts.keys(),
    ...targetColorCounts.keys()
  ])

  for (const colorId of allColors) {
    if ((currentColorCounts.get(colorId) ?? 0) !== (targetColorCounts.get(colorId) ?? 0)) {
      return createInvalidStepEstimate(
        `颜色 ${colorId} 的像素数量不一致`,
        normalizedTemporarySlotCount,
        imageSpareSlotCount,
        occupiedSlotCount,
        fixedSlotCount,
        misplacedSlotCount
      )
    }
  }

  if (misplacedSlotCount === 0) {
    return {
      valid: true,
      reason: null,
      occupiedSlotCount,
      fixedSlotCount,
      misplacedSlotCount: 0,
      imageSpareSlotCount,
      temporarySlotCount: normalizedTemporarySlotCount,
      totalSpareSlotCount: imageSpareSlotCount + normalizedTemporarySlotCount,
      estimatedStepCount: 0,
      directPlacementStepCount: 0,
      trayTransferStepCount: 0,
      trayUsagePeak: 0,
      remainingMismatchCount: 0,
      ruleAssumptionVersion: RULE_ASSUMPTION_VERSION
    }
  }

  let state: SimulationState = {
    board,
    tray: Array(normalizedTemporarySlotCount).fill(EMPTY_SLOT_INDEX)
  }
  const seenSignatures = new Map<string, number>([[buildStateSignature(state), 1]])
  let estimatedStepCount = 0
  let directPlacementStepCount = 0
  let trayTransferStepCount = 0
  let trayUsagePeak = 0
  const maxSteps = Math.max(occupiedSlotCount * 8, normalizedTemporarySlotCount * 10, 200)

  while (estimatedStepCount < maxSteps) {
    const remainingMismatchCount = countGlobalMismatch(state.board, targetGrid, state.tray)
    if (remainingMismatchCount === 0) {
      return {
        valid: true,
        reason: null,
        occupiedSlotCount,
        fixedSlotCount,
        misplacedSlotCount,
        imageSpareSlotCount,
        temporarySlotCount: normalizedTemporarySlotCount,
        totalSpareSlotCount: imageSpareSlotCount + normalizedTemporarySlotCount,
        estimatedStepCount,
        directPlacementStepCount,
        trayTransferStepCount,
        trayUsagePeak,
        remainingMismatchCount: 0,
        ruleAssumptionVersion: RULE_ASSUMPTION_VERSION
      }
    }

    const currentSignature = buildStateSignature(state)
    const sources: ColorComponent[] = [
      ...collectBoardColorComponents(state.board),
      ...collectTrayColorComponents(state.tray)
    ]
    const boardEmptyComponents = collectBoardEmptyComponents(state.board)
    const trayEmptyComponents = collectTrayEmptyComponents(state.tray)

    let bestAction: SimulatedAction | null = null
    let bestScore = Number.NEGATIVE_INFINITY

    for (const source of sources) {
      const destinations: EmptyComponent[] = [
        ...boardEmptyComponents,
        ...(source.area === 'board' ? trayEmptyComponents : [])
      ]

      for (const destination of destinations) {
        const simulated = simulateAction(state, targetGrid, source, destination)
        if (!simulated) continue
        if (simulated.signature === currentSignature) continue

        const seenCount = seenSignatures.get(simulated.signature) ?? 0
        const adjustedScore = simulated.score - (seenCount * 5000)
        if (adjustedScore > bestScore) {
          bestScore = adjustedScore
          bestAction = simulated
        }
      }
    }

    if (!bestAction) {
      return createInvalidStepEstimate(
        '当前规则下没有可执行的下一步操作',
        normalizedTemporarySlotCount,
        imageSpareSlotCount,
        occupiedSlotCount,
        fixedSlotCount,
        misplacedSlotCount
      )
    }

    state = bestAction.nextState
    estimatedStepCount += 1
    trayUsagePeak = Math.max(trayUsagePeak, countTrayOccupiedSlots(state.tray))
    if (bestAction.destinationArea === 'tray') {
      trayTransferStepCount += 1
    } else {
      directPlacementStepCount += 1
    }

    const nextSignature = buildStateSignature(state)
    seenSignatures.set(nextSignature, (seenSignatures.get(nextSignature) ?? 0) + 1)
  }

  return createInvalidStepEstimate(
    '模拟步数超过上限，当前启发式策略未能完成复原',
    normalizedTemporarySlotCount,
    imageSpareSlotCount,
    occupiedSlotCount,
    fixedSlotCount,
    misplacedSlotCount
  )
}

export const generateSortedGridByTargetBlockCount = (
  source: GridData,
  targetBlockInput: number,
  options: LevelGridSortOptions = {}
): GridData => {
  const base = cloneGridData(source)
  if (base.width <= 0 || base.height <= 0) return base

  const hasExternalBackgroundMarker = base.colorIndices.some((row) =>
    row.some((value) => value === EXTERNAL_BACKGROUND_INDEX)
  )
  const externalMask = options.inferExternalBackground === false
    ? null
    : getExternalBackgroundMask(base.colorIndices, {
      backgroundIndex: options.backgroundIndex
    })
  const sortableMask = externalMask
    ? externalMask.map((row) => row.map((isExternal) => !isExternal))
    : Array.from({ length: base.height }, () => Array(base.width).fill(true))
  const slots = collectBeanSlots(base.colorIndices, sortableMask)
  if (slots.length <= 1) return base

  const colorCounts = countSlotColors(base.colorIndices, slots)
  const targetBlockCount = normalizeTargetBlockCount(targetBlockInput, colorCounts.size, slots.length)
  if (targetBlockCount <= 0) return base

  const overflowConstraint = normalizeOverflowConstraint(options.overflowConstraint)
  const overflowRatio = getOverflowRatio(overflowConstraint)
  const sourceTemplateInfo = collectSourceTemplates(base.colorIndices, slots)
  const blockSpecs = assignBlockSpecsToSourceTemplates(
    buildBlockSpecs(colorCounts, targetBlockCount),
    sourceTemplateInfo.templates,
    overflowConstraint
  )
  const sortedIndices = generateTargetBlockGrid(
    base.colorIndices,
    slots,
    blockSpecs,
    sourceTemplateInfo.templateIds,
    overflowRatio
  )
  const hasExplicitBackgroundIndex = options.backgroundIndex !== null && options.backgroundIndex !== undefined
  if (options.normalizeExternalBackground && (hasExternalBackgroundMarker || hasExplicitBackgroundIndex) && externalMask) {
    for (let y = 0; y < externalMask.length; y += 1) {
      for (let x = 0; x < (externalMask[y]?.length ?? 0); x += 1) {
        if (externalMask[y][x]) {
          sortedIndices[y][x] = EXTERNAL_BACKGROUND_INDEX
        }
      }
    }
  }

  return {
    ...base,
    colorIndices: sortedIndices
  }
}

export const generateSortedGridByDifficulty = generateSortedGridByTargetBlockCount

// ============================================================================
// 结构感知受控生成（Structure-aware controlled generation）
// 详见 docs/关卡打乱算法改造需求-v1.md。旧路径保持原样，下面全部为新增代码。
// ============================================================================

export type SizeProfileName = 'loose' | 'standard' | 'tight'
export type SizeDistribution = Array<{ size: number; weight: number }>

export const SIZE_PROFILES: Record<SizeProfileName, SizeDistribution> = {
  // 松：大块爽感优先，操作数最少
  loose: [
    { size: 4, weight: 0.08 }, { size: 6, weight: 0.14 }, { size: 8, weight: 0.18 },
    { size: 10, weight: 0.16 }, { size: 12, weight: 0.14 }, { size: 16, weight: 0.14 },
    { size: 24, weight: 0.10 }, { size: 36, weight: 0.06 }
  ],
  // 标准（默认）
  standard: [
    { size: 2, weight: 0.06 }, { size: 3, weight: 0.12 }, { size: 4, weight: 0.14 },
    { size: 5, weight: 0.14 }, { size: 6, weight: 0.12 }, { size: 7, weight: 0.10 },
    { size: 8, weight: 0.08 }, { size: 10, weight: 0.08 }, { size: 12, weight: 0.06 },
    { size: 16, weight: 0.06 }, { size: 24, weight: 0.03 }, { size: 36, weight: 0.01 }
  ],
  // 紧：决策密度高，操作数最多，仍不许 1 颗
  tight: [
    { size: 2, weight: 0.10 }, { size: 3, weight: 0.18 }, { size: 4, weight: 0.20 },
    { size: 5, weight: 0.16 }, { size: 6, weight: 0.12 }, { size: 8, weight: 0.10 },
    { size: 10, weight: 0.08 }, { size: 12, weight: 0.06 }
  ]
}

export interface StructureAwareSortOptions {
  sizeProfile?: SizeProfileName | SizeDistribution
  structureAffinity?: number       // α ∈ [0,1]，默认 0.8
  smallBlockQuota?: number         // 1-2 颗块占比上限，默认 0.10
  seed?: number                    // 随机种子，缺省 Date.now()，必须可复现
  maxRetries?: number              // 拒绝采样重试次数，默认 5
  normalizeExternalBackground?: boolean
  backgroundIndex?: number | null
  inferExternalBackground?: boolean
}

export interface SortQualityMetrics {
  structureRetention: number       // H1
  smallBlockRatio: number          // H2
  greedyTailRun: number            // H3
  fixedCellRatio: number           // H4
  pickupCount: number              // 8 邻域连通块总数 = 预估拾取次数
  meanBlockSize: number
  sizeHistogram: Record<string, number>  // '1','2','3-4','5-8','9-16','17+'
}

export interface StructureAwareSortResult {
  grid: GridData
  metrics: SortQualityMetrics
  attempts: number
  passed: boolean
  usedSeed: number
}

// 硬约束阈值（文档 4.4），默认值，供拒绝采样与报告复用
const SA_DEFAULT_STRUCTURE_AFFINITY = 0.85
const SA_DEFAULT_SMALL_BLOCK_QUOTA = 0.10
const SA_DEFAULT_MAX_RETRIES = 8
const SA_H1_STRUCTURE_RETENTION = 0.55
const SA_H3_GREEDY_TAIL_RUN = 8
// H4 语义重定位（同色同格=已完成，H4=开局白送进度）：上限约束而非"尽量压低"。
// hard 0.50（error），warning 边界 0.45；无下限。
const SA_H4_FIXED_CELL_RATIO_HARD = 0.50
export const SA_H4_FIXED_CELL_RATIO_WARNING = 0.45

// mulberry32 PRNG —— 同一 seed 产出确定序列
const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0
  return (): number => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const resolveRng = (seed?: number): { rng: () => number; usedSeed: number } => {
  const usedSeed = typeof seed === 'number' && Number.isFinite(seed) ? (seed >>> 0) : (Date.now() >>> 0)
  return { rng: mulberry32(usedSeed), usedSeed }
}

// Fisher–Yates，注入 rng（不动原 shuffle，legacy 仍用 Math.random）
const shuffleWith = <T,>(source: T[], rng: () => number): T[] => {
  const result = [...source]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }
  return result
}

const resolveSizeDistribution = (profile: SizeProfileName | SizeDistribution | undefined): SizeDistribution => {
  if (Array.isArray(profile)) return profile
  if (profile && SIZE_PROFILES[profile]) return SIZE_PROFILES[profile]
  return SIZE_PROFILES.standard
}

// 按权重轮盘采样一个目标块尺寸（分布中无 size=1，文档 4.3）
const sampleSizeFromProfile = (rng: () => number, dist: SizeDistribution): number => {
  const valid = dist.filter((entry) => entry.size >= 2 && entry.weight > 0)
  if (valid.length === 0) return 2
  const totalWeight = valid.reduce((sum, entry) => sum + entry.weight, 0)
  if (totalWeight <= 0) return valid[0].size
  let cursor = rng() * totalWeight
  for (const entry of valid) {
    cursor -= entry.weight
    if (cursor <= 0) return entry.size
  }
  return valid[valid.length - 1].size
}

// 结构感知生成专用的连通块收集（8 邻域，独立于现有 collectGridColorComponents）
interface SAComponent {
  colorId: number
  cells: Point[]
}

const collectComponents8 = (indices: number[][], slotSet: Set<number>): SAComponent[] => {
  const height = indices.length
  const width = height > 0 ? indices[0].length : 0
  const visited = Array.from({ length: height }, () => Array(width).fill(false))
  const components: SAComponent[] = []
  const inSlot = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false
    const value = indices[y][x]
    if (value < 0) return false
    return slotSet.has(y * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (visited[y][x]) continue
      const colorId = indices[y][x]
      if (!inSlot(x, y)) {
        visited[y][x] = true
        continue
      }
      const cells: Point[] = []
      const queue: Point[] = [{ x, y }]
      visited[y][x] = true
      while (queue.length > 0) {
        const current = queue.shift()
        if (!current) continue
        cells.push(current)
        for (const direction of DIRECTIONS) {
          const nx = current.x + direction.x
          const ny = current.y + direction.y
          if (!inSlot(nx, ny) || visited[ny][nx]) continue
          if (indices[ny][nx] !== colorId) continue
          visited[ny][nx] = true
          queue.push({ x: nx, y: ny })
        }
      }
      components.push({ colorId, cells })
    }
  }
  return components
}

const buildSlotSetFromMask = (grid: number[][], height: number, width: number, sortableMask: boolean[][]): Set<number> => {
  const slotSet = new Set<number>()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // 与 legacy collectBeanSlots 同口径：mask 可排序且必须是豆子格（非背景/空位）
      if (!sortableMask[y]?.[x]) continue
      if ((grid[y]?.[x] ?? -1) < 0) continue
      slotSet.add(y * width + x)
    }
  }
  return slotSet
}

// H1 结构保留度（文档 5.1）：4×4 分块颜色直方图重叠均值
export const computeStructureRetention = (out: number[][], target: number[][]): number => {
  const height = target.length
  const width = height > 0 ? target[0].length : 0
  if (height === 0 || width === 0) return 0
  const overlapSum: number[] = []
  for (let by = 0; by < height; by += 4) {
    for (let bx = 0; bx < width; bx += 4) {
      const ct: Record<number, number> = {}
      const ci: Record<number, number> = {}
      let ctTotal = 0
      for (let y = by; y < Math.min(by + 4, height); y += 1) {
        for (let x = bx; x < Math.min(bx + 4, width); x += 1) {
          const tv = target[y][x]
          if (tv < 0) continue
          ct[tv] = (ct[tv] ?? 0) + 1
          ctTotal += 1
          const ov = out[y]?.[x]
          if (typeof ov === 'number' && ov >= 0) ci[ov] = (ci[ov] ?? 0) + 1
        }
      }
      if (ctTotal <= 0) continue
      let overlap = 0
      const colorKeys = new Set<number>([...Object.keys(ct).map(Number), ...Object.keys(ci).map(Number)])
      for (const c of colorKeys) {
        overlap += Math.min(ct[c] ?? 0, ci[c] ?? 0)
      }
      overlapSum.push(overlap / ctTotal)
    }
  }
  if (overlapSum.length === 0) return 0
  return overlapSum.reduce((a, b) => a + b, 0) / overlapSum.length
}

// H3 贪心尾串（文档 5.2）：块尺寸降序后尾部连续 size≤2 的块数
export const computeGreedyTailRun = (indices: number[][], slotSet: Set<number>): number => {
  const components = collectComponents8(indices, slotSet)
  if (components.length === 0) return 0
  const sizes = components.map((c) => c.cells.length).sort((a, b) => b - a)
  let run = 0
  for (let i = sizes.length - 1; i >= 0; i -= 1) {
    if (sizes[i] <= 2) run += 1
    else break
  }
  return run
}

// H4 落原位格子占比（文档 5.3）
export const computeFixedCellRatio = (out: number[][], target: number[][]): number => {
  const height = target.length
  const width = height > 0 ? target[0].length : 0
  let targetCells = 0
  let fixedCells = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tv = target[y][x]
      if (tv < 0) continue
      targetCells += 1
      if (out[y]?.[x] === tv) fixedCells += 1
    }
  }
  return targetCells > 0 ? fixedCells / targetCells : 0
}

const bucketSize = (size: number): string => {
  if (size <= 1) return '1'
  if (size === 2) return '2'
  if (size <= 4) return '3-4'
  if (size <= 8) return '5-8'
  if (size <= 16) return '9-16'
  return '17+'
}

// 汇总指标（H1/H2/H3/H4 + pickup/mean/histogram），供生成器与质量报告复用
// 修正二（同色同格=已完成语义）：H1 结构保留与 H4 落原位在全格上度量；
// H2/H3/pickup/meanBlockSize/sizeHistogram 只在「非锁定格」（out[p]!=target[p]）上算，
// 因为落原位格开局即完成、玩家永不拾取，拾取相关指标必须排除它们，否则操作数带宽失真。
export const computeSortQualityMetrics = (
  out: number[][],
  target: number[][],
  slotSet: Set<number>
): SortQualityMetrics => {
  const fixedCellRatio = computeFixedCellRatio(out, target)
  // 锁定格 = out[p]==target[p]，玩家不拾取
  const playSlotSet = new Set<number>()
  for (const key of slotSet) {
    const x = key % (target[0]?.length ?? 0)
    const y = Math.floor(key / (target[0]?.length ?? 0))
    if (out[y]?.[x] !== target[y]?.[x]) playSlotSet.add(key)
  }
  const components = collectComponents8(out, playSlotSet)
  const sizes = components.map((c) => c.cells.length)
  const totalBlocks = sizes.length
  const smallBlocks = sizes.filter((s) => s <= 2).length
  const totalBeads = playSlotSet.size
  const sizeHistogram: Record<string, number> = { '1': 0, '2': 0, '3-4': 0, '5-8': 0, '9-16': 0, '17+': 0 }
  for (const s of sizes) {
    const bucket = bucketSize(s)
    sizeHistogram[bucket] = (sizeHistogram[bucket] ?? 0) + 1
  }
  const sortedDesc = [...sizes].sort((a, b) => b - a)
  let greedyTailRun = 0
  for (let i = sortedDesc.length - 1; i >= 0; i -= 1) {
    if (sortedDesc[i] <= 2) greedyTailRun += 1
    else break
  }
  return {
    structureRetention: computeStructureRetention(out, target),
    smallBlockRatio: totalBlocks > 0 ? smallBlocks / totalBlocks : 0,
    greedyTailRun,
    fixedCellRatio,
    pickupCount: totalBlocks,
    meanBlockSize: totalBlocks > 0 ? totalBeads / totalBlocks : 0,
    sizeHistogram
  }
}

// 统计 (cx,cy) 所在 4×4 块内各颜色占比（用于选色打分 local[c]，与 H1 度量同口径）
// 关键：用 4×4 块而非 5×5 窗口，让块颜色精确匹配区域直方图，H1 结构保留显著提升。
const computeBlockColorRatios = (grid: number[][], cx: number, cy: number): Map<number, number> => {
  const height = grid.length
  const width = height > 0 ? grid[0].length : 0
  const bx = Math.floor(cx / 4) * 4
  const by = Math.floor(cy / 4) * 4
  const counts = new Map<number, number>()
  let total = 0
  for (let y = by; y < Math.min(by + 4, height); y += 1) {
    for (let x = bx; x < Math.min(bx + 4, width); x += 1) {
      const v = grid[y][x]
      if (v < 0) continue
      counts.set(v, (counts.get(v) ?? 0) + 1)
      total += 1
    }
  }
  const ratios = new Map<number, number>()
  for (const [colorId, count] of counts) {
    ratios.set(colorId, total > 0 ? count / total : 0)
  }
  return ratios
}

// 统计 free 内某点的 8 邻居数（用于选种子：优先吃角落）
const countFreeNeighbors = (freeSet: Set<number>, x: number, y: number, width: number, height: number): number => {
  let count = 0
  for (const direction of DIRECTIONS) {
    const nx = x + direction.x
    const ny = y + direction.y
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
    if (freeSet.has(ny * width + nx)) count += 1
  }
  return count
}

// 区域生长（文档 4.2 ④）：BFS 优先吃 free 内出路少的格子，强原格位规避
// 设计意图：色块贴着自己在 target 中的同色区域生长（保证 H1 结构保留），
// 但整体偏移开原格位（压住 H4 落原位）。靠三档候选打分实现：
//   - target 同色且非原格位：最优先（结构亲和 + 已错位）
//   - target 不同色：次优（允许溢出到邻色区，收尾不可避免）
//   - 原格位（target==color）：最末（只在没得选时才落原位）
const ORIGINAL_CELL_PENALTY_STRONG = -3.0
const DIFFERENT_COLOR_PENALTY = -0.6

const growStructureAwareBlob = (
  seed: Point,
  want: number,
  color: number,
  target: number[][],
  freeSet: Set<number>,
  rng: () => number,
  width: number,
  height: number
): Point[] => {
  const blob: Point[] = [seed]
  const blobSet = new Set<number>([seed.y * width + seed.x])
  const candidateKeys = new Set<number>()
  const addCandidatesAround = (point: Point) => {
    for (const direction of DIRECTIONS) {
      const nx = point.x + direction.x
      const ny = point.y + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const key = ny * width + nx
      if (!freeSet.has(key) || blobSet.has(key) || candidateKeys.has(key)) continue
      candidateKeys.add(key)
    }
  }
  addCandidatesAround(seed)
  while (blob.length < want && candidateKeys.size > 0) {
    let bestKey = -1
    let bestScore = -Infinity
    for (const key of candidateKeys) {
      const cx = key % width
      const cy = Math.floor(key / width)
      const freeNeighbors = countFreeNeighbors(freeSet, cx, cy, width, height)
      // free 邻居越少越优先（防切碎 free）→ 取负，作为主项
      let colorScore: number
      const tv = target[cy][cx]
      if (tv === color) {
        colorScore = ORIGINAL_CELL_PENALTY_STRONG
      } else if (tv >= 0) {
        colorScore = DIFFERENT_COLOR_PENALTY
      } else {
        colorScore = DIFFERENT_COLOR_PENALTY
      }
      const jitter = rng() * 1e-3
      // 邻居项范围 [-8,0]，colorScore {-3, -0.6}：邻居主导，color 作平局打破与方向引导
      const score = -freeNeighbors + colorScore + jitter
      if (score > bestScore) {
        bestScore = score
        bestKey = key
      }
    }
    if (bestKey < 0) break
    candidateKeys.delete(bestKey)
    const px = bestKey % width
    const py = Math.floor(bestKey / width)
    blobSet.add(bestKey)
    blob.push({ x: px, y: py })
    addCandidatesAround({ x: px, y: py })
  }
  return blob
}

// 孤点吸收（迁移自 absorbSingletonColorIslands 思路）：把 size=1 块与邻近大块成员交换
// ≤3 轮，交换不得使 fixedCellRatio 上升（继承 H4 兜底）
const absorbSingletonsSA = (
  indices: number[][],
  target: number[][],
  slotSet: Set<number>,
  freeRng: () => number,
  width: number,
  height: number
): number [][] => {
  const result = indices.map((row) => [...row])
  const baselineFixed = computeFixedCellRatio(result, target)
  for (let round = 0; round < 3; round += 1) {
    const components = collectComponents8(result, slotSet)
    const singletons = components.filter((c) => c.cells.length === 1)
    if (singletons.length === 0) break
    let changed = false
    for (const singleton of singletons) {
      const cell = singleton.cells[0]
      const colorId = singleton.colorId
      // 在 8 邻域（含二环）内寻找一个不同色、所属块 size≥3 的格子做交换
      let swapTarget: Point | null = null
      const searchOrder = shuffleWith(
        Array.from({ length: 24 }, (_, i) => i),
        freeRng
      )
      for (const i of searchOrder) {
        const ring = i < 8 ? 1 : 2
        const idx = i < 8 ? i : i - 8
        const dy = ring * Math.floor(idx / 3) - ring
        const dx = ring * (idx % 3) - ring
        const nx = cell.x + dx
        const ny = cell.y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (!slotSet.has(ny * width + nx)) continue
        const other = result[ny][nx]
        if (other === colorId) continue
        // 检查 other 所在块尺寸 ≥3（避免制造新的孤点）
        const otherComp = components.find((c) => c.cells.some((p) => p.x === nx && p.y === ny))
        if (!otherComp || otherComp.cells.length < 3) continue
        swapTarget = { x: nx, y: ny }
        break
      }
      if (!swapTarget) continue
      // 模拟交换后 fixedCellRatio 不上升才执行
      const before = result[cell.y][cell.x]
      const otherVal = result[swapTarget.y][swapTarget.x]
      result[cell.y][cell.x] = otherVal
      result[swapTarget.y][swapTarget.x] = before
      const afterFixed = computeFixedCellRatio(result, target)
      if (afterFixed > baselineFixed + 1e-9) {
        // 回滚
        result[cell.y][cell.x] = before
        result[swapTarget.y][swapTarget.x] = otherVal
        continue
      }
      changed = true
    }
    if (!changed) break
  }
  return result
}

const isWithinBounds = (x: number, y: number, width: number, height: number): boolean => (
  x >= 0 && y >= 0 && x < width && y < height
)

// 单次结构感知生成（文档 4.2 主循环），不达标由上层拒绝采样
const generateStructureAwareOnce = (
  source: GridData,
  target: number[][],
  slotSet: Set<number>,
  options: Required<Pick<StructureAwareSortOptions, 'structureAffinity' | 'smallBlockQuota'>> &
    StructureAwareSortOptions,
  rng: () => number
): number[][] => {
  const { width, height } = source
  // 以 target 为底：slotSet 之外的格子（背景 -2 / 空位 -1 / 掩码排除的豆子）原样保留；
  // slotSet 内先清成 -1（未放置标记，选色 ban 逻辑依赖 out<0 表示未放置），主循环中全部覆写
  const out: number[][] = target.map((row) => [...row])
  // quota 严格守恒（仅统计 slotSet 内豆子），同时把 slot 格清为未放置
  const quota = new Map<number, number>()
  for (const key of slotSet) {
    const x = key % width
    const y = Math.floor(key / width)
    const colorId = target[y][x]
    quota.set(colorId, (quota.get(colorId) ?? 0) + 1)
    out[y][x] = -1
  }
  const dist = resolveSizeDistribution(options.sizeProfile)
  const alpha = options.structureAffinity
  const freeSet = new Set<number>(slotSet)

  while (freeSet.size > 0) {
    // ① 选种子：优先 free 内 8 邻居最少的空位（先吃角落）
    let seedKey = -1
    let seedNeighbors = Infinity
    const freeKeys = Array.from(freeSet)
    // 抖动遍历顺序，避免确定性偏置
    const ordered = shuffleWith(freeKeys, rng)
    for (const key of ordered) {
      const cx = key % width
      const cy = Math.floor(key / width)
      const neighbors = countFreeNeighbors(freeSet, cx, cy, width, height)
      if (neighbors < seedNeighbors || (neighbors === seedNeighbors && rng() < 0.5)) {
        seedNeighbors = neighbors
        seedKey = key
        if (neighbors === 0) break
      }
    }
    if (seedKey < 0) break
    const seed = { x: seedKey % width, y: Math.floor(seedKey / width) }

    // ② 采样目标块尺寸
    const sampled = sampleSizeFromProfile(rng, dist)

    // ③ 选色：score = α·local[c] + (1-α)·quota[c]/Σquota + ε·rng，ban 与 seed 8邻接已放色
    const banned = new Set<number>()
    for (const direction of DIRECTIONS) {
      const nx = seed.x + direction.x
      const ny = seed.y + direction.y
      if (!isWithinBounds(nx, ny, width, height)) continue
      const v = out[ny][nx]
      if (v >= 0) banned.add(v)
    }
    const local = computeBlockColorRatios(target, seed.x, seed.y)
    const totalQuota = Array.from(quota.values()).reduce((a, b) => a + b, 0)
    let bestColor = -1
    let bestScore = -Infinity
    const colorOrder = shuffleWith(Array.from(quota.keys()), rng)
    for (const colorId of colorOrder) {
      const q = quota.get(colorId) ?? 0
      if (q <= 0) continue
      if (banned.size > 0 && banned.has(colorId)) continue
      const localRatio = local.get(colorId) ?? 0
      const quotaRatio = totalQuota > 0 ? q / totalQuota : 0
      const score = alpha * localRatio + (1 - alpha) * quotaRatio + rng() * 1e-3
      if (score > bestScore) {
        bestScore = score
        bestColor = colorId
      }
    }
    // 所有候选都被 ban 的情况：忽略 ban 再选一次
    if (bestColor < 0) {
      for (const colorId of colorOrder) {
        const q = quota.get(colorId) ?? 0
        if (q <= 0) continue
        const localRatio = local.get(colorId) ?? 0
        const quotaRatio = totalQuota > 0 ? q / totalQuota : 0
        const score = alpha * localRatio + (1 - alpha) * quotaRatio + rng() * 1e-3
        if (score > bestScore) {
          bestScore = score
          bestColor = colorId
        }
      }
    }
    if (bestColor < 0) break

    // ④ 区域生长
    const want = Math.min(sampled, quota.get(bestColor) ?? 0, freeSet.size)
    const blob = want > 0
      ? growStructureAwareBlob(seed, want, bestColor, target, freeSet, rng, width, height)
      : [seed]
    // 从 free 中移除 seed（growStructureAwareBlob 内部不操作 freeSet）
    freeSet.delete(seed.y * width + seed.x)

    // ⑤ 写入，扣配额
    for (const cell of blob) {
      out[cell.y][cell.x] = bestColor
      freeSet.delete(cell.y * width + cell.x)
    }
    quota.set(bestColor, Math.max(0, (quota.get(bestColor) ?? 0) - blob.length))
  }

  // 配额守恒 H5 校验（实现 bug 才会触发，直接 throw）
  for (const [colorId, remaining] of quota) {
    if (remaining !== 0) {
      throw new Error(`quota violation: color ${colorId} remaining ${remaining}`)
    }
  }

  // 后处理：仅孤点吸收（不调用 reduceOriginalSameColorMatches）
  return absorbSingletonsSA(out, target, slotSet, rng, width, height)
}

const evaluateStructureAware = (out: number[][], target: number[][], slotSet: Set<number>, smallBlockQuota: number): {
  metrics: SortQualityMetrics
  passed: boolean
  score: number
} => {
  const metrics = computeSortQualityMetrics(out, target, slotSet)
  const h1 = metrics.structureRetention >= SA_H1_STRUCTURE_RETENTION
  const h2 = metrics.smallBlockRatio <= smallBlockQuota + 1e-9
  const h3 = metrics.greedyTailRun <= SA_H3_GREEDY_TAIL_RUN
  // H4 用 hard 阈值 0.50（白送进度上限）；warning 0.45 留给质量报告
  const h4 = metrics.fixedCellRatio <= SA_H4_FIXED_CELL_RATIO_HARD + 1e-9
  const passed = h1 && h2 && h3 && h4
  // 综合分越高越好（用于全失败时返回最优一次）
  // H4 超 hard 上限必须重罚：否则「与原图完全相同」（H1=1 且 H2/H3=0）会拿到最高分，
  // 导致全失败时返回未打乱的原图（表现为"生成的图和原图一模一样"）
  const h4Excess = Math.max(0, metrics.fixedCellRatio - SA_H4_FIXED_CELL_RATIO_HARD)
  const score = metrics.structureRetention - metrics.smallBlockRatio - metrics.greedyTailRun / 10 - h4Excess * 10
  return { metrics, passed, score }
}

// 结构感知受控生成入口（文档 4.1）：拒绝采样，全失败返回最优一次 + passed:false，不抛异常
export const generateStructureAwareSortedGrid = (
  source: GridData,
  options: StructureAwareSortOptions = {}
): StructureAwareSortResult => {
  const base = cloneGridData(source)
  if (base.width <= 0 || base.height <= 0) {
    const { usedSeed } = resolveRng(options.seed)
    return {
      grid: base,
      metrics: computeSortQualityMetrics(base.colorIndices, base.colorIndices, new Set()),
      attempts: 0,
      passed: false,
      usedSeed
    }
  }

  const hasExternalBackgroundMarker = base.colorIndices.some((row) =>
    row.some((value) => value === EXTERNAL_BACKGROUND_INDEX)
  )
  const externalMask = options.inferExternalBackground === false
    ? null
    : getExternalBackgroundMask(base.colorIndices, { backgroundIndex: options.backgroundIndex })
  const sortableMask = externalMask
    ? externalMask.map((row) => row.map((isExternal) => !isExternal))
    : Array.from({ length: base.height }, () => Array(base.width).fill(true))
  const slotSet = buildSlotSetFromMask(base.colorIndices, base.height, base.width, sortableMask)
  if (slotSet.size <= 1) {
    const { usedSeed } = resolveRng(options.seed)
    return {
      grid: base,
      metrics: computeSortQualityMetrics(base.colorIndices, base.colorIndices, slotSet),
      attempts: 0,
      passed: false,
      usedSeed
    }
  }

  const structureAffinity = clampStructureAffinity(options.structureAffinity)
  const smallBlockQuota = clampSmallBlockQuota(options.smallBlockQuota)
  const maxRetries = clampMaxRetries(options.maxRetries)
  const resolvedOptions = { ...options, structureAffinity, smallBlockQuota }
  const { usedSeed } = resolveRng(options.seed)

  const target = base.colorIndices
  let bestOut: number[][] | null = null
  let bestResult: ReturnType<typeof evaluateStructureAware> | null = null
  let attempts = 0

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    attempts = attempt + 1
    const rng = mulberry32((usedSeed + attempt) >>> 0)
    let out: number[][]
    try {
      out = generateStructureAwareOnce(base, target, slotSet, resolvedOptions, rng)
    } catch (e) {
      // 配额守恒失败（实现 bug）或异常，跳过本次（SA_DEBUG=1 时输出，浏览器环境无 process）
      if (typeof process !== 'undefined' && process.env?.SA_DEBUG) console.error('[SA_DEBUG] attempt', attempt, e)
      continue
    }
    const result = evaluateStructureAware(out, target, slotSet, smallBlockQuota)
    if (!bestResult || result.score > bestResult.score) {
      bestOut = out
      bestResult = result
    }
    if (result.passed) break
  }

  // normalize 外部背景后处理（复用旧路径模式）
  const hasExplicitBackgroundIndex = options.backgroundIndex !== null && options.backgroundIndex !== undefined
  if (options.normalizeExternalBackground && (hasExternalBackgroundMarker || hasExplicitBackgroundIndex) && externalMask && bestOut) {
    for (let y = 0; y < externalMask.length; y += 1) {
      for (let x = 0; x < (externalMask[y]?.length ?? 0); x += 1) {
        if (externalMask[y][x]) {
          bestOut[y][x] = EXTERNAL_BACKGROUND_INDEX
        }
      }
    }
  }

  return {
    grid: { ...base, colorIndices: bestOut ?? base.colorIndices },
    metrics: bestResult?.metrics ?? computeSortQualityMetrics(base.colorIndices, target, slotSet),
    attempts,
    passed: bestResult?.passed ?? false,
    usedSeed
  }
}

const clampStructureAffinity = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SA_DEFAULT_STRUCTURE_AFFINITY
  return Math.min(1, Math.max(0, value))
}

const clampSmallBlockQuota = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SA_DEFAULT_SMALL_BLOCK_QUOTA
  return Math.min(1, Math.max(0, value))
}

const clampMaxRetries = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SA_DEFAULT_MAX_RETRIES
  return Math.min(50, Math.max(0, Math.floor(value)))
}

// ============================================================================
// 区域重染色（Region Recolor）
// 详见 docs/关卡打乱算法改造需求-v2-区域重染色.md。
// 思路：目标图的同色连通区域是固定"轮廓容器"，颜色整区域互换填入——
// 区域边界一条不动，区域内部整片纯色。与 SA / legacy 路径完全独立。
// 对照原型 docs/source/perler_region_recolor_prototype.py（86 关验证）。
// ============================================================================

export interface RegionRecolorSortOptions {
  minRegionSize?: number              // 小区域并入阈值，默认 4（文档 4.2 ②）
  maxBlockSize?: number               // 单拾取块上限，0=不限制，默认 0（文档 4.4）
  seed?: number                       // 可复现，缺省 Date.now()
  maxRetries?: number                 // 拒绝采样，默认 8
  normalizeExternalBackground?: boolean
  backgroundIndex?: number | null
  // 注意 v1 教训：pixelconfig 已用 -2 标记背景的调用方应传 inferExternalBackground: false
  inferExternalBackground?: boolean
}

// 分配层策略（v2.1 双策略择优）：quota=v2 配额降序倾倒（策略 A）；matched=最小溢出匹配（策略 B）
export type RegionRecolorAllocStrategy = 'quota' | 'matched'

export interface RegionRecolorMetrics extends SortQualityMetrics {
  contourPreservation: number         // R1 轮廓保留（文档 5.1）
  regionPurity: number                // 区域纯度（文档 5.2）
  regionCount: number                 // 区域组数（小区域合并后、maxBlockSize 分片前）
  allocStrategy: RegionRecolorAllocStrategy  // 本关择优选中的分配策略（v2.1 §4.3）
  fixedFloor: number                  // 该图落原位数学下界（β=0.5 泛滥上限，v2.1 §4.3）
}

export interface RegionRecolorSortResult {
  grid: GridData
  metrics: RegionRecolorMetrics
  attempts: number
  passed: boolean
  usedSeed: number
}

// 硬约束阈值（文档 4.3）
const RR_DEFAULT_MIN_REGION_SIZE = 4
const RR_DEFAULT_MAX_RETRIES = 8
const RR_MIN_CUT_SIZE = 3             // 切块最小刀限（文档 4.2 ⑤c）
export const RR_R1_CONTOUR_PRESERVATION = 0.75
export const RR_R2_SMALL_BLOCK_RATIO = 0.10
export const RR_R3_GREEDY_TAIL_RUN = 8
export const RR_R4_FIXED_CELL_RATIO = 0.05
// v2.1：β 泛滥上限与 A/B 择优切换阈值（文档 §4.2 ① / §4.3，写成常量不开放调参）
const RR_BETA_FLOOD_CAP = 0.5
const RR_SWITCH_CONTOUR_GAIN = 0.05
const RR_SWITCH_FIXED_SLACK = 0.07

// fixedFloor（文档 v2.1 §4.3）：主导色在 β=0.5 泛滥上限下的理论回家下界。
// 大块单色图上轮廓保留与落原位不可兼得，该下界即 R4 可达的极限。
export const computeFixedFloor = (target: number[][], slotSet: Set<number>): number => {
  const width = target.length > 0 ? target[0].length : 0
  const quota = new Map<number, number>()
  for (const key of slotSet) {
    const value = target[Math.floor(key / width)]?.[key % width]
    if (typeof value !== 'number' || value < 0) continue
    quota.set(value, (quota.get(value) ?? 0) + 1)
  }
  let beads = 0
  let dominant = 0
  for (const count of quota.values()) {
    beads += count
    if (count > dominant) dominant = count
  }
  if (beads === 0) return 0
  return Math.max(0, (dominant - RR_BETA_FLOOD_CAP * (beads - dominant)) / beads)
}

// R4 自适应阈值（文档 v2.1 §5）：≤ max(0.05, fixedFloor + 0.07)
export const rrAdaptiveFixedThreshold = (fixedFloor: number): number =>
  Math.max(RR_R4_FIXED_CELL_RATIO, fixedFloor + RR_SWITCH_FIXED_SLACK)

export interface RegionGroup {
  id: number
  tc: number                          // 组的目标色（容器原本的颜色）
  cells: Set<number>                  // cell key = y * width + x
}

const clampRrMinRegionSize = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return RR_DEFAULT_MIN_REGION_SIZE
  return Math.min(64, Math.max(1, Math.floor(value)))
}

const clampRrMaxBlockSize = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const normalized = Math.max(0, Math.floor(value))
  // 小于最小刀限的上限没有意义，按 0（不限制）处理
  return normalized < RR_MIN_CUT_SIZE ? 0 : Math.min(10000, normalized)
}

// 区域提取（文档 4.2 ①）：目标图 8 邻域同色连通区域（仅 slotSet 内）
// + 小区域合并（②）：size < minRegionSize 并入最大的邻接区域，循环直到稳定。
// 确定性 tie-break：同尺寸取组 id 小者（与原型一致）。
export const buildRegionRecolorGroups = (
  target: number[][],
  slotSet: Set<number>,
  minRegionSize: number = RR_DEFAULT_MIN_REGION_SIZE
): RegionGroup[] => {
  const height = target.length
  const width = height > 0 ? target[0].length : 0
  const components = collectComponents8(target, slotSet)
  const groups: Array<RegionGroup | null> = components.map((component, index) => ({
    id: index,
    tc: component.colorId,
    cells: new Set(component.cells.map((cell) => cell.y * width + cell.x))
  }))
  const cell2g = new Map<number, number>()
  groups.forEach((group, index) => {
    if (!group) return
    for (const key of group.cells) cell2g.set(key, index)
  })

  let changed = true
  while (changed) {
    changed = false
    for (let gi = 0; gi < groups.length; gi += 1) {
      const group = groups[gi]
      if (!group || group.cells.size >= minRegionSize) continue
      const neighborIds = new Set<number>()
      for (const key of group.cells) {
        const cx = key % width
        const cy = Math.floor(key / width)
        for (const direction of DIRECTIONS) {
          const nx = cx + direction.x
          const ny = cy + direction.y
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const other = cell2g.get(ny * width + nx)
          if (other !== undefined && other !== gi && groups[other]) neighborIds.add(other)
        }
      }
      if (neighborIds.size === 0) continue
      let targetId = -1
      for (const candidate of neighborIds) {
        const candidateGroup = groups[candidate]
        if (!candidateGroup) continue
        if (targetId < 0) {
          targetId = candidate
          continue
        }
        const best = groups[targetId]
        if (!best) continue
        if (candidateGroup.cells.size > best.cells.size) {
          targetId = candidate
        } else if (candidateGroup.cells.size === best.cells.size && candidate < targetId) {
          targetId = candidate
        }
      }
      if (targetId < 0) continue
      const receiver = groups[targetId]
      if (!receiver) continue
      for (const key of group.cells) {
        receiver.cells.add(key)
        cell2g.set(key, targetId)
      }
      groups[gi] = null
      changed = true
    }
  }

  // 压缩并重建连续 id（保持原顺序，确定性）
  const compacted: RegionGroup[] = []
  for (const group of groups) {
    if (!group || group.cells.size === 0) continue
    compacted.push({ id: compacted.length, tc: group.tc, cells: group.cells })
  }
  return compacted
}

// maxBlockSize 分片（文档 4.4）：超大的组沿长轴切成若干直线边界的子片，
// 每片 [cap/2, cap]；分片后由配额的"异色 + 不同色邻接"约束自然填成不同颜色。
// 组的外轮廓边界不受影响，只增加组内部直线边界。
const splitRegionGroupsByMaxBlockSize = (
  groups: RegionGroup[],
  maxBlockSize: number,
  width: number,
  height: number
): RegionGroup[] => {
  if (maxBlockSize <= 0) return groups
  const result: RegionGroup[] = []
  for (const group of groups) {
    const size = group.cells.size
    if (size <= maxBlockSize) {
      result.push({ id: result.length, tc: group.tc, cells: group.cells })
      continue
    }
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const key of group.cells) {
      const cx = key % width
      const cy = Math.floor(key / width)
      if (cx < minX) minX = cx
      if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy
      if (cy > maxY) maxY = cy
    }
    const splitAlongX = (maxX - minX) >= (maxY - minY)
    const ordered = [...group.cells].sort((a, b) => {
      const ax = a % width
      const ay = Math.floor(a / width)
      const bx = b % width
      const by = Math.floor(b / width)
      return splitAlongX ? (ax - bx) || (ay - by) : (ay - by) || (ax - bx)
    })
    let sliceCount = Math.ceil(size / maxBlockSize)
    // 片尺寸下限取 max(cap/2, 最小刀限 3)：片 <3 会直接成为 R2 小块（低 mbs 时的主要病根）
    const sliceMin = Math.max(maxBlockSize / 2, RR_MIN_CUT_SIZE)
    while (sliceCount > 1 && size / sliceCount < sliceMin) sliceCount -= 1
    const base = Math.floor(size / sliceCount)
    const remainder = size % sliceCount
    const slices: Array<Set<number>> = []
    let cursor = 0
    for (let slice = 0; slice < sliceCount; slice += 1) {
      const sliceSize = base + (slice < remainder ? 1 : 0)
      const cells = new Set(ordered.slice(cursor, cursor + sliceSize))
      cursor += sliceSize
      if (cells.size > 0) slices.push(cells)
    }
    // 连通性修复：排序切块对非凸区域会产生断开的 <3 颗碎片，
    // 把碎片并入 8 邻接 cell 最多的兄弟片（tie：片序号小者），循环直到稳定
    for (let guard = 0; guard < slices.length * 4; guard += 1) {
      let moved = false
      for (let si = 0; si < slices.length; si += 1) {
        if (slices[si].size === 0) continue
        const fragments = collectCellFragments(slices[si], width, height)
        if (fragments.length <= 1) continue
        for (const fragment of fragments) {
          if (fragment.length >= RR_MIN_CUT_SIZE) continue
          let bestSi = -1
          let bestAdj = 0
          for (let ti = 0; ti < slices.length; ti += 1) {
            if (ti === si || slices[ti].size === 0) continue
            let adj = 0
            for (const key of fragment) {
              const cx = key % width
              const cy = Math.floor(key / width)
              for (const direction of DIRECTIONS) {
                if (slices[ti].has((cy + direction.y) * width + (cx + direction.x))) adj += 1
              }
            }
            if (adj > bestAdj || (adj === bestAdj && adj > 0 && bestSi >= 0 && ti < bestSi)) {
              bestAdj = adj
              bestSi = ti
            }
          }
          if (bestSi < 0 || bestAdj === 0) continue
          for (const key of fragment) {
            slices[si].delete(key)
            slices[bestSi].add(key)
          }
          moved = true
        }
      }
      if (!moved) break
    }
    for (const cells of slices) {
      if (cells.size === 0) continue
      // 修复后仍不连通的片：拆成逐碎片独立的组（碎片 ≥3 则是合法块；
      // 1-2 颗碎片无路可并时才遗留，交给拒绝采样与孤点吸收）
      const fragments = collectCellFragments(cells, width, height)
      for (const fragment of fragments) {
        result.push({ id: result.length, tc: group.tc, cells: new Set(fragment) })
      }
    }
  }
  return result
}

// 计算 cell 集合内的 8 连通碎片（分片连通性修复 / pass2 残余检查共用）
const collectCellFragments = (cells: Set<number>, width: number, height: number): number[][] => {
  const remaining = new Set(cells)
  const fragments: number[][] = []
  while (remaining.size > 0) {
    const start = remaining.values().next().value as number
    const fragment: number[] = []
    const queue: number[] = [start]
    remaining.delete(start)
    while (queue.length > 0) {
      const current = queue.pop()
      if (current === undefined) break
      fragment.push(current)
      const cx = current % width
      const cy = Math.floor(current / width)
      for (const direction of DIRECTIONS) {
        const nx = cx + direction.x
        const ny = cy + direction.y
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const key = ny * width + nx
        if (remaining.delete(key)) queue.push(key)
      }
    }
    fragments.push(fragment)
  }
  return fragments
}

// R1 轮廓保留（文档 5.1）：目标图 4 邻接异色边中，打乱后仍为异色的比例
export const computeContourPreservation = (out: number[][], target: number[][]): number => {
  const height = target.length
  const width = height > 0 ? target[0].length : 0
  let tot = 0
  let keep = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tv = target[y][x]
      if (tv < 0) continue
      // 只数右/下两个方向，每对计一次
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= width || ny >= height) continue
        const qv = target[ny][nx]
        if (qv < 0 || qv === tv) continue
        tot += 1
        if (out[y]?.[x] !== out[ny]?.[nx]) keep += 1
      }
    }
  }
  return tot > 0 ? keep / tot : 1
}

// 区域纯度（文档 5.2）：每组内最多色占比，按组尺寸加权平均
export const computeRegionPurity = (out: number[][], groups: RegionGroup[], width: number): number => {
  let weightedSum = 0
  let totalSize = 0
  for (const group of groups) {
    if (group.cells.size === 0) continue
    const counts = new Map<number, number>()
    for (const key of group.cells) {
      const value = out[Math.floor(key / width)]?.[key % width]
      if (typeof value !== 'number' || value < 0) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    let best = 0
    for (const count of counts.values()) {
      if (count > best) best = count
    }
    weightedSum += best
    totalSize += group.cells.size
  }
  return totalSize > 0 ? weightedSum / totalSize : 1
}

// 区域重染色指标汇总（文档 5.3）：沿用 v1 的 SortQualityMetrics（含非锁定格口径），
// 追加 contourPreservation / regionPurity / regionCount / allocStrategy / fixedFloor。
export const computeRegionRecolorMetrics = (
  out: number[][],
  target: number[][],
  slotSet: Set<number>,
  groups: RegionGroup[],
  allocStrategy: RegionRecolorAllocStrategy = 'quota'
): RegionRecolorMetrics => {
  const baseMetrics = computeSortQualityMetrics(out, target, slotSet)
  const width = target.length > 0 ? target[0].length : 0
  return {
    ...baseMetrics,
    contourPreservation: computeContourPreservation(out, target),
    regionPurity: computeRegionPurity(out, groups, width),
    regionCount: groups.length,
    allocStrategy,
    fixedFloor: computeFixedFloor(target, slotSet)
  }
}

// 组在 out 中 8 邻接的已填颜色集合（pass1「不与已填同色区域相邻」判定）。
// 传 selfIndex 时忽略属于本组的已填格（pass2 续切同组是区域内部延伸，不算跨边界接触）。
const collectAdjacentFilledColors = (
  group: RegionGroup,
  out: number[][],
  width: number,
  height: number,
  cell2g?: Map<number, number>,
  selfIndex?: number
): Set<number> => {
  const colors = new Set<number>()
  for (const key of group.cells) {
    const cx = key % width
    const cy = Math.floor(key / width)
    for (const direction of DIRECTIONS) {
      const nx = cx + direction.x
      const ny = cy + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const value = out[ny][nx]
      if (value < 0) continue
      if (cell2g && selfIndex !== undefined && cell2g.get(ny * width + nx) === selfIndex) continue
      colors.add(value)
    }
  }
  return colors
}

// 组与某色已填区域的「跨组」4 邻接共享边界条数（pass1b/pass2 共用；同组内部接触不计）
const sharedBoundaryWithColor4 = (
  group: RegionGroup,
  color: number,
  out: number[][],
  cell2g: Map<number, number>,
  selfIndex: number,
  width: number,
  height: number
): number => {
  let shared = 0
  for (const key of group.cells) {
    const cx = key % width
    const cy = Math.floor(key / width)
    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const nx = cx + direction.x
      const ny = cy + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      if (cell2g.get(ny * width + nx) === selfIndex) continue
      if (out[ny][nx] === color) shared += 1
    }
  }
  return shared
}

// pass1b 宽松整组填的共享边界上限：牺牲 ≤3 条边界换取整体颜色匹配
const RR_PASS1_RELAXED_SHARED = 3

// 紧凑切块权重（⑤d）：主目标（避同色 / 避目标色）必须压过紧凑项，否则会拿 R1 换形状。
// 紧凑项只在主目标同分的候选之间决定取谁——即把原先纯 rng 的平局
// 改为「贴合已取块 + 不撑大外接矩形」，让刀口成方成片而不是长出触须、锯齿边。
// primary(0-8)*100 恒大于 adjacency(0-4)*10 + bbox(0-2)*3，优先级不会被紧凑项翻转。
const RR_COMPACT_PRIMARY_WEIGHT = 100
const RR_COMPACT_ADJACENCY_WEIGHT = 10
const RR_COMPACT_BBOX_WEIGHT = 3
const RR_CUT_ATTEMPTS = 6

// 紧凑贪心生长：从 seed 起每步取「主目标惩罚最小 → 与已取块 4 邻接最多 →
// 最不撑大外接矩形」的候选格。penaltyOf 省略时退化为纯紧凑生长（成块优先）。
const growCompactBlock = (
  cells: Set<number>,
  seed: number,
  take: number,
  rng: () => number,
  width: number,
  height: number,
  penaltyOf?: (key: number) => number
): number[] => {
  const taken: number[] = [seed]
  const takenSet = new Set<number>([seed])
  let minX = seed % width
  let maxX = minX
  let minY = Math.floor(seed / width)
  let maxY = minY
  const candidates = new Set<number>()
  const addAround = (key: number) => {
    const cx = key % width
    const cy = Math.floor(key / width)
    for (const direction of DIRECTIONS) {
      const nx = cx + direction.x
      const ny = cy + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nextKey = ny * width + nx
      if (!cells.has(nextKey) || takenSet.has(nextKey)) continue
      candidates.add(nextKey)
    }
  }
  addAround(seed)
  while (taken.length < take && candidates.size > 0) {
    let bestKey = -1
    let bestScore = Number.POSITIVE_INFINITY
    for (const key of candidates) {
      const cx = key % width
      const cy = Math.floor(key / width)
      let adjacency = 0
      for (const direction of ORTHOGONAL_DIRECTIONS) {
        const nx = cx + direction.x
        const ny = cy + direction.y
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (takenSet.has(ny * width + nx)) adjacency += 1
      }
      const growth = Math.max(0, minX - cx) + Math.max(0, cx - maxX)
        + Math.max(0, minY - cy) + Math.max(0, cy - maxY)
      const score = (penaltyOf ? penaltyOf(key) * RR_COMPACT_PRIMARY_WEIGHT : 0)
        - adjacency * RR_COMPACT_ADJACENCY_WEIGHT
        + growth * RR_COMPACT_BBOX_WEIGHT
        + rng() * 1e-3
      if (score < bestScore) {
        bestScore = score
        bestKey = key
      }
    }
    if (bestKey < 0) break
    candidates.delete(bestKey)
    takenSet.add(bestKey)
    taken.push(bestKey)
    const bx = bestKey % width
    const by = Math.floor(bestKey / width)
    if (bx < minX) minX = bx
    if (bx > maxX) maxX = bx
    if (by < minY) minY = by
    if (by > maxY) maxY = by
    addAround(bestKey)
  }
  return taken
}

// 注：种子仍从边界池随机取。曾试过优先组的角/尖端（8 邻居最少者），
// 形状略齐但会换掉轮廓（轮廓保留下降、落原位比例上升），故不采用——
// 起刀点归 rng，规整度只由生长阶段的紧凑打分负责。

// 从组边界种子取 take 个格（文档 4.2 ③ pass2）。
// 传 avoidColor 时优先从「8 邻域没有该色已填格」的边界种子起切——
// 被迫在同色附近下刀时，从远离同色的位置长，最小化跨边界同色接触（保 R1）。
// 取格一律走紧凑贪心（⑤d），同等条件下贴着已取块长成方块。
const bfsTakeFromGroup = (
  cells: Set<number>,
  take: number,
  rng: () => number,
  width: number,
  height: number,
  avoid?: { out: number[][]; color: number }
): number[] => {
  const edgeCells: number[] = []
  for (const key of cells) {
    const cx = key % width
    const cy = Math.floor(key / width)
    let isEdge = false
    for (const direction of DIRECTIONS) {
      const nx = cx + direction.x
      const ny = cy + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !cells.has(ny * width + nx)) {
        isEdge = true
        break
      }
    }
    if (isEdge) edgeCells.push(key)
  }
  let seedPool = edgeCells.length > 0 ? edgeCells : [...cells]
  if (avoid) {
    const clean = seedPool.filter((key) => {
      const cx = key % width
      const cy = Math.floor(key / width)
      for (const direction of DIRECTIONS) {
        const nx = cx + direction.x
        const ny = cy + direction.y
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (avoid.out[ny][nx] === avoid.color) return false
      }
      return true
    })
    if (clean.length > 0) seedPool = clean
  }
  const seed = seedPool[Math.floor(rng() * seedPool.length)]
  // 主目标惩罚 = 该格的同色 8 邻接数（避同色，保 R1）；紧凑项只在同分候选间取舍
  const contactOf = avoid
    ? (key: number): number => {
      const cx = key % width
      const cy = Math.floor(key / width)
      let contact = 0
      for (const direction of DIRECTIONS) {
        const nx = cx + direction.x
        const ny = cy + direction.y
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (avoid.out[ny][nx] === avoid.color) contact += 1
      }
      return contact
    }
    : undefined
  return growCompactBlock(cells, seed, take, rng, width, height, contactOf)
}

// 「并入上一刀」（文档 4.2 ⑤c）：从最后一块的边界向未填空间 BFS 扩 count 格。
// 两段式：先限定同组（跨组扩会抹目标边界，损 R1）；同组扩不满时放宽到任意未填格——
// 末位刀的 1-2 颗残余靠跨组 scoop 收编，避免散格变成孤立小块（R2）。
// 只读探测，调用方确认扩满 need 后才提交。
const growFromBlockFrontier = (
  block: number[],
  unfilled: Set<number>,
  count: number,
  groupId: number,
  cell2g: Map<number, number>,
  rng: () => number,
  width: number,
  height: number
): number[] => {
  if (count <= 0) return []
  // 紧凑扩张（⑤d）：每步取「与已成形块 4 邻接最多、最不撑大外接矩形」的未填格，
  // 让并入上一刀的残余贴着块长厚，而不是顺着 BFS 队列拖出一条尾巴
  const compactGrow = (startFrom: number[], limit: number, sameGroupOnly: boolean): number[] => {
    const attached = new Set(startFrom)
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const key of startFrom) {
      const cx = key % width
      const cy = Math.floor(key / width)
      if (cx < minX) minX = cx
      if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy
      if (cy > maxY) maxY = cy
    }
    const eligible = (key: number): boolean =>
      unfilled.has(key) && !attached.has(key) && (!sameGroupOnly || cell2g.get(key) === groupId)
    const candidates = new Set<number>()
    const addAround = (key: number) => {
      const cx = key % width
      const cy = Math.floor(key / width)
      for (const direction of DIRECTIONS) {
        const nx = cx + direction.x
        const ny = cy + direction.y
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const nextKey = ny * width + nx
        if (!eligible(nextKey)) continue
        candidates.add(nextKey)
      }
    }
    for (const key of startFrom) addAround(key)
    const grown: number[] = []
    while (grown.length < limit && candidates.size > 0) {
      let bestKey = -1
      let bestScore = Number.POSITIVE_INFINITY
      for (const key of candidates) {
        const cx = key % width
        const cy = Math.floor(key / width)
        let adjacency = 0
        for (const direction of ORTHOGONAL_DIRECTIONS) {
          const nx = cx + direction.x
          const ny = cy + direction.y
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (attached.has(ny * width + nx)) adjacency += 1
        }
        const growth = Math.max(0, minX - cx) + Math.max(0, cx - maxX)
          + Math.max(0, minY - cy) + Math.max(0, cy - maxY)
        const score = -adjacency * RR_COMPACT_ADJACENCY_WEIGHT
          + growth * RR_COMPACT_BBOX_WEIGHT
          + rng() * 1e-3
        if (score < bestScore) {
          bestScore = score
          bestKey = key
        }
      }
      if (bestKey < 0) break
      candidates.delete(bestKey)
      attached.add(bestKey)
      grown.push(bestKey)
      const bx = bestKey % width
      const by = Math.floor(bestKey / width)
      if (bx < minX) minX = bx
      if (bx > maxX) maxX = bx
      if (by < minY) minY = by
      if (by > maxY) maxY = by
      addAround(bestKey)
    }
    return grown
  }
  // 段 1：同组扩
  const phase1 = compactGrow(block, count, true)
  if (phase1.length === count) return phase1
  // 段 2：跨组 scoop（从 块+段1 的新边界继续，不限组）
  const phase2 = compactGrow([...block, ...phase1], count - phase1.length, false)
  return [...phase1, ...phase2]
}

// 外接矩形空置率：0 = 实心矩形，越大越不规则（细长、L 形、带触须）
const bboxSlackRatio = (block: number[], width: number): number => {
  if (block.length === 0) return Number.POSITIVE_INFINITY
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const key of block) {
    const cx = key % width
    const cy = Math.floor(key / width)
    if (cx < minX) minX = cx
    if (cx > maxX) maxX = cx
    if (cy < minY) minY = cy
    if (cy > maxY) maxY = cy
  }
  const area = (maxX - minX + 1) * (maxY - minY + 1)
  return (area - block.length) / area
}

// pass2 切刀：多种子重试，优先"残余无 <3 颗碎片"的切法；碎屑同分时取更方的一刀（⑤d）；
// 仍带碎片且配额/刀限有余量时，把碎片一并吞入本刀（⑤a 碎屑合并的就地实现）
const cutGroupCells = (
  cells: Set<number>,
  take: number,
  fillLimit: number,
  rng: () => number,
  width: number,
  height: number,
  avoid?: { out: number[][]; color: number }
): number[] => {
  let best: number[] | null = null
  let bestDebris = Number.POSITIVE_INFINITY
  let bestSlack = Number.POSITIVE_INFINITY
  for (let attempt = 0; attempt < RR_CUT_ATTEMPTS; attempt += 1) {
    const got = bfsTakeFromGroup(cells, take, rng, width, height, avoid)
    if (got.length === 0) return got
    if (got.length >= cells.size) return got // 整组带走，无残余
    const residual = new Set(cells)
    for (const key of got) residual.delete(key)
    const fragments = collectCellFragments(residual, width, height)
    const debris = fragments.filter((fragment) => fragment.length < RR_MIN_CUT_SIZE)
    const debrisCells = debris.reduce((sum, fragment) => sum + fragment.length, 0)
    const slack = bboxSlackRatio(got, width)
    if (debrisCells < bestDebris || (debrisCells === bestDebris && slack < bestSlack)) {
      bestDebris = debrisCells
      bestSlack = slack
      best = got
      if (debrisCells === 0 && slack <= 0) break
    }
  }
  if (!best || bestDebris === 0 || bestDebris === Number.POSITIVE_INFINITY) return best ?? []
  // 吞并碎片：fillLimit - best.length 为剩余可填量（need 与 cap 的约束）
  const swallowed = [...best]
  let room = fillLimit - swallowed.length
  if (room > 0) {
    const residual = new Set(cells)
    for (const key of swallowed) residual.delete(key)
    for (const fragment of collectCellFragments(residual, width, height)) {
      if (fragment.length >= RR_MIN_CUT_SIZE || fragment.length > room) continue
      swallowed.push(...fragment)
      room -= fragment.length
      for (const key of fragment) residual.delete(key)
    }
  }
  return swallowed
}

// 单次区域重染色生成（文档 4.2）：配额守恒 + 整组填（pass1）+ 切块填（pass2）
// + 后处理（⑤a 碎屑预留 3 颗刀限 / ⑤b 孤点吸收）。不达标由上层拒绝采样。
// preferSameTcOverAdjacent：pass2 分层在「相邻异色组」（损轮廓）与「同色目标组」（增落原位）
// 之间的取舍方向。默认相邻异色优先（R4 优先）；大主色图反过来更优——
// 用少量落原位预算换轮廓，由拒绝采样在两种倾向间择优。
// quotaAscending：小配额色先填（默认降序时它们最后填，只剩散格被迫成孤点——frog 病根），
// 大配额色兜底吃剩余连片空间。作为拒绝采样的尝试变体使用。
const generateRegionRecolorOnce = (
  source: GridData,
  target: number[][],
  slotSet: Set<number>,
  workGroups: RegionGroup[],
  maxBlockSize: number,
  rng: () => number,
  preferSameTcOverAdjacent: boolean = false,
  quotaAscending: boolean = false,
  interleavedPass1: boolean = false
): number[][] => {
  const { width, height } = source
  // 深拷贝组（分配过程会消耗 cells）
  const groups = workGroups.map((group) => ({ id: group.id, tc: group.tc, cells: new Set(group.cells) }))
  const cell2g = new Map<number, number>()
  groups.forEach((group, index) => {
    for (const key of group.cells) cell2g.set(key, index)
  })
  // slotSet 外原样保留；slotSet 内清为未填（-1）
  const out: number[][] = target.map((row) => [...row])
  const quota = new Map<number, number>()
  for (const key of slotSet) {
    const cx = key % width
    const cy = Math.floor(key / width)
    const colorId = target[cy][cx]
    quota.set(colorId, (quota.get(colorId) ?? 0) + 1)
    out[cy][cx] = -1
  }
  const unfilled = new Set(slotSet)
  const cap = maxBlockSize > 0 ? maxBlockSize : Number.POSITIVE_INFINITY
  // 落原位预算（仅 preferSameTcOverAdjacent 倾向生效）：同色目标组填充累计不得超过
  // R4 阈值安全边（0.045），把"落原位换轮廓"严格约束在 R4 达标线内
  const fixedBudget = preferSameTcOverAdjacent ? Math.floor(slotSet.size * 0.045) : 0
  let fixedUsed = 0
  const removeFromGroup = (key: number) => {
    const gi = cell2g.get(key)
    if (gi !== undefined) groups[gi].cells.delete(key)
  }
  const fillCells = (keys: Iterable<number>, color: number): number[] => {
    const filled: number[] = []
    for (const key of keys) {
      const cx = key % width
      const cy = Math.floor(key / width)
      out[cy][cx] = color
      unfilled.delete(key)
      removeFromGroup(key)
      filled.push(key)
    }
    return filled
  }

  // 颜色按配额降序（tie：颜色 id 升序，确定性）；quotaAscending 变体反转为升序
  const colorOrder = [...quota.keys()].sort((a, b) => (quota.get(b) ?? 0) - (quota.get(a) ?? 0) || a - b)
  if (quotaAscending) colorOrder.reverse()

  // 交错 pass1（maxBlockSize 提拾取数变体）：每轮每色最多整填一组，
  // 各色落子点全局散开，避免大配额色先占满全图、后续颜色被迫同色相邻合并大块
  if (interleavedPass1) {
    let filledAny = true
    while (filledAny) {
      filledAny = false
      for (const color of colorOrder) {
        const need = quota.get(color) ?? 0
        if (need <= 0) continue
        let bestGi = -1
        let bestSize = -1
        for (let gi = 0; gi < groups.length; gi += 1) {
          const group = groups[gi]
          const size = group.cells.size
          if (size === 0 || size > need || size > cap || size <= bestSize) continue
          if (group.tc === color) continue
          if (collectAdjacentFilledColors(group, out, width, height).has(color)) continue
          bestGi = gi
          bestSize = size
        }
        if (bestGi < 0) continue
        fillCells(groups[bestGi].cells, color)
        quota.set(color, need - bestSize)
        filledAny = true
      }
    }
  }

  for (const color of colorOrder) {
    let need = quota.get(color) ?? 0
    let lastBlock: number[] = []
    let lastBlockGroupId = -1
    // 当前色已落子的组（pass2 续切同组=同一块，不增拾取数；切新组才是新拾取块）
    const touchedGroups = new Set<number>()

    // pass1 整组填：组按尺寸降序（同尺寸 rng 抖动），满足
    // [组尺寸 ≤ 剩余配额] 且 [组尺寸 ≤ cap] 且 [组目标色 ≠ 当前色] 且 [不与已填同色区域 8 邻接]
    const pass1Order = groups.map((_, index) => index).filter((index) => groups[index].cells.size > 0)
    const shuffledPass1 = shuffleWith(pass1Order, rng)
    shuffledPass1.sort((a, b) => groups[b].cells.size - groups[a].cells.size)
    for (const gi of shuffledPass1) {
      if (need <= 0) break
      const group = groups[gi]
      const size = group.cells.size
      if (size === 0 || size > need || size > cap) continue
      if (group.tc === color) continue
      if (collectAdjacentFilledColors(group, out, width, height).has(color)) continue
      lastBlock = fillCells(group.cells, color)
      lastBlockGroupId = gi
      touchedGroups.add(gi)
      need -= size
    }

    // pass1b 宽松整组填：严格邻接无可填时，允许「跨组共享边界 ≤ 3 条」的整组填。
    // 少区域图（例如只有 4 个区域）严格邻接会把颜色逼进同色目标组（R4）或被迫切碎（R1），
    // 牺牲 ≤3 条边界换取整体匹配；优先共享边界最小、尺寸最大者。
    while (need > 0) {
      let bestGi = -1
      let bestShared = Number.POSITIVE_INFINITY
      let bestSize = -1
      for (let gi = 0; gi < groups.length; gi += 1) {
        const group = groups[gi]
        const size = group.cells.size
        if (size === 0 || size > need || size > cap) continue
        if (group.tc === color) continue
        const shared = sharedBoundaryWithColor4(group, color, out, cell2g, gi, width, height)
        if (shared === 0 || shared > RR_PASS1_RELAXED_SHARED) continue
        if (shared < bestShared || (shared === bestShared && size > bestSize)) {
          bestGi = gi
          bestShared = shared
          bestSize = size
        }
      }
      if (bestGi < 0) break
      lastBlock = fillCells(groups[bestGi].cells, color)
      lastBlockGroupId = bestGi
      touchedGroups.add(bestGi)
      need -= bestSize
    }

    // pass2 切块填：配额有余但无整组可填时，在剩余空间按组切整块填
    while (need > 0) {
      // ⑤c 剩余不足最小刀限：优先并入上一刀（同组内扩最后一块）
      if (need < RR_MIN_CUT_SIZE && lastBlock.length > 0 && lastBlockGroupId >= 0) {
        const grown = growFromBlockFrontier(lastBlock, unfilled, need, lastBlockGroupId, cell2g, rng, width, height)
        if (grown.length === need) {
          lastBlock = [...lastBlock, ...fillCells(grown, color)]
          touchedGroups.add(lastBlockGroupId)
          need = 0
          break
        }
      }
      const candidates = groups.map((_, index) => index).filter((index) => groups[index].cells.size > 0)
      if (candidates.length === 0) break // 理论上不可达（Σquota = Σcells）；守恒校验兜底 throw
      const shuffledCandidates = shuffleWith(candidates, rng)
      const adjacencyCache = new Map<number, boolean>()
      // 邻接判定排除本组已填格：续切同组是区域内部延伸，不产生跨边界同色接触
      const isAdjacentToColor = (index: number): boolean => {
        if (!adjacencyCache.has(index)) {
          adjacencyCache.set(index, collectAdjacentFilledColors(groups[index], out, width, height, cell2g, index).has(color))
        }
        return adjacencyCache.get(index) ?? false
      }
      // 与当前色已填区域的「跨组」4 邻接共享边界长度（被迫同色相邻时取最短者，最小化 R1 损失）
      const sharedCache = new Map<number, number>()
      const sharedBoundaryWithColor = (index: number): number => {
        if (!sharedCache.has(index)) {
          sharedCache.set(index, sharedBoundaryWithColor4(groups[index], color, out, cell2g, index, width, height))
        }
        return sharedCache.get(index) ?? 0
      }
      // 分层选组：tier0 组目标色≠当前色 且 不同色邻接。
      // preferSameTcOverAdjacent（配固定预算）时：预算内同色目标组(tier1) > 相邻异色组(tier2)
      // > 同色相邻同色目标(tier3) > 预算外同色目标(tier4)；默认倾向：相邻异色组(tier1)
      // > 同色目标组(tier2) > 同色相邻(tier3)。同层按尺寸降序；同色相邻层按共享边界升序。
      const tierOf = (index: number): number => {
        const adjacent = isAdjacentToColor(index)
        const sameTc = groups[index].tc === color
        if (!sameTc && !adjacent) return 0
        if (preferSameTcOverAdjacent) {
          // 预算内的同色目标组（无论邻接）优先于相邻异色组：用少量落原位换大轮廓
          const withinBudget = fixedUsed + RR_MIN_CUT_SIZE <= fixedBudget
          if (sameTc) return withinBudget ? 1 : 3
          return 2
        }
        if (sameTc && adjacent) return 3
        return sameTc ? 2 : 1
      }
      // 净切判定：take 后残余为 0 或 ≥ 最小刀限（不产生 1-2 颗散格）
      const isCleanCut = (index: number): boolean => {
        const avail = groups[index].cells.size
        const take = Math.min(need, avail, cap)
        const residual = avail - take
        return residual === 0 || residual >= RR_MIN_CUT_SIZE
      }
      shuffledCandidates.sort((a, b) => {
        const tierA = tierOf(a)
        const tierB = tierOf(b)
        if (tierA !== tierB) return tierA - tierB
        // 净切优先：整组带走（无残余）或残余 ≥3 的组优先——避免制造 1-2 颗散格
        // （散格会成为末位小配额色的孤立单颗，frog 两粒 #3 孤点的病根）
        const cleanA = isCleanCut(a) ? 0 : 1
        const cleanB = isCleanCut(b) ? 0 : 1
        if (cleanA !== cleanB) return cleanA - cleanB
        if (isAdjacentToColor(a) && isAdjacentToColor(b)) {
          const sharedA = sharedBoundaryWithColor(a)
          const sharedB = sharedBoundaryWithColor(b)
          if (sharedA !== sharedB) return sharedA - sharedB
        }
        // tier0 内：续切同组不增拾取数。maxBlockSize 模式下优先「未落子的新组」
        // （每一刀都是新拾取块，把拾取数拉进带宽）；无上限模式保持尺寸优先（大块更整）
        if (maxBlockSize > 0) {
          const freshA = touchedGroups.has(a) ? 1 : 0
          const freshB = touchedGroups.has(b) ? 1 : 0
          if (freshA !== freshB) return freshA - freshB
        }
        return groups[b].cells.size - groups[a].cells.size
      })
      const groupIndex = shuffledCandidates[0]
      const group = groups[groupIndex]
      const avail = group.cells.size
      let take = Math.min(need, avail, cap)
      // 同色目标组下刀时把刀口约束在落原位预算余额内（escape valve 不得冲爆 R4）；
      // 预算外同色目标组（tier3）是最后手段，不再受预算限制，否则 take=0 会破坏守恒
      if (group.tc === color && fixedBudget > 0 && tierOf(groupIndex) <= 1) {
        const budgetLeft = fixedBudget - fixedUsed
        take = Math.max(0, Math.min(take, budgetLeft))
      }
      if (take >= RR_MIN_CUT_SIZE) {
        // ⑤a 碎屑预留：切完残余 < 3 颗时，把残余留到恰好 3（下一切不小于刀限）
        const residual = avail - take
        if (residual > 0 && residual < RR_MIN_CUT_SIZE && avail - RR_MIN_CUT_SIZE >= RR_MIN_CUT_SIZE) {
          take = Math.min(need, avail - RR_MIN_CUT_SIZE)
        }
      }
      if (take <= 0) break
      const got = cutGroupCells(group.cells, take, Math.min(need, cap), rng, width, height, { out, color })
      if (got.length === 0) break
      lastBlock = fillCells(got, color)
      lastBlockGroupId = groupIndex
      touchedGroups.add(groupIndex)
      if (group.tc === color) fixedUsed += got.length
      need -= got.length
    }
    quota.set(color, need)
  }

  // 配额守恒 H5（文档 4.2 ④）：violation = 实现 bug，直接 throw
  for (const [colorId, remaining] of quota) {
    if (remaining !== 0) {
      throw new Error(`region recolor quota violation: color ${colorId} remaining ${remaining}`)
    }
  }
  if (unfilled.size > 0) {
    throw new Error(`region recolor unfilled cells: ${unfilled.size}`)
  }

  // 返回原始候选（v2.1：后处理改为对 A/B 择优后的胜者执行，见 generateRegionRecolorSortedGrid）
  return out
}

// 局部探测 (x,y) 所在同色连通块尺寸（封顶 cap，避免全图洪泛）
const localComponentSizeRR = (
  grid: number[][],
  slotSet: Set<number>,
  x: number,
  y: number,
  cap: number,
  width: number,
  height: number
): number => {
  const color = grid[y]?.[x]
  if (typeof color !== 'number' || color < 0) return 0
  const seen = new Set<number>([y * width + x])
  const queue: Point[] = [{ x, y }]
  let size = 0
  while (queue.length > 0 && size < cap) {
    const current = queue.shift()
    if (!current) break
    size += 1
    for (const direction of DIRECTIONS) {
      const nx = current.x + direction.x
      const ny = current.y + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const key = ny * width + nx
      if (seen.has(key) || !slotSet.has(key)) continue
      if (grid[ny][nx] !== color) continue
      seen.add(key)
      queue.push({ x: nx, y: ny })
    }
  }
  return size
}

// 交换守护（regionRecolor 后处理共用）：执行 a/b 两格交换并校验
// ① fixedCellRatio 不上升 ② a/b 关联的目标边界边中交换前保留的交换后仍保留（R1 不恶化）
// ③ a 格交换后必须真的并入一个 >maxAbsorbSize 的块（二环"换了个寂寞"伪吸收直接回滚）
// 不满足则回滚并返回 false
const trySwapWithGuardsRR = (
  result: number[][],
  target: number[][],
  slotSet: Set<number>,
  baselineFixed: number,
  a: Point,
  b: Point,
  width: number,
  height: number,
  maxAbsorbSize: number
): boolean => {
  const keptBoundaryNeighbors = (px: number, py: number): number[] => {
    const tp = target[py]?.[px]
    if (typeof tp !== 'number' || tp < 0) return []
    const kept: number[] = []
    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const nx = px + direction.x
      const ny = py + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const tn = target[ny][nx]
      if (tn < 0 || tn === tp) continue
      if (result[py][px] !== result[ny][nx]) kept.push(ny * width + nx)
    }
    return kept
  }
  const keptA = keptBoundaryNeighbors(a.x, a.y)
  const keptB = keptBoundaryNeighbors(b.x, b.y)
  const beforeA = result[a.y][a.x]
  const beforeB = result[b.y][b.x]
  result[a.y][a.x] = beforeB
  result[b.y][b.x] = beforeA
  const contourIntact = (px: number, py: number, kept: number[]): boolean =>
    kept.every((neighborKey) => {
      const nx = neighborKey % width
      const ny = Math.floor(neighborKey / width)
      return result[py][px] !== result[ny][nx]
    })
  const afterFixed = computeFixedCellRatio(result, target)
  if (afterFixed > baselineFixed + 1e-9
    || !contourIntact(a.x, a.y, keptA)
    || !contourIntact(b.x, b.y, keptB)
    || localComponentSizeRR(result, slotSet, a.x, a.y, maxAbsorbSize + 2, width, height) <= maxAbsorbSize) {
    result[a.y][a.x] = beforeA
    result[b.y][b.x] = beforeB
    return false
  }
  return true
}

// 落原位消除（R4 兜底后处理）：把 out[p]==target[p] 的格与 8 邻域内
// 「交换后双方都不落原位」的格互换；双方所在块让渡一格后均须 ≥3 颗，不破坏轮廓。
// ≤3 轮，每轮全扫；无可消格提前结束。
const reduceFixedCellsRR = (
  indices: number[][],
  target: number[][],
  slotSet: Set<number>,
  freeRng: () => number,
  width: number,
  height: number
): number[][] => {
  const result = indices.map((row) => [...row])
  const baselineFixed = computeFixedCellRatio(result, target)
  if (baselineFixed <= 0) return result

  for (let round = 0; round < 3; round += 1) {
    const fixedCells: Point[] = []
    for (const key of slotSet) {
      const cx = key % width
      const cy = Math.floor(key / width)
      if (target[cy][cx] >= 0 && result[cy][cx] === target[cy][cx]) fixedCells.push({ x: cx, y: cy })
    }
    if (fixedCells.length === 0) break
    let changed = false
    for (const cell of shuffleWith(fixedCells, freeRng)) {
      const tp = target[cell.y][cell.x]
      const vp = result[cell.y][cell.x]
      if (vp !== tp || tp < 0) continue // 已在先前交换中脱离原位
      if (localComponentSizeRR(result, slotSet, cell.x, cell.y, 4, width, height) < 4) continue
      const searchOrder = shuffleWith(Array.from({ length: 8 }, (_, i) => i), freeRng)
      for (const i of searchOrder) {
        const direction = DIRECTIONS[i]
        const nx = cell.x + direction.x
        const ny = cell.y + direction.y
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (!slotSet.has(ny * width + nx)) continue
        const vq = result[ny][nx]
        if (vq < 0 || vq === vp) continue
        const tq = target[ny][nx]
        if (vq === tp) continue // p 接收后仍落原位
        if (vq === tq) continue // q 当前也落原位，交换只是搬移问题
        if (tq === tp) continue // q 接收 tp 后落原位
        if (localComponentSizeRR(result, slotSet, nx, ny, 4, width, height) < 4) continue
        if (trySwapWithGuardsRR(result, target, slotSet, baselineFixed, cell, { x: nx, y: ny }, width, height, 2)) {
          changed = true
          break
        }
      }
    }
    if (!changed) break
  }
  return result
}

// 孤点吸收（regionRecolor 版，⑤b）：把 size ≤ maxAbsorbSize 的块逐格与邻近
// （8 邻域 + 二环）不同色、且让渡后仍 ≥3 颗的大块成员交换消除。
// 复用 v1 absorbSingletonsSA 思路：≤5 轮，交换不得使 fixedCellRatio 上升、不得破坏轮廓。
const absorbSmallBlocksRR = (
  indices: number[][],
  target: number[][],
  slotSet: Set<number>,
  freeRng: () => number,
  width: number,
  height: number,
  maxAbsorbSize: number
): number[][] => {
  const result = indices.map((row) => [...row])
  const baselineFixed = computeFixedCellRatio(result, target)

  for (let round = 0; round < 5; round += 1) {
    const components = collectComponents8(result, slotSet)
    const smalls = components.filter((component) => component.cells.length <= maxAbsorbSize)
    if (smalls.length === 0) break
    let changed = false
    for (const small of smalls) {
      for (const cell of small.cells) {
        const colorId = result[cell.y]?.[cell.x]
        if (typeof colorId !== 'number' || colorId < 0) continue
        // 若该格已在先前交换中并入大块（不再是小块成员），跳过
        if (localComponentSizeRR(result, slotSet, cell.x, cell.y, maxAbsorbSize + 1, width, height) > maxAbsorbSize) continue
        const searchOrder = shuffleWith(Array.from({ length: 24 }, (_, i) => i), freeRng)
        for (const i of searchOrder) {
          const ring = i < 8 ? 1 : 2
          const idx = i < 8 ? i : i - 8
          const dy = ring * Math.floor(idx / 3) - ring
          const dx = ring * (idx % 3) - ring
          const nx = cell.x + dx
          const ny = cell.y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (!slotSet.has(ny * width + nx)) continue
          const other = result[ny][nx]
          if (other === colorId || other < 0) continue
          // 让渡一格后仍 ≥3 颗，避免制造新的小块
          if (localComponentSizeRR(result, slotSet, nx, ny, maxAbsorbSize + 3, width, height) < maxAbsorbSize + 2) continue
          if (trySwapWithGuardsRR(result, target, slotSet, baselineFixed, cell, { x: nx, y: ny }, width, height, maxAbsorbSize)) {
            changed = true
            break
          }
        }
      }
    }
    if (!changed) break
  }

  // 兜底轮：常规吸收后仍有小块时放宽——让渡块 ≥3 颗即可、允许损失少量轮廓
  // （交换仍不得抬升落原位）。轮廓豁免图（主色>0.5）的顽固孤点靠这轮清掉
  for (let round = 0; round < 2; round += 1) {
    const components = collectComponents8(result, slotSet)
    const smalls = components.filter((component) => component.cells.length <= maxAbsorbSize)
    if (smalls.length === 0) break
    let changed = false
    for (const small of smalls) {
      for (const cell of small.cells) {
        const colorId = result[cell.y]?.[cell.x]
        if (typeof colorId !== 'number' || colorId < 0) continue
        if (localComponentSizeRR(result, slotSet, cell.x, cell.y, maxAbsorbSize + 1, width, height) > maxAbsorbSize) continue
        const searchOrder = shuffleWith(Array.from({ length: 24 }, (_, i) => i), freeRng)
        for (const i of searchOrder) {
          const ring = i < 8 ? 1 : 2
          const idx = i < 8 ? i : i - 8
          const dy = ring * Math.floor(idx / 3) - ring
          const dx = ring * (idx % 3) - ring
          const nx = cell.x + dx
          const ny = cell.y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (!slotSet.has(ny * width + nx)) continue
          const other = result[ny][nx]
          if (other === colorId || other < 0) continue
          if (localComponentSizeRR(result, slotSet, nx, ny, maxAbsorbSize + 2, width, height) < maxAbsorbSize + 1) continue
          // 只做落原位守护（放宽轮廓守护）
          const before = result[cell.y][cell.x]
          result[cell.y][cell.x] = other
          result[ny][nx] = before
          const afterFixed = computeFixedCellRatio(result, target)
          if (afterFixed > baselineFixed + 1e-9) {
            result[cell.y][cell.x] = before
            result[ny][nx] = other
            continue
          }
          changed = true
          break
        }
      }
    }
    if (!changed) break
  }
  return result
}

// ============================================================================
// 策略 B：best-fit 最小溢出匹配 + 泛滥上限 + 主导色回家（v2.1，文档 §4.2）
// 对照原型 docs/source/perler_min_overflow_prototype.py 的 recolor_I。
// 解决的问题：大块单色图配额降序让主导色先挑、把轮廓小区域占光，
// 轮廓被主导色淹没（轮廓保留 0.61 → 0.92）。
// ============================================================================

// 回家块取格（文档 §4.2 ①）：取区域内部（离边界最深）的 take 格且连成一片——
// 从最深格 BFS，邻居按深度降序入队，块贴内部生长，边界环留空给异色
const takeInteriorBlock = (
  cells: Set<number>,
  take: number,
  rng: () => number,
  width: number,
  height: number
): number[] => {
  const depth = new Map<number, number>()
  const frontier: number[] = []
  for (const key of cells) {
    const cx = key % width
    const cy = Math.floor(key / width)
    for (const direction of DIRECTIONS) {
      const nx = cx + direction.x
      const ny = cy + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !cells.has(ny * width + nx)) {
        depth.set(key, 0)
        frontier.push(key)
        break
      }
    }
  }
  const queue = [...frontier]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    const cx = current % width
    const cy = Math.floor(current / width)
    for (const direction of DIRECTIONS) {
      const nx = cx + direction.x
      const ny = cy + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nextKey = ny * width + nx
      if (!cells.has(nextKey) || depth.has(nextKey)) continue
      depth.set(nextKey, (depth.get(current) ?? 0) + 1)
      queue.push(nextKey)
    }
  }
  // 最深格作种子（同深度 rng tie-break）
  let seed = -1
  let seedDepth = -1
  for (const key of shuffleWith([...cells], rng)) {
    const d = depth.get(key) ?? 0
    if (d > seedDepth) {
      seedDepth = d
      seed = key
    }
  }
  if (seed < 0) return []
  const taken: number[] = []
  const seen = new Set<number>([seed])
  const growQueue: number[] = [seed]
  while (growQueue.length > 0 && taken.length < take) {
    const current = growQueue.shift()
    if (current === undefined) break
    taken.push(current)
    const cx = current % width
    const cy = Math.floor(current / width)
    const neighbors: number[] = []
    for (const direction of DIRECTIONS) {
      const nx = cx + direction.x
      const ny = cy + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nextKey = ny * width + nx
      if (!cells.has(nextKey) || seen.has(nextKey)) continue
      seen.add(nextKey)
      neighbors.push(nextKey)
    }
    // 深度降序（贴内部长），同深度 rng 抖动
    neighbors.sort((a, b) => ((depth.get(b) ?? 0) - (depth.get(a) ?? 0)) || (rng() - 0.5))
    growQueue.push(...neighbors)
  }
  return taken
}

// 策略 B pass2 切块：种子优先「target≠当前色」的边界格（降低意外落原位），
// 生长同样优先 target≠color 的格子
const slabTakeMatched = (
  cells: Set<number>,
  take: number,
  color: number,
  target: number[][],
  rng: () => number,
  width: number,
  height: number
): number[] => {
  const edgeCells: number[] = []
  for (const key of cells) {
    const cx = key % width
    const cy = Math.floor(key / width)
    for (const direction of DIRECTIONS) {
      const nx = cx + direction.x
      const ny = cy + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !cells.has(ny * width + nx)) {
        edgeCells.push(key)
        break
      }
    }
  }
  const pool = edgeCells.length > 0 ? edgeCells : [...cells]
  const preferred = pool.filter((key) => target[Math.floor(key / width)]?.[key % width] !== color)
  const seedPool = preferred.length > 0 ? preferred : pool
  const seed = seedPool[Math.floor(rng() * seedPool.length)]
  // 主目标惩罚 = 该格目标色是否就是当前色（避落原位）；紧凑项只在同分候选间取舍
  const sameTargetOf = (key: number): number =>
    target[Math.floor(key / width)]?.[key % width] === color ? 1 : 0
  return growCompactBlock(cells, seed, take, rng, width, height, sameTargetOf)
}

// 策略 B 单次生成（文档 §4.2）：泛滥上限与回家 → pass1 best-fit 整组匹配 →
// pass2 延迟切块（危险度降序）。返回原始候选；后处理对 A/B 胜者执行。
const generateRegionRecolorMatchedOnce = (
  source: GridData,
  target: number[][],
  slotSet: Set<number>,
  workGroups: RegionGroup[],
  maxBlockSize: number,
  rng: () => number
): number[][] => {
  const { width, height } = source
  const groups = workGroups.map((group) => ({ id: group.id, tc: group.tc, cells: new Set(group.cells) }))
  const cell2g = new Map<number, number>()
  groups.forEach((group, index) => {
    for (const key of group.cells) cell2g.set(key, index)
  })
  // 组邻接图（pass1 同色邻接约束）
  const gadj = new Map<number, Set<number>>()
  groups.forEach((_, index) => gadj.set(index, new Set()))
  for (const [key, gi] of cell2g) {
    const cx = key % width
    const cy = Math.floor(key / width)
    for (const direction of DIRECTIONS) {
      const nx = cx + direction.x
      const ny = cy + direction.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const other = cell2g.get(ny * width + nx)
      if (other !== undefined && other !== gi) gadj.get(gi)?.add(other)
    }
  }

  const out: number[][] = target.map((row) => [...row])
  const remaining = new Map<number, number>()
  let beads = 0
  for (const key of slotSet) {
    const cx = key % width
    const cy = Math.floor(key / width)
    const colorId = target[cy][cx]
    remaining.set(colorId, (remaining.get(colorId) ?? 0) + 1)
    out[cy][cx] = -1
    beads += 1
  }
  const cap = maxBlockSize > 0 ? maxBlockSize : Number.POSITIVE_INFINITY

  // ① 泛滥上限与回家：homeNeed[c] = max(0, 配额[c] - floor(β × 异色容量))
  for (const [color, colorQuota] of remaining) {
    const floodCap = Math.floor(RR_BETA_FLOOD_CAP * (beads - colorQuota))
    let homeNeed = Math.max(0, colorQuota - floodCap)
    if (homeNeed <= 0) continue
    // 在自己最大的目标区域内部放整块；只占 target==color 的格子（合并组可能含异色格）
    const ownGroups = groups
      .map((group, index) => ({ group, index }))
      .filter(({ group }) => group.tc === color && group.cells.size > 0)
      .sort((a, b) => b.group.cells.size - a.group.cells.size || a.index - b.index)
    for (const { group } of ownGroups) {
      if (homeNeed <= 0) break
      const ownCells = new Set<number>()
      for (const key of group.cells) {
        if (target[Math.floor(key / width)]?.[key % width] === color) ownCells.add(key)
      }
      if (ownCells.size === 0) continue
      const block = takeInteriorBlock(ownCells, Math.min(homeNeed, ownCells.size), rng, width, height)
      for (const key of block) {
        const cx = key % width
        const cy = Math.floor(key / width)
        out[cy][cx] = color
        group.cells.delete(key)
      }
      homeNeed -= block.length
      remaining.set(color, (remaining.get(color) ?? 0) - block.length)
    }
  }

  // ② pass1 整组匹配：组按尺寸降序，每组选 slack = 剩余配额 - 组尺寸 最小者（best-fit）
  const assigned = new Map<number, number>()
  const leftovers: number[] = []
  const pass1Order = shuffleWith(
    groups.map((_, index) => index).filter((index) => groups[index].cells.size > 0),
    rng
  )
  pass1Order.sort((a, b) => groups[b].cells.size - groups[a].cells.size)
  for (const gi of pass1Order) {
    const size = groups[gi].cells.size
    if (size === 0 || size > cap) {
      if (size > 0) leftovers.push(gi)
      continue
    }
    const pickCandidates = (checkAdjacency: boolean): number[] => {
      const result: number[] = []
      for (const [color, rest] of remaining) {
        if (rest < size || groups[gi].tc === color) continue
        if (checkAdjacency) {
          let adjacentSame = false
          for (const neighbor of gadj.get(gi) ?? []) {
            if (assigned.get(neighbor) === color) {
              adjacentSame = true
              break
            }
          }
          if (adjacentSame) continue
        }
        result.push(color)
      }
      return result
    }
    let candidates = pickCandidates(true)
    if (candidates.length === 0) candidates = pickCandidates(false) // 邻接约束无解时放宽
    if (candidates.length === 0) {
      leftovers.push(gi)
      continue
    }
    // best-fit：slack 最小；tie 先剩余配额大者再颜色 id 小者（确定性）
    candidates.sort((a, b) => {
      const slackA = (remaining.get(a) ?? 0) - size
      const slackB = (remaining.get(b) ?? 0) - size
      if (slackA !== slackB) return slackA - slackB
      const restA = remaining.get(a) ?? 0
      const restB = remaining.get(b) ?? 0
      if (restA !== restB) return restB - restA
      return a - b
    })
    const color = candidates[0]
    assigned.set(gi, color)
    for (const key of groups[gi].cells) {
      const cx = key % width
      const cy = Math.floor(key / width)
      out[cy][cx] = color
    }
    groups[gi].cells.clear()
    remaining.set(color, (remaining.get(color) ?? 0) - size)
  }

  // ③ pass2 延迟切块：leftovers 危险度降序（组目标色剩余配额大者优先，趁异色配额未耗尽先填）
  leftovers.sort((a, b) => (remaining.get(groups[b].tc) ?? 0) - (remaining.get(groups[a].tc) ?? 0) || a - b)
  for (const gi of leftovers) {
    while (groups[gi].cells.size > 0) {
      let colorPool = [...remaining.entries()].filter(([color, rest]) => rest > 0 && color !== groups[gi].tc)
      if (colorPool.length === 0) {
        colorPool = [...remaining.entries()].filter(([, rest]) => rest > 0)
      }
      if (colorPool.length === 0) break
      colorPool.sort((a, b) => b[1] - a[1] || a[0] - b[0])
      const color = colorPool[0][0]
      const take = Math.min(remaining.get(color) ?? 0, groups[gi].cells.size, cap)
      const got = slabTakeMatched(groups[gi].cells, take, color, target, rng, width, height)
      if (got.length === 0) break
      for (const key of got) {
        const cx = key % width
        const cy = Math.floor(key / width)
        out[cy][cx] = color
        groups[gi].cells.delete(key)
      }
      remaining.set(color, (remaining.get(color) ?? 0) - got.length)
    }
  }

  // ④ 守恒校验（violation = 实现 bug，直接 throw）
  for (const [color, rest] of remaining) {
    if (rest !== 0) {
      throw new Error(`region recolor matched quota violation: color ${color} remaining ${rest}`)
    }
  }
  for (const key of slotSet) {
    if (out[Math.floor(key / width)][key % width] < 0) {
      throw new Error('region recolor matched unfilled cells')
    }
  }
  return out
}

const evaluateRegionRecolor = (
  out: number[][],
  target: number[][],
  slotSet: Set<number>,
  metricGroups: RegionGroup[],
  allocStrategy: RegionRecolorAllocStrategy
): {
  metrics: RegionRecolorMetrics
  passed: boolean
  score: number
} => {
  const metrics = computeRegionRecolorMetrics(out, target, slotSet, metricGroups, allocStrategy)
  const fixedThreshold = rrAdaptiveFixedThreshold(metrics.fixedFloor)
  const r1 = metrics.contourPreservation >= RR_R1_CONTOUR_PRESERVATION - 1e-9
  const r2 = metrics.smallBlockRatio <= RR_R2_SMALL_BLOCK_RATIO + 1e-9
  const r3 = metrics.greedyTailRun <= RR_R3_GREEDY_TAIL_RUN
  // R4 自适应（文档 v2.1 §5）：≤ max(0.05, fixedFloor + 0.07)
  const r4 = metrics.fixedCellRatio <= fixedThreshold + 1e-9
  const passed = r1 && r2 && r3 && r4
  // 综合分（文档 4.3）：超限项重罚，防止"返回原图"式退化解胜出；fixed 罚项同步用自适应阈值（§5）
  const score = metrics.contourPreservation
    + metrics.regionPurity
    - metrics.smallBlockRatio
    - metrics.greedyTailRun / 10
    - Math.max(0, metrics.fixedCellRatio - fixedThreshold) * 10
  return { metrics, passed, score }
}

// 区域重染色入口（文档 4.1）：拒绝采样，全失败返回综合分最高的一次 + passed:false
export const generateRegionRecolorSortedGrid = (
  source: GridData,
  options: RegionRecolorSortOptions = {}
): RegionRecolorSortResult => {
  const base = cloneGridData(source)
  const { usedSeed } = resolveRng(options.seed)
  const minRegionSize = clampRrMinRegionSize(options.minRegionSize)
  const maxBlockSize = clampRrMaxBlockSize(options.maxBlockSize)
  const maxRetries = clampMaxRetries(options.maxRetries ?? RR_DEFAULT_MAX_RETRIES)

  const buildFallbackMetrics = (slotSet: Set<number>): RegionRecolorMetrics => {
    const groups = buildRegionRecolorGroups(base.colorIndices, slotSet, minRegionSize)
    return computeRegionRecolorMetrics(base.colorIndices, base.colorIndices, slotSet, groups)
  }

  if (base.width <= 0 || base.height <= 0) {
    return {
      grid: base,
      metrics: buildFallbackMetrics(new Set()),
      attempts: 0,
      passed: false,
      usedSeed
    }
  }

  const hasExternalBackgroundMarker = base.colorIndices.some((row) =>
    row.some((value) => value === EXTERNAL_BACKGROUND_INDEX)
  )
  const externalMask = options.inferExternalBackground === false
    ? null
    : getExternalBackgroundMask(base.colorIndices, { backgroundIndex: options.backgroundIndex })
  const sortableMask = externalMask
    ? externalMask.map((row) => row.map((isExternal) => !isExternal))
    : Array.from({ length: base.height }, () => Array(base.width).fill(true))
  const slotSet = buildSlotSetFromMask(base.colorIndices, base.height, base.width, sortableMask)
  if (slotSet.size <= 1) {
    return {
      grid: base,
      metrics: buildFallbackMetrics(slotSet),
      attempts: 0,
      passed: false,
      usedSeed
    }
  }

  const target = base.colorIndices
  // 指标口径用「小区域合并后、maxBlockSize 分片前」的区域组（文档 5.2/5.3 的"区域组"）
  const metricGroups = buildRegionRecolorGroups(target, slotSet, minRegionSize)
  const workGroups = splitRegionGroupsByMaxBlockSize(metricGroups, maxBlockSize, base.width, base.height)
  const fixedFloor = computeFixedFloor(target, slotSet)

  let bestOut: number[][] | null = null
  let bestResult: ReturnType<typeof evaluateRegionRecolor> | null = null
  let attempts = 0

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    attempts = attempt + 1
    const rng = mulberry32((usedSeed + attempt) >>> 0)
    let out: number[][]
    let allocStrategy: RegionRecolorAllocStrategy = 'quota'
    try {
      // 尝试变体轮转：%4==1 反转 pass2 取舍（落原位预算换轮廓）；
      // %4==2 小配额色先填（治末位色孤点）；%4==3 交错 pass1（提拾取数）。
      // 扩大拒绝采样搜索面
      const variant = attempt % 4
      // 双策略（文档 v2.1 §4.3）：每个 attempt 内生成 A（配额倾倒）、B（最小溢出匹配）
      // 两个原始候选再择优，胜者进入后处理与拒绝采样判定
      const outA = generateRegionRecolorOnce(base, target, slotSet, workGroups, maxBlockSize, rng, variant === 1, variant === 2, variant === 3)
      const outB = generateRegionRecolorMatchedOnce(base, target, slotSet, workGroups, maxBlockSize, rng)
      const useMatched = computeContourPreservation(outB, target) >= computeContourPreservation(outA, target) + RR_SWITCH_CONTOUR_GAIN
        && computeFixedCellRatio(outB, target) <= rrAdaptiveFixedThreshold(fixedFloor) + 1e-9
      allocStrategy = useMatched ? 'matched' : 'quota'
      const winner = useMatched ? outB : outA
      // 后处理对胜者执行（v2.1 附录）：B 的回家块是 intentional 预完成格，
      // 不跑落原位消除（reduceFixedCellsRR 会腐蚀回家块）；小块吸收 A/B 共用
      out = useMatched
        ? absorbSmallBlocksRR(winner, target, slotSet, rng, base.width, base.height, 2)
        : absorbSmallBlocksRR(reduceFixedCellsRR(winner, target, slotSet, rng, base.width, base.height), target, slotSet, rng, base.width, base.height, 2)
    } catch (e) {
      // 配额守恒失败（实现 bug）或异常，跳过本次
      if (typeof process !== 'undefined' && process.env?.SA_DEBUG) console.error('[RR_DEBUG] attempt', attempt, e)
      continue
    }
    const result = evaluateRegionRecolor(out, target, slotSet, metricGroups, allocStrategy)
    if (typeof process !== 'undefined' && process.env?.SA_DEBUG) {
      const m = result.metrics
      console.error(`[RR_DEBUG] attempt ${attempt} variant=${attempt % 4} strategy=${allocStrategy} passed=${result.passed} score=${result.score.toFixed(3)} R1=${m.contourPreservation.toFixed(3)} R2=${m.smallBlockRatio.toFixed(3)} R3=${m.greedyTailRun} R4=${m.fixedCellRatio.toFixed(3)} floor=${m.fixedFloor.toFixed(3)}`)
    }
    // passed 优先于综合分：通过硬约束的一次必须胜过此前未通过的高分次
    if (!bestResult
      || (result.passed && !bestResult.passed)
      || (result.passed === bestResult.passed && result.score > bestResult.score)) {
      bestOut = out
      bestResult = result
    }
    if (result.passed) break
  }

  // normalize 外部背景后处理（复用旧路径模式）
  const hasExplicitBackgroundIndex = options.backgroundIndex !== null && options.backgroundIndex !== undefined
  if (options.normalizeExternalBackground && (hasExternalBackgroundMarker || hasExplicitBackgroundIndex) && externalMask && bestOut) {
    for (let y = 0; y < externalMask.length; y += 1) {
      for (let x = 0; x < (externalMask[y]?.length ?? 0); x += 1) {
        if (externalMask[y][x]) {
          bestOut[y][x] = EXTERNAL_BACKGROUND_INDEX
        }
      }
    }
  }

  return {
    grid: { ...base, colorIndices: bestOut ?? base.colorIndices },
    metrics: bestResult?.metrics ?? buildFallbackMetrics(slotSet),
    attempts,
    passed: bestResult?.passed ?? false,
    usedSeed
  }
}
