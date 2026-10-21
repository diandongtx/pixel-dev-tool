export interface PixelConfigItem {
  [key: string]: unknown
  id: number
  name: string
  gridWidthHeight: [number, number]
  pixelWidthHeight: [number, number]
  localPixelResource: string[]
  pixelMatrix: number[][]
  initPixel: number[][]
  beadCount: number
  theme?: string
  difficulty?: number
  quality?: number
  imageType?: number
  albumId?: string | null
}

export type PixelConfigFile = PixelConfigItem[]
