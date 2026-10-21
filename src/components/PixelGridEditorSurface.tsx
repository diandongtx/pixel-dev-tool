import { t } from '../i18n'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ColorPalette } from './ColorPalette'
import type { RGBColor } from '../types/grid'

export interface IndexedColor {
  id: number
  color: RGBColor
  lab: [number, number, number]
}

export type GridEditTool = 'paint' | 'erase' | 'moveSubject'

interface HistorySnapshot {
  gridIndexMap: number[][]
  indexedColors: IndexedColor[]
  activeIndexId: number | null
}

interface Point {
  x: number
  y: number
}

export interface SubjectBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const CANVAS_MAX_SIZE = 512

export interface PixelGridEditorSurfaceProps {
  gridIndexMap: number[][]
  indexedColors: IndexedColor[]
  activeIndexId: number | null
  currentColor: string
  recentColors: string[]
  showColorPalette: boolean
  showBackgroundColorPalette?: boolean
  backgroundColor?: string
  isPickingColor: boolean
  gridEditTool: GridEditTool
  gridSize: number
  /** 外部背景色的索引 id：主体拖动与画布扩边都用它判定/填充；null=无背景（空位用 -2） */
  backgroundIndex?: number | null
  originalImageSrc?: string | null
  toolbarBefore?: React.ReactNode
  toolbarAfter?: React.ReactNode
  sourceCanvasRef?: React.RefObject<HTMLCanvasElement | null>
  processedCanvasRef?: React.RefObject<HTMLCanvasElement | null>
  onGridIndexMapChange: (nextGridIndexMap: number[][]) => void
  onIndexedColorsChange: (nextIndexedColors: IndexedColor[]) => void
  onActiveIndexIdChange: (nextActiveIndexId: number | null) => void
  onCurrentColorChange: (nextCurrentColor: string) => void
  onRecentColorsChange: (nextRecentColors: string[]) => void
  onShowColorPaletteChange: (nextShowColorPalette: boolean) => void
  onShowBackgroundColorPaletteChange?: (nextShowBackgroundColorPalette: boolean) => void
  onBackgroundColorChange?: (nextBackgroundColor: string) => void
  onPickingColorChange: (nextIsPickingColor: boolean) => void
  onGridEditToolChange: (nextTool: GridEditTool) => void
}

const GRID_LINE_WIDTH = 0.5

const setRefValue = <T,>(ref: React.RefObject<T | null> | undefined, value: T | null) => {
  if (!ref) return
  ;(ref as React.MutableRefObject<T | null>).current = value
}

const clampSampleCoordinate = (value: number, maxExclusive: number): number =>
  Math.min(Math.max(Math.floor(value), 0), Math.max(0, maxExclusive - 1))

const parseCssColor = (value: string): RGBColor | null => {
  const normalized = value.trim()
  const match = normalized.match(/^rgba?\(([^)]+)\)$/i)
  if (!match) return null

  const parts = match[1].split(',').map((part) => part.trim())
  if (parts.length < 3) return null

  const r = Number(parts[0])
  const g = Number(parts[1])
  const b = Number(parts[2])
  const alphaValue = parts[3] === undefined ? 1 : Number(parts[3])

  if ([r, g, b, alphaValue].some((part) => !Number.isFinite(part))) return null

  return {
    r: clampSampleCoordinate(r, 256),
    g: clampSampleCoordinate(g, 256),
    b: clampSampleCoordinate(b, 256),
    a: Math.min(Math.max(Math.round(alphaValue * 255), 0), 255),
  }
}

const getColorFromBackground = (element: HTMLElement): RGBColor | null => {
  let current: HTMLElement | null = element

  while (current) {
    const parsed = parseCssColor(window.getComputedStyle(current).backgroundColor)
    if (parsed && parsed.a > 0) {
      return parsed
    }
    current = current.parentElement
  }

  return null
}

export const cloneGridIndexMap = (map: number[][]): number[][] => map.map((row) => [...row])

export const cloneIndexedColors = (palette: IndexedColor[]): IndexedColor[] => palette.map((item) => ({
  ...item,
  color: { ...item.color },
  lab: [...item.lab] as [number, number, number],
}))

const isSameRgbColor = (left: RGBColor, right: RGBColor): boolean => (
  left.r === right.r && left.g === right.g && left.b === right.b
)

