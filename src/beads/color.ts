import type { RGBColor } from '../types/grid'

export const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value))

interface Bean0_4Anchor {
  sideColor: RGBColor
  layers: Record<string, RGBColor>
}

const bean0_4Anchors: Bean0_4Anchor[] = [
  {
    sideColor: { r: 252, g: 140, b: 15, a: 255 },
    layers: {
      'mid-up': { r: 249, g: 176, b: 62, a: 255 },
      'mid-left': { r: 252, g: 140, b: 15, a: 255 },
      'mid-right': { r: 252, g: 140, b: 15, a: 255 },
      'mid-down': { r: 229, g: 106, b: 0, a: 255 },
      'base-1': { r: 213, g: 89, b: 7, a: 255 },
      'top-frame': { r: 147, g: 49, b: 22, a: 255 }
    }
  },
  {
    sideColor: { r: 167, g: 191, b: 63, a: 255 },
    layers: {
      'mid-up': { r: 195, g: 219, b: 92, a: 255 },
      'mid-left': { r: 167, g: 191, b: 63, a: 255 },
      'mid-right': { r: 167, g: 191, b: 63, a: 255 },
      'mid-down': { r: 146, g: 171, b: 42, a: 255 },
      'base-1': { r: 124, g: 147, b: 31, a: 255 },
      'top-frame': { r: 96, g: 102, b: 12, a: 255 }
    }
  },
  {
    sideColor: { r: 171, g: 31, b: 30, a: 255 },
    layers: {
      'mid-up': { r: 219, g: 57, b: 55, a: 255 },
      'mid-left': { r: 171, g: 31, b: 30, a: 255 },
      'mid-right': { r: 171, g: 31, b: 30, a: 255 },
      'mid-down': { r: 153, g: 13, b: 12, a: 255 },
      'base-1': { r: 129, g: 13, b: 13, a: 255 },
      'top-frame': { r: 110, g: 8, b: 6, a: 255 }
    }
  },
  {
    sideColor: { r: 241, g: 240, b: 231, a: 255 },
    layers: {
      'mid-up': { r: 255, g: 255, b: 246, a: 255 },
      'mid-left': { r: 241, g: 240, b: 231, a: 255 },
      'mid-right': { r: 241, g: 240, b: 231, a: 255 },
      'mid-down': { r: 234, g: 233, b: 220, a: 255 },
      'base-1': { r: 205, g: 204, b: 190, a: 255 },
      'top-frame': { r: 121, g: 117, b: 114, a: 255 }
    }
  },
  {
    sideColor: { r: 55, g: 55, b: 55, a: 255 },
    layers: {
      'mid-up': { r: 81, g: 83, b: 84, a: 255 },
      'mid-left': { r: 55, g: 55, b: 55, a: 255 },
      'mid-right': { r: 55, g: 55, b: 55, a: 255 },
      'mid-down': { r: 45, g: 45, b: 45, a: 255 },
      'base-1': { r: 27, g: 26, b: 28, a: 255 },
      'top-frame': { r: 7, g: 2, b: 0, a: 255 }
    }
  },
  {
    sideColor: { r: 31, g: 167, b: 219, a: 255 },
    layers: {
      'mid-up': { r: 72, g: 200, b: 245, a: 255 },
      'mid-left': { r: 31, g: 167, b: 219, a: 255 },
      'mid-right': { r: 31, g: 167, b: 219, a: 255 },
      'mid-down': { r: 16, g: 144, b: 199, a: 255 },
      'base-1': { r: 13, g: 120, b: 166, a: 255 },
      'top-frame': { r: 0, g: 80, b: 87, a: 255 }
    }
  },
  {
    sideColor: { r: 134, g: 48, b: 174, a: 255 },
    layers: {
      'mid-up': { r: 178, g: 92, b: 218, a: 255 },
      'mid-left': { r: 134, g: 48, b: 174, a: 255 },
      'mid-right': { r: 134, g: 48, b: 174, a: 255 },
      'mid-down': { r: 125, g: 39, b: 165, a: 255 },
      'base-1': { r: 100, g: 14, b: 140, a: 255 },
      'top-frame': { r: 71, g: 1, b: 104, a: 255 }
    }
  },
  {
    sideColor: { r: 247, g: 180, b: 103, a: 255 },
    layers: {
      'mid-up': { r: 247, g: 206, b: 153, a: 255 },
      'mid-left': { r: 247, g: 180, b: 103, a: 255 },
      'mid-right': { r: 247, g: 180, b: 103, a: 255 },
      'mid-down': { r: 243, g: 160, b: 71, a: 255 },
      'base-1': { r: 198, g: 120, b: 39, a: 255 },
      'top-frame': { r: 150, g: 79, b: 5, a: 255 }
    }
  },
  {
    sideColor: { r: 121, g: 47, b: 64, a: 255 },
    layers: {
      'mid-up': { r: 160, g: 89, b: 97, a: 255 },
      'mid-left': { r: 121, g: 47, b: 64, a: 255 },
      'mid-right': { r: 121, g: 47, b: 64, a: 255 },
      'mid-down': { r: 110, g: 36, b: 49, a: 255 },
      'base-1': { r: 91, g: 26, b: 32, a: 255 },
      'top-frame': { r: 82, g: 8, b: 6, a: 255 }
    }
  },
  {
    sideColor: { r: 248, g: 199, b: 18, a: 255 },
    layers: {
      'mid-up': { r: 255, g: 224, b: 81, a: 255 },
      'mid-left': { r: 248, g: 199, b: 18, a: 255 },
      'mid-right': { r: 248, g: 199, b: 18, a: 255 },
      'mid-down': { r: 233, g: 152, b: 0, a: 255 },
      'base-1': { r: 203, g: 101, b: 0, a: 255 },
      'top-frame': { r: 147, g: 49, b: 22, a: 255 }
    }
  },
  {
    sideColor: { r: 185, g: 180, b: 222, a: 255 },
    layers: {
      'mid-up': { r: 204, g: 199, b: 241, a: 255 },
      'mid-left': { r: 185, g: 180, b: 222, a: 255 },
      'mid-right': { r: 185, g: 180, b: 222, a: 255 },
      'mid-down': { r: 157, g: 152, b: 194, a: 255 },
      'base-1': { r: 110, g: 105, b: 147, a: 255 },
      'top-frame': { r: 69, g: 64, b: 106, a: 255 }
    }
  },
  {
    sideColor: { r: 240, g: 90, b: 78, a: 255 },
    layers: {
      'mid-up': { r: 255, g: 123, b: 112, a: 255 },
      'mid-left': { r: 240, g: 90, b: 78, a: 255 },
      'mid-right': { r: 240, g: 90, b: 78, a: 255 },
      'mid-down': { r: 213, g: 63, b: 51, a: 255 },
      'base-1': { r: 192, g: 42, b: 30, a: 255 },
      'top-frame': { r: 156, g: 13, b: 1, a: 255 }
    }
  }
]

