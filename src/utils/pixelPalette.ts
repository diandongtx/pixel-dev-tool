import type { RGBColor } from '../types/grid'
import type { PixelPaletteFile, PixelPaletteItem } from '../types/pixelPalette'

export const createEmptyPixelPaletteFile = (): PixelPaletteFile => ({
  version: 1,
  items: []
})

export const normalizePaletteColors = (colors: RGBColor[]): RGBColor[] =>
  colors.map((color) => ({
    r: Number(color.r),
    g: Number(color.g),
    b: Number(color.b),
    a: Number.isFinite(Number(color.a)) ? Number(color.a) : 255
  }))

export const findPixelPaletteItem = (
  palettes: PixelPaletteFile,
  pixelImageId: number,
  name: string
): PixelPaletteItem | null =>
  palettes.items.find((item) => item.pixelImageId === pixelImageId)
    ?? palettes.items.find((item) => item.name === name)
    ?? null

export const upsertPixelPaletteItem = (
  palettes: PixelPaletteFile,
  item: Omit<PixelPaletteItem, 'colors'> & { colors: RGBColor[] }
): PixelPaletteFile => {
  const nextItem: PixelPaletteItem = {
    ...item,
    colors: normalizePaletteColors(item.colors)
  }
  const nextItems = palettes.items.map((existing) => ({
    ...existing,
    colors: normalizePaletteColors(existing.colors)
  }))
  const existingIndex = nextItems.findIndex((existing) =>
    existing.pixelImageId === nextItem.pixelImageId || existing.name === nextItem.name
  )

  if (existingIndex >= 0) {
    nextItems.splice(existingIndex, 1, nextItem)
  } else {
    nextItems.push(nextItem)
  }

  return {
    version: 1,
    items: nextItems.sort((left, right) =>
      left.pixelImageId - right.pixelImageId || left.name.localeCompare(right.name)
    )
  }
}