// 主体 = 有颜色的格子（索引 >= 0）且不等于外部背景色索引
export const buildSubjectMask = (
  colorIndices: number[][],
  backgroundIndex: number | null
): boolean[][] => colorIndices.map((row) => row.map((value) => (
  value >= 0 && value !== backgroundIndex
)))

export const getSubjectBounds = (mask: boolean[][]): SubjectBounds | null => {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let y = 0; y < mask.length; y += 1) {
    for (let x = 0; x < mask[y].length; x += 1) {
      if (!mask[y][x]) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return null
  return { minX, minY, maxX, maxY }
}

// 位移钳制：主体包围盒不许拖出画布，避免拖丢像素
export const clampSubjectOffset = (
  bounds: SubjectBounds | null,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number
): Point => {
  if (!bounds) return { x: 0, y: 0 }
  return {
    x: Math.min(Math.max(offsetX, -bounds.minX), width - 1 - bounds.maxX),
    y: Math.min(Math.max(offsetY, -bounds.minY), height - 1 - bounds.maxY),
  }
}

// 整体平移主体：原位置填 fillValue（背景色索引或 -2 空位）；位移已被钳制在画布内，越界判断只是兜底
export const applySubjectOffset = (
  colorIndices: number[][],
  mask: boolean[][],
  offset: Point,
  fillValue: number
): number[][] => {
  const height = colorIndices.length
  const width = height > 0 ? colorIndices[0].length : 0
  if (width === 0 || height === 0) return colorIndices
  const next = colorIndices.map((row, y) => row.map((value, x) => (
    mask[y][x] ? fillValue : value
  )))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y][x]) continue
      const targetY = y + offset.y
      const targetX = x + offset.x
      if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue
      next[targetY][targetX] = colorIndices[y][x]
    }
  }
  return next
}

// 画布尺寸调整：左上角锚定，扩边填 fillValue，缩边裁掉右侧/下侧
export const resizeGridIndexMap = (
  colorIndices: number[][],
  nextWidth: number,
  nextHeight: number,
  fillValue: number
): number[][] => Array.from({ length: nextHeight }, (_, y) => (
  Array.from({ length: nextWidth }, (_, x) => (
    colorIndices[y]?.[x] ?? fillValue
  ))
))

const srgbToLinear = (channel: number): number => {
  const normalized = channel / 255
  if (normalized <= 0.04045) {
    return normalized / 12.92
  }
  return ((normalized + 0.055) / 1.055) ** 2.4
}

export const rgbToLab = (color: RGBColor): [number, number, number] => {
  const r = srgbToLinear(color.r)
  const g = srgbToLinear(color.g)
  const b = srgbToLinear(color.b)

  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883

  const fx = x > 0.008856 ? Math.cbrt(x) : (7.787 * x) + (16 / 116)
  const fy = y > 0.008856 ? Math.cbrt(y) : (7.787 * y) + (16 / 116)
  const fz = z > 0.008856 ? Math.cbrt(z) : (7.787 * z) + (16 / 116)

  const l = (116 * fy) - 16
  const a = 500 * (fx - fy)
  const bValue = 200 * (fy - fz)
  return [l, a, bValue]
}

export const rgbToCss = (color: RGBColor): string => `rgb(${color.r}, ${color.g}, ${color.b})`

export const rgbToHex = (color: RGBColor): string => {
  const toHex = (value: number) => value.toString(16).padStart(2, '0')
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

export const hexToRgb = (hex: string): RGBColor | null => {
  const normalized = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: 255,
  }
}

export const normalizeIndexedState = (
  map: number[][],
  palette: IndexedColor[],
  preferredActiveId: number | null,
) => {
  const usedIds = new Set<number>()
  for (const row of map) {
    for (const indexId of row) {
      if (indexId < 0) continue
      usedIds.add(indexId)
    }
  }

  const sortedUsedIds = Array.from(usedIds).sort((a, b) => a - b)
  const remap = new Map<number, number>()
  sortedUsedIds.forEach((oldId, newId) => remap.set(oldId, newId))

  const normalizedMap = map.map((row) => row.map((indexId) => (
    indexId < 0 ? indexId : remap.get(indexId) ?? indexId
  )))
  const paletteById = new Map<number, IndexedColor>()
  palette.forEach((item) => paletteById.set(item.id, item))
  const normalizedPalette = sortedUsedIds.map((oldId, newId) => {
    const source = paletteById.get(oldId)
    if (source) {
      return {
        id: newId,
        color: { ...source.color },
        lab: [...source.lab] as [number, number, number],
      }
    }
    const fallback: RGBColor = { r: 0, g: 0, b: 0, a: 255 }
    return {
      id: newId,
      color: fallback,
      lab: rgbToLab(fallback),
    }
  })

  const normalizedActive = preferredActiveId !== null && preferredActiveId >= 0
    ? (remap.get(preferredActiveId) ?? null)
    : null

  return {
    gridIndexMap: normalizedMap,
    indexedColors: normalizedPalette,
    activeIndexId: normalizedActive,
  }
}