const colorsMatch = (left: RGBColor, right: RGBColor): boolean =>
  left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a

const rgbDistance = (left: RGBColor, right: RGBColor): number =>
  Math.sqrt(
    ((left.r - right.r) ** 2) +
      ((left.g - right.g) ** 2) +
      ((left.b - right.b) ** 2)
  )

const normalizeHue = (hue: number): number => ((hue % 360) + 360) % 360

const rgbToHsl = (color: RGBColor) => {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness }
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue =
    max === r
      ? 60 * (((g - b) / delta) % 6)
      : max === g
        ? 60 * ((b - r) / delta + 2)
        : 60 * ((r - g) / delta + 4)

  return {
    h: normalizeHue(hue),
    s: saturation,
    l: lightness
  }
}

const hslToRgb = (h: number, s: number, l: number): RGBColor => {
  const normalizedHue = normalizeHue(h)
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const hueSection = normalizedHue / 60
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1))
  const match = l - chroma / 2

  let red = 0
  let green = 0
  let blue = 0

  if (hueSection < 1) {
    red = chroma
    green = secondary
  } else if (hueSection < 2) {
    red = secondary
    green = chroma
  } else if (hueSection < 3) {
    green = chroma
    blue = secondary
  } else if (hueSection < 4) {
    green = secondary
    blue = chroma
  } else if (hueSection < 5) {
    red = secondary
    blue = chroma
  } else {
    red = chroma
    blue = secondary
  }

  return {
    r: clampByte((red + match) * 255),
    g: clampByte((green + match) * 255),
    b: clampByte((blue + match) * 255),
    a: 255
  }
}

