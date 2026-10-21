import type { GridData, RGBColor } from '../types/grid'

const PREVIEW_BACKGROUND: RGBColor = { r: 240, g: 240, b: 240, a: 255 }

const buildPreviewColor = (index: number): RGBColor => {
  const hue = (index * 47) % 360
  const saturation = 58 + ((index * 13) % 18)
  const lightness = 48 + ((index * 11) % 14)
  const chroma = (1 - Math.abs((2 * lightness / 100) - 1)) * (saturation / 100)
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = (lightness / 100) - (chroma / 2)

  let rPrime = 0
  let gPrime = 0
  let bPrime = 0
  if (hue < 60) {
    rPrime = chroma
    gPrime = x
  } else if (hue < 120) {
    rPrime = x
    gPrime = chroma
  } else if (hue < 180) {
    gPrime = chroma
    bPrime = x
  } else if (hue < 240) {
    gPrime = x
    bPrime = chroma
  } else if (hue < 300) {
    rPrime = x
    bPrime = chroma
  } else {
    rPrime = chroma
    bPrime = x
  }

  return {
    r: Math.round((rPrime + match) * 255),
    g: Math.round((gPrime + match) * 255),
    b: Math.round((bPrime + match) * 255),
    a: 255
  }
}

export const buildPreviewGridDataFromMatrix = (
  matrix: number[][],
  fileName: string
): GridData | null => {
  const height = matrix.length
  const width = matrix[0]?.length ?? 0
  if (width === 0 || height === 0) {
    return null
  }

  let maxIndex = -1
  for (const row of matrix) {
    for (const value of row) {
      if (value > maxIndex) {
        maxIndex = value
      }
    }
  }

  const colors = Array.from({ length: maxIndex + 1 }, (_, index) => buildPreviewColor(index))
  if (colors.length === 0) {
    colors.push(PREVIEW_BACKGROUND)
  }

  return {
    width,
    height,
    colorIndices: matrix.map((row) => [...row]),
    colors,
    fileName
  }
}
