export type RgbaColor = {
  r: number
  g: number
  b: number
  a: number
}

export interface ImageDataLike {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface PngImageSource {
  name: string
  url?: string
}

type RgbaTuple = [number, number, number, number]

const OPAQUE_ALPHA_THRESHOLD = 128

const createColorKey = ([r, g, b, a]: RgbaTuple): string => `${r},${g},${b},${a}`

const parseColorKey = (key: string): RgbaColor => {
  const [r, g, b, a] = key.split(',').map(Number)
  return { r, g, b, a }
}

const pixelAt = (image: ImageDataLike, x: number, y: number): RgbaTuple => {
  const offset = ((y * image.width) + x) * 4
  return [
    image.data[offset],
    image.data[offset + 1],
    image.data[offset + 2],
    image.data[offset + 3]
  ]
}

export const pickDominantOpaqueColor = (pixels: RgbaTuple[]): RgbaColor | null => {
  let dominantKey: string | null = null
  let dominantCount = 0
  const counts = new Map<string, number>()

  for (const pixel of pixels) {
    if (pixel[3] < OPAQUE_ALPHA_THRESHOLD) {
      continue
    }

    const key = createColorKey(pixel)
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)

    if (count > dominantCount) {
      dominantKey = key
      dominantCount = count
    }
  }

  return dominantKey === null ? null : parseColorKey(dominantKey)
}

export const extractSideRegionCompareColor = (image: ImageDataLike): RgbaColor | null => {
  const regionWidth = Math.max(1, Math.round(image.width * 0.12))
  const regionHeight = Math.max(1, Math.round(image.height * 0.2))
  const top = Math.max(0, Math.round((image.height - regionHeight) / 2))
  const left = Math.max(0, Math.round(image.width * 0.2))
  const right = Math.min(image.width - regionWidth, Math.round(image.width * 0.8) - regionWidth)
  const pixels: RgbaTuple[] = []

  for (const startX of [left, right]) {
    for (let y = top; y < top + regionHeight && y < image.height; y += 1) {
      for (let x = startX; x < startX + regionWidth && x < image.width; x += 1) {
        pixels.push(pixelAt(image, x, y))
      }
    }
  }

  return pickDominantOpaqueColor(pixels)
}

export const extractDominantOpaqueColor = (image: ImageDataLike): RgbaColor | null => {
  const pixels: RgbaTuple[] = []

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      pixels.push(pixelAt(image, x, y))
    }
  }

  return pickDominantOpaqueColor(pixels)
}

export const loadPngImageData = async (source: PngImageSource): Promise<ImageDataLike> => {
  const objectUrl = source.url ?? (source instanceof File ? URL.createObjectURL(source) : null)

  if (!objectUrl) {
    throw new Error(`Unable to load image without URL: ${source.name}`)
  }

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Unable to load image: ${source.name}`))
      img.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight

    const context = canvas.getContext('2d')
    if (context === null) {
      throw new Error('Unable to create canvas 2D context')
    }

    context.drawImage(image, 0, 0)
    return context.getImageData(0, 0, canvas.width, canvas.height)
  } finally {
    if (!source.url) {
      URL.revokeObjectURL(objectUrl)
    }
  }
}

export const loadPngFileImageData = loadPngImageData