export const mapDirectLayerColor = (
  referenceColor: RGBColor,
  baseLayerColor: RGBColor,
  targetColor: RGBColor
): RGBColor => {
  if (colorsMatch(referenceColor, targetColor)) {
    return { ...baseLayerColor }
  }

  const referenceHsl = rgbToHsl(referenceColor)
  const baseHsl = rgbToHsl(baseLayerColor)
  const targetHsl = rgbToHsl(targetColor)

  const mapped = hslToRgb(
    targetHsl.h + (baseHsl.h - referenceHsl.h),
    clampUnit(targetHsl.s + (baseHsl.s - referenceHsl.s)),
    clampUnit(targetHsl.l + (baseHsl.l - referenceHsl.l))
  )

  return {
    ...mapped,
    a: baseLayerColor.a
  }
}

export const mapBean0_4LayerColor = (layerId: string, sideColor: RGBColor): RGBColor => {
  if (layerId === 'mid-left' || layerId === 'mid-right') {
    return { ...sideColor }
  }

  const exactAnchor = bean0_4Anchors.find((anchor) => colorsMatch(anchor.sideColor, sideColor))
  if (exactAnchor) {
    const exactLayerColor = exactAnchor.layers[layerId]
    return exactLayerColor ? { ...exactLayerColor } : { ...sideColor }
  }

  const weightedAnchors = bean0_4Anchors
    .map((anchor) => ({
      anchor,
      distance: rgbDistance(anchor.sideColor, sideColor)
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 3)

  const fallbackLayerColor = weightedAnchors[0]?.anchor.layers[layerId]
  if (!fallbackLayerColor) {
    return { ...sideColor }
  }

  const weightedChannels = weightedAnchors.reduce(
    (accumulator, { anchor, distance }) => {
      const anchorLayerColor = anchor.layers[layerId]
      if (!anchorLayerColor) {
        return accumulator
      }

      const weight = 1 / Math.max(distance ** 2, 1)

      return {
        totalWeight: accumulator.totalWeight + weight,
        red: accumulator.red + (anchorLayerColor.r * weight),
        green: accumulator.green + (anchorLayerColor.g * weight),
        blue: accumulator.blue + (anchorLayerColor.b * weight)
      }
    },
    { totalWeight: 0, red: 0, green: 0, blue: 0 }
  )

  if (weightedChannels.totalWeight === 0) {
    return { ...fallbackLayerColor }
  }

  return {
    r: clampByte(weightedChannels.red / weightedChannels.totalWeight),
    g: clampByte(weightedChannels.green / weightedChannels.totalWeight),
    b: clampByte(weightedChannels.blue / weightedChannels.totalWeight),
    a: sideColor.a
  }
}

export const tintGrayPixel = (
  pixel: { gray: number; alpha: number },
  targetColor: RGBColor
): RGBColor => {
  const intensity = clampUnit(pixel.gray / 255)

  return {
    r: clampByte(targetColor.r * intensity),
    g: clampByte(targetColor.g * intensity),
    b: clampByte(targetColor.b * intensity),
    a: pixel.alpha
  }
}
