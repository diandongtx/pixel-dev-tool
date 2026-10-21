import type { RGBColor } from './grid'

export interface PixelPaletteItem {
  pixelImageId: number
  name: string
  colors: RGBColor[]
  updatedAt?: string
}

export interface PixelPaletteFile {
  version: 1
  items: PixelPaletteItem[]
}