export function PixelGridEditorSurface({
  gridIndexMap,
  indexedColors,
  activeIndexId,
  currentColor,
  recentColors,
  showColorPalette,
  showBackgroundColorPalette = false,
  backgroundColor,
  isPickingColor,
  gridEditTool,
  gridSize,
  backgroundIndex = null,
  originalImageSrc = null,
  toolbarBefore,
  toolbarAfter,
  sourceCanvasRef,
  processedCanvasRef,
  onGridIndexMapChange,
  onIndexedColorsChange,
  onActiveIndexIdChange,
  onCurrentColorChange,
  onRecentColorsChange,
  onShowColorPaletteChange,
  onShowBackgroundColorPaletteChange,
  onBackgroundColorChange,
  onPickingColorChange,
  onGridEditToolChange,
}: PixelGridEditorSurfaceProps) {
  const internalProcessedCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const indexPanelRef = useRef<HTMLDivElement>(null)
  const indexListRef = useRef<HTMLDivElement>(null)
  const backgroundPaletteRef = useRef<HTMLDivElement>(null)
  const backgroundButtonRef = useRef<HTMLButtonElement>(null)
  const draggedIndexIdRef = useRef<number | null>(null)
  const subjectDragStartRef = useRef<Point | null>(null)
  const subjectDragOffsetRef = useRef<Point | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [subjectDragOffset, setSubjectDragOffset] = useState<Point | null>(null)
  const [hexInput, setHexInput] = useState('#000000')
  const [canvasWidthInput, setCanvasWidthInput] = useState('')
  const [canvasHeightInput, setCanvasHeightInput] = useState('')
  const [indexColorHistory, setIndexColorHistory] = useState<HistorySnapshot[]>([])
  const [colorPickTarget, setColorPickTarget] = useState<'paint' | 'index' | 'background'>('paint')

  const width = gridIndexMap[0]?.length ?? 0
  const height = gridIndexMap.length
  const activeCanvasRef = processedCanvasRef ?? internalProcessedCanvasRef
  const canEditBackgroundColor = typeof backgroundColor === 'string'
    && typeof onBackgroundColorChange === 'function'
    && typeof onShowBackgroundColorPaletteChange === 'function'
  const indexedColorHexOptions = useMemo(
    () => indexedColors.map((item) => rgbToHex(item.color)),
    [indexedColors]
  )

  const indexUsageCount = useMemo(() => {
    const counts = new Map<number, number>()
    for (const row of gridIndexMap) {
      for (const indexId of row) {
        counts.set(indexId, (counts.get(indexId) ?? 0) + 1)
      }
    }
    return counts
  }, [gridIndexMap])

  const subjectMask = useMemo(
    () => buildSubjectMask(gridIndexMap, backgroundIndex),
    [gridIndexMap, backgroundIndex]
  )
  const subjectFillValue = backgroundIndex ?? -2
  const isMoveSubjectTool = gridEditTool === 'moveSubject'
  const displayGridIndexMap = useMemo(
    () => subjectDragOffset
      ? applySubjectOffset(gridIndexMap, subjectMask, subjectDragOffset, subjectFillValue)
      : gridIndexMap,
    [gridIndexMap, subjectDragOffset, subjectMask, subjectFillValue]
  )

  useEffect(() => {
    setCanvasWidthInput(width > 0 ? String(width) : '')
    setCanvasHeightInput(height > 0 ? String(height) : '')
  }, [width, height])

  useEffect(() => {
    const tempCanvas = document.createElement('canvas')
    tempCanvas.style.display = 'none'
    document.body.appendChild(tempCanvas)
    tempCanvasRef.current = tempCanvas
    return () => {
      document.body.removeChild(tempCanvas)
    }
  }, [])

  useEffect(() => {
    if (activeIndexId === null) {
      setHexInput('#000000')
      return
    }
    const selected = indexedColors.find((item) => item.id === activeIndexId)
    if (selected) {
      setHexInput(rgbToHex(selected.color))
    }
  }, [activeIndexId, indexedColors])

  useEffect(() => {
    const canvas = activeCanvasRef.current
    if (!canvas || width === 0 || height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = width * gridSize
    canvas.height = height * gridSize
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineWidth = GRID_LINE_WIDTH

    const colorMap = new Map<number, IndexedColor>()
    indexedColors.forEach((item) => colorMap.set(item.id, item))

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const indexId = displayGridIndexMap[y][x]
        const color = colorMap.get(indexId)
        if (!color) continue
        const offset = activeIndexId === indexId ? -gridSize / 2 : 0
        const drawX = x * gridSize
        const drawY = (y * gridSize) + offset
        ctx.fillStyle = rgbToCss(color.color)
        ctx.fillRect(drawX, drawY, gridSize, gridSize)
        ctx.strokeStyle = '#000'
        ctx.strokeRect(drawX, drawY, gridSize, gridSize)
      }
    }
  }, [activeCanvasRef, activeIndexId, displayGridIndexMap, gridSize, height, indexedColors, width])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        event.preventDefault()
        onPickingColorChange(true)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        onPickingColorChange(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [onPickingColorChange])

  const emitIndexedState = (nextState: {
    gridIndexMap: number[][]
    indexedColors: IndexedColor[]
    activeIndexId: number | null
  }) => {
    onGridIndexMapChange(nextState.gridIndexMap)
    onIndexedColorsChange(nextState.indexedColors)
    onActiveIndexIdChange(nextState.activeIndexId)
  }

  const addToRecentColors = useCallback((color: string) => {
    const filtered = recentColors.filter((item) => item !== color)
    onRecentColorsChange([color, ...filtered].slice(0, 10))
  }, [onRecentColorsChange, recentColors])

  const pushHistorySnapshot = () => {
    setIndexColorHistory((previous) => [
      {
        gridIndexMap: cloneGridIndexMap(gridIndexMap),
        indexedColors: cloneIndexedColors(indexedColors),
        activeIndexId,
      },
      ...previous,
    ].slice(0, 50))
  }

  const applyIndexColor = (
    indexId: number,
    nextColor: RGBColor,
    options?: { promptOnDuplicate?: boolean },
  ) => {
    const duplicateColor = indexedColors.find((item) => item.id !== indexId && isSameRgbColor(item.color, nextColor))
    const shouldPromptOnDuplicate = options?.promptOnDuplicate ?? true
    const shouldMerge = duplicateColor && shouldPromptOnDuplicate
      ? window.confirm(t("当前颜色与已有索引色重复，是否合并？"))
      : false

    pushHistorySnapshot()

    if (duplicateColor && shouldMerge) {
      const mergedMap = gridIndexMap.map((row) => row.map((value) => (value === indexId ? duplicateColor.id : value)))
      const mergedPalette = indexedColors.map((item) => {
        if (item.id === duplicateColor.id) {
          return {
            ...item,
            color: { ...duplicateColor.color, a: 255 },
            lab: rgbToLab(duplicateColor.color),
          }
        }
        return item
      })
      emitIndexedState(normalizeIndexedState(mergedMap, mergedPalette, duplicateColor.id))
      return
    }

    onIndexedColorsChange(indexedColors.map((item) => {
      if (item.id !== indexId) return item
      return {
        ...item,
        color: { ...nextColor, a: 255 },
        lab: rgbToLab(nextColor),
      }
    }))
  }

  const mergeIndexedColors = (sourceIndexId: number, targetIndexId: number) => {
    if (sourceIndexId === targetIndexId) return

    const sourceExists = indexedColors.some((item) => item.id === sourceIndexId)
    const targetExists = indexedColors.some((item) => item.id === targetIndexId)
    if (!sourceExists || !targetExists) return

    pushHistorySnapshot()
    const mergedMap = gridIndexMap.map((row) => row.map((value) => (
      value === sourceIndexId ? targetIndexId : value
    )))
    emitIndexedState(normalizeIndexedState(mergedMap, indexedColors, targetIndexId))
  }

  const handleUndo = () => {
    if (indexColorHistory.length === 0) return
    const [latest, ...rest] = indexColorHistory
    onGridIndexMapChange(cloneGridIndexMap(latest.gridIndexMap))
    onIndexedColorsChange(cloneIndexedColors(latest.indexedColors))
    onActiveIndexIdChange(latest.activeIndexId)
    setIndexColorHistory(rest)
  }

  const applyHexInputToActiveColor = () => {
    if (activeIndexId === null) return
    const parsed = hexToRgb(hexInput)
    if (!parsed) return
    applyIndexColor(activeIndexId, parsed, { promptOnDuplicate: true })
  }

  const upsertIndexedColor = (palette: IndexedColor[], color: RGBColor) => {
    const found = palette.find((item) => item.color.r === color.r && item.color.g === color.g && item.color.b === color.b)
    if (found) {
      return { indexId: found.id, palette }
    }
    const nextId = palette.length
    const nextPalette = [
      ...palette,
      {
        id: nextId,
        color: { ...color, a: 255 },
        lab: rgbToLab(color),
      },
    ]
    return { indexId: nextId, palette: nextPalette }
  }

  const getGridPointFromMouse = (event: React.MouseEvent<HTMLCanvasElement>): Point | null => {
    const canvas = activeCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.floor((event.clientX - rect.left) * scaleX / gridSize)
    const y = Math.floor((event.clientY - rect.top) * scaleY / gridSize)
    if (x < 0 || y < 0 || x >= width || y >= height) return null
    return { x, y }
  }

  const applyCurrentColorToCell = (point: Point, tool: GridEditTool) => {
    if (tool === 'erase') {
      const nextMap = gridIndexMap.map((row, rowIndex) => {
        if (rowIndex !== point.y) return row
        const nextRow = [...row]
        nextRow[point.x] = -2
        return nextRow
      })
      emitIndexedState(normalizeIndexedState(nextMap, indexedColors, activeIndexId))
      return
    }

    const color = hexToRgb(currentColor)
    if (!color) return
    const { indexId, palette } = upsertIndexedColor(indexedColors, color)
    const nextMap = gridIndexMap.map((row, rowIndex) => {
      if (rowIndex !== point.y) return row
      const nextRow = [...row]
      nextRow[point.x] = indexId
      return nextRow
    })
    emitIndexedState(normalizeIndexedState(nextMap, palette, activeIndexId))
  }

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPickingColor) return
    const point = getGridPointFromMouse(event)
    if (!point) return
    pushHistorySnapshot()
    setIsDrawing(true)
    if (isMoveSubjectTool) {
      subjectDragStartRef.current = point
      subjectDragOffsetRef.current = { x: 0, y: 0 }
      setSubjectDragOffset({ x: 0, y: 0 })
      return
    }
    applyCurrentColorToCell(point, gridEditTool)
  }

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPickingColor) return
    if (isMoveSubjectTool) {
      const start = subjectDragStartRef.current
      if (!start) return
      const point = getGridPointFromMouse(event)
      if (!point) return
      const next = clampSubjectOffset(
        getSubjectBounds(subjectMask),
        width,
        height,
        point.x - start.x,
        point.y - start.y
      )
      const previous = subjectDragOffsetRef.current
      if (previous && previous.x === next.x && previous.y === next.y) return
      subjectDragOffsetRef.current = next
      setSubjectDragOffset(next)
      return
    }
    if (!isDrawing) return
    const point = getGridPointFromMouse(event)
    if (!point) return
    applyCurrentColorToCell(point, gridEditTool)
  }

  const finishSubjectDrag = (commit: boolean) => {
    const offset = subjectDragOffsetRef.current
    subjectDragStartRef.current = null
    subjectDragOffsetRef.current = null
    setSubjectDragOffset(null)
    setIsDrawing(false)
    if (!commit || !offset || (offset.x === 0 && offset.y === 0)) return
    onGridIndexMapChange(applySubjectOffset(gridIndexMap, subjectMask, offset, subjectFillValue))
  }

  const handleCanvasMouseUp = () => {
    if (subjectDragStartRef.current) {
      finishSubjectDrag(true)
      return
    }
    setIsDrawing(false)
  }

  const handleCanvasMouseLeave = () => {
    if (subjectDragStartRef.current) {
      finishSubjectDrag(false)
      return
    }
    setIsDrawing(false)
  }

  const handleApplyCanvasSize = () => {
    if (width === 0 || height === 0) return
    const parsedWidth = Number.parseInt(canvasWidthInput, 10)
    const parsedHeight = Number.parseInt(canvasHeightInput, 10)
    if (!Number.isInteger(parsedWidth) || !Number.isInteger(parsedHeight)) return
    const nextWidth = Math.min(Math.max(parsedWidth, 1), CANVAS_MAX_SIZE)
    const nextHeight = Math.min(Math.max(parsedHeight, 1), CANVAS_MAX_SIZE)
    if (nextWidth === width && nextHeight === height) {
      setCanvasWidthInput(String(nextWidth))
      setCanvasHeightInput(String(nextHeight))
      return
    }
    pushHistorySnapshot()
    onGridIndexMapChange(resizeGridIndexMap(gridIndexMap, nextWidth, nextHeight, subjectFillValue))
  }

  const handlePaletteColorChange = (color: string) => {
    onCurrentColorChange(color)
    onGridEditToolChange('paint')
    addToRecentColors(color)
  }

  const handleBackgroundColorChange = useCallback((color: string) => {
    if (!onBackgroundColorChange) return
    onBackgroundColorChange(color)
    addToRecentColors(color)
  }, [addToRecentColors, onBackgroundColorChange])

  const getColorFromElement = useCallback((element: HTMLElement, x: number, y: number): RGBColor | null => {
    const tempCanvas = tempCanvasRef.current
    if (!tempCanvas) return null

    try {
      if (element instanceof HTMLCanvasElement) {
        const ctx = element.getContext('2d')
        if (!ctx) return null
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return null

        const sampleX = clampSampleCoordinate(x * (element.width / rect.width), element.width)
        const sampleY = clampSampleCoordinate(y * (element.height / rect.height), element.height)
        const imageData = ctx.getImageData(sampleX, sampleY, 1, 1)
        return {
          r: imageData.data[0],
          g: imageData.data[1],
          b: imageData.data[2],
          a: 255,
        }
      }
      if (element instanceof HTMLImageElement) {
        const tempCtx = tempCanvas.getContext('2d')
        if (!tempCtx) return null
        tempCanvas.width = element.naturalWidth
        tempCanvas.height = element.naturalHeight
        tempCtx.drawImage(element, 0, 0)
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return null
        const scaleX = element.naturalWidth / rect.width
        const scaleY = element.naturalHeight / rect.height
        const sampleX = clampSampleCoordinate(x * scaleX, element.naturalWidth)
        const sampleY = clampSampleCoordinate(y * scaleY, element.naturalHeight)
        const imageData = tempCtx.getImageData(sampleX, sampleY, 1, 1)
        return {
          r: imageData.data[0],
          g: imageData.data[1],
          b: imageData.data[2],
          a: 255,
        }
      }
      return getColorFromBackground(element)
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (isPickingColor) {
        event.preventDefault()
        event.stopPropagation()
        const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
        if (!element) {
          onPickingColorChange(false)
          return
        }
        const rect = element.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        const pickedColor = getColorFromElement(element, x, y)
        if (pickedColor) {
          const pickedHex = rgbToHex(pickedColor)
          if (colorPickTarget === 'background') {
            handleBackgroundColorChange(pickedHex)
          } else if (activeIndexId !== null) {
            setHexInput(rgbToHex(pickedColor))
          } else {
            onCurrentColorChange(pickedHex)
            addToRecentColors(pickedHex)
          }
        }
        setColorPickTarget('paint')
        onPickingColorChange(false)
        return
      }
      if (showBackgroundColorPalette) {
        const clickedInsideBackgroundPalette = backgroundPaletteRef.current?.contains(target) ?? false
        const clickedBackgroundButton = backgroundButtonRef.current?.contains(target) ?? false
        if (clickedInsideBackgroundPalette || clickedBackgroundButton) return
        onShowBackgroundColorPaletteChange?.(false)
      }
      if (activeIndexId === null) return
      if (indexPanelRef.current?.contains(target)) return
      if (indexListRef.current?.contains(target)) return
      onActiveIndexIdChange(null)
      onPickingColorChange(false)
    }
    document.addEventListener('mousedown', handleDocumentMouseDown, true)
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown, true)
    }
  }, [
    activeIndexId,
    addToRecentColors,
    colorPickTarget,
    getColorFromElement,
    onShowBackgroundColorPaletteChange,
    handleBackgroundColorChange,
    isPickingColor,
    onActiveIndexIdChange,
    onCurrentColorChange,
    onPickingColorChange,
    showBackgroundColorPalette,
  ])

  return (
    <>
      <style>{`
        .canvas-size-controls {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .canvas-size-controls label {
          font-size: 13px;
          color: #334155;
        }
        .canvas-size-controls input {
          width: 64px;
          padding: 6px 8px;
          border: 1px solid #ccd3df;
          border-radius: 6px;
        }
      `}</style>
      <div className="controls">
        {toolbarBefore}
        <button
          type="button"
          onClick={() => {
            onShowColorPaletteChange(!showColorPalette)
            if (!showColorPalette) {
              onShowBackgroundColorPaletteChange?.(false)
            }
          }}
          className={showColorPalette ? 'active' : ''}
        >{t("🎨 调色板")}</button>
        <button
          type="button"
          data-testid="pixel-eraser-tool"
          onClick={() => onGridEditToolChange(gridEditTool === 'erase' ? 'paint' : 'erase')}
          className={gridEditTool === 'erase' ? 'active' : ''}
          title={t("橡皮：擦除为 -2 空位")}
        >{t("橡皮")}</button>
        <button
          type="button"
          data-testid="pixel-move-subject-tool"
          onClick={() => onGridEditToolChange(gridEditTool === 'moveSubject' ? 'paint' : 'moveSubject')}
          className={isMoveSubjectTool ? 'active' : ''}
          title={t("移动主体：按住拖动即可整体平移非背景色块，松手生效，可撤销")}
        >{t("移动主体")}</button>
        {canEditBackgroundColor && (
          <button
            ref={backgroundButtonRef}
            type="button"
            data-testid="pixel-background-color-tool"
            onClick={() => {
              onShowBackgroundColorPaletteChange?.(!showBackgroundColorPalette)
              if (!showBackgroundColorPalette) {
                onShowColorPaletteChange(false)
              }
            }}
            className={showBackgroundColorPalette ? 'active background-color-tool' : 'background-color-tool'}
            title={t("背景色：设置画布背景色（已有背景则替换，没有则新增并填充空位）")}
          >
            <span>{t("背景色")}</span>
            <span className="background-color-preview" style={{ backgroundColor }} />
          </button>
        )}
        <span className="canvas-size-controls" data-testid="canvas-size-controls">
          <label htmlFor="canvas-width-input">{t("画布")}</label>
          <input
            id="canvas-width-input"
            type="number"
            min={1}
            max={CANVAS_MAX_SIZE}
            data-testid="canvas-width-input"
            value={canvasWidthInput}
            onChange={(event) => setCanvasWidthInput(event.target.value)}
            disabled={width === 0 || height === 0}
          />
          <span aria-hidden="true">×</span>
          <input
            id="canvas-height-input"
            type="number"
            min={1}
            max={CANVAS_MAX_SIZE}
            data-testid="canvas-height-input"
            value={canvasHeightInput}
            onChange={(event) => setCanvasHeightInput(event.target.value)}
            disabled={width === 0 || height === 0}
          />
          <button
            type="button"
            data-testid="canvas-resize-apply"
            onClick={handleApplyCanvasSize}
            disabled={width === 0 || height === 0}
            title={t("调整画布格子数：左上角锚定，扩边用背景色填充，缩边裁掉右侧/下侧")}
          >{t("调整尺寸")}</button>
        </span>
        {toolbarAfter}
      </div>

      {showColorPalette && (
        <div className="color-palette-container">
          <ColorPalette
            currentColor={currentColor}
            onColorChange={handlePaletteColorChange}
            recentColors={recentColors}
          />
          <div className="panel-tip">{t("提示：按住 Alt 键并点击可从画布或图片吸色")}</div>
        </div>
      )}

      {canEditBackgroundColor && showBackgroundColorPalette && (
        <div className="color-palette-container background-color-palette-container" ref={backgroundPaletteRef}>
          <ColorPalette
            currentColor={backgroundColor}
            onColorChange={handleBackgroundColorChange}
            recentColors={recentColors}
            defaultColors={indexedColorHexOptions}
            defaultColorsTitle={t("索引色")}
          />
          <button
            type="button"
            className="screen-pick-button"
            onClick={() => {
              setColorPickTarget('background')
              onPickingColorChange(true)
            }}
          >{t("屏幕取色")}</button>
          <div className="panel-tip">{t("提示：点击「索引色」＝指定该颜色为背景判断依据；选择其他新颜色＝设置背景色（已有背景则替换，没有则新增并填满空位）")}</div>
        </div>
      )}

      <div className="canvases">
        <div className="canvas-panel">
          <h3>{t("原始图片")}</h3>
          <canvas ref={(node) => setRefValue(sourceCanvasRef, node)} style={{ display: 'none' }} />
          {originalImageSrc && (
            <img
              src={originalImageSrc}
              alt="Selected"
              style={{
                maxWidth: '100%',
                height: 'auto',
                cursor: isPickingColor ? 'crosshair' : 'default',
              }}
            />
          )}
        </div>

        <div className="canvas-panel">
          <h3>{t("处理后的网格")}</h3>
          <canvas
            ref={(node) => {
              internalProcessedCanvasRef.current = node
              setRefValue(processedCanvasRef, node)
            }}
            data-testid="pixel-grid-canvas"
            style={{
              border: '1px solid black',
              maxWidth: '100%',
              height: 'auto',
              cursor: isPickingColor
                ? 'crosshair'
                : isMoveSubjectTool
                  ? 'move'
                  : gridEditTool === 'erase'
                    ? 'cell'
                    : 'pointer',
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseLeave}
          />
        </div>
      </div>

      <div className="color-info">
        <h3>{t("索引色显示")}</h3>
        <div className="indexed-colors" ref={indexListRef}>
          {indexedColors.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`index-item ${activeIndexId === item.id ? 'active' : ''}`}
              draggable
              onClick={() => onActiveIndexIdChange(item.id)}
              onDragStart={() => {
                draggedIndexIdRef.current = item.id
              }}
              onDragOver={(event) => {
                event.preventDefault()
              }}
              onDragEnter={(event) => {
                if (draggedIndexIdRef.current !== null && draggedIndexIdRef.current !== item.id) {
                  event.currentTarget.classList.add('drag-target')
                }
              }}
              onDragLeave={(event) => {
                event.currentTarget.classList.remove('drag-target')
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.currentTarget.classList.remove('drag-target')
                const sourceIndexId = draggedIndexIdRef.current
                draggedIndexIdRef.current = null
                if (sourceIndexId === null) return
                mergeIndexedColors(sourceIndexId, item.id)
              }}
              onDragEnd={() => {
                draggedIndexIdRef.current = null
              }}
            >
              <div className="index-color-preview" style={{ backgroundColor: rgbToCss(item.color) }} />
              <span className="index-item-text">
                ID: {item.id}{' '}{t("数量:")}{' '}{indexUsageCount.get(item.id) ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeIndexId !== null && (
        <div className="index-panel" ref={indexPanelRef}>
          <h4>{t("索引色设置")}</h4>
          <div className="panel-row">
            <label>HEX</label>
            <input
              type="text"
              value={hexInput}
              onChange={(event) => setHexInput(event.target.value)}
            />
          </div>
          <div className="panel-row">
            <label>{t("色块")}</label>
            <input
              type="color"
              value={hexToRgb(hexInput) ? hexInput : '#000000'}
              onChange={(event) => setHexInput(event.target.value)}
            />
          </div>
          <div className="panel-actions">
            <button type="button" onClick={applyHexInputToActiveColor}>{t("应用颜色")}</button>
            <button
              type="button"
              onClick={() => {
                setColorPickTarget('index')
                onPickingColorChange(true)
              }}
            >{t("屏幕取色")}</button>
            <button type="button" onClick={handleUndo} disabled={indexColorHistory.length === 0}>{t("撤销")}</button>
          </div>
          <div className="panel-tip">{t("提示：可按住 Alt 进入取色，点击空白区域关闭面板并复位高亮")}</div>
        </div>
      )}

      {isPickingColor && (
        <div className="color-picker-status">{t("颜色选择模式（点击任意画布或图片取色）")}</div>
      )}
    </>
  )
}
