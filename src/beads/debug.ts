import type { RGBColor } from '../types/grid'
import type {
  BeadDebugLayerResult,
  BeadDebugSuspectHint,
  BeadDebugSuspectReason
} from './types'

type DebugLayerVariant = 'original' | 'tinted' | 'composite'

type SuspectInput = Pick<
  BeadDebugLayerResult,
  'layerId' | 'kind' | 'resolvedColor' | 'usesGrayscaleTint'
> & {
  analysisColor?: RGBColor
  visible?: boolean
}

const normalizeImportedStem = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  const segments = trimmed.split(/[\\/]/)
  const lastSegment = segments[segments.length - 1] ?? ''

  return lastSegment.replace(/\.[^.]+$/, '').trim()
}

const normalizeManualBaseName = (value: string): string => value.trim()

const hueOf = (color: RGBColor): number => {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  if (delta === 0) {
    return 0
  }

  if (max === r) {
    return (60 * (((g - b) / delta) % 6) + 360) % 360
  }

  if (max === g) {
    return 60 * (((b - r) / delta) + 2)
  }

  return 60 * (((r - g) / delta) + 4)
}

const hueDistance = (left: number, right: number): number => {
  const diff = Math.abs(left - right)
  return Math.min(diff, 360 - diff)
}

const luminanceOf = (color: RGBColor): number =>
  ((0.2126 * color.r) + (0.7152 * color.g) + (0.0722 * color.b)) / 255

const saturationOf = (color: RGBColor): number => {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)

  if (max === 0) {
    return 0
  }

  return (max - min) / max
}

const createSuspect = (
  layerId: string,
  reason: BeadDebugSuspectReason,
  message: string
): BeadDebugSuspectHint =>
  ({
    layerId,
    reason,
    message
  })

export const resolveDebugExportBaseName = (
  manualBaseName: string,
  importedFilename: string
): string => {
  const manual = normalizeManualBaseName(manualBaseName)
  if (manual) {
    return manual
  }

  const imported = normalizeImportedStem(importedFilename)
  if (imported) {
    return imported
  }

  return 'debug'
}

export const buildBeadDebugLayerFilename = (
  baseName: string,
  colorIndex: number,
  stateCode: 2 | 3 | 4,
  layerId: string,
  variant: DebugLayerVariant
): string => `${baseName}${colorIndex}_${stateCode}_${layerId}_${variant}.png`

export const analyzeDebugSuspects = (
  targetColor: RGBColor,
  layers: SuspectInput[]
): BeadDebugSuspectHint[] => {
  const targetHue = hueOf(targetColor)

  return layers.flatMap((layer) => {
    if (layer.visible === false) {
      return []
    }

    const analysisColor = layer.analysisColor ?? layer.resolvedColor
    const resolvedSaturation = saturationOf(layer.resolvedColor)
    const distance = hueDistance(targetHue, hueOf(layer.resolvedColor))
    const luminance = luminanceOf(analysisColor)

    if (layer.kind === 'fixed' && resolvedSaturation >= 0.35 && distance >= 20) {
      return [
        createSuspect(
          layer.layerId,
          'fixed-hue-mismatch',
          'Fixed layer color stays far from the target hue and may leave a colored edge.'
        )
      ]
    }

    if (layer.usesGrayscaleTint && luminance < 0.2) {
      return [
        createSuspect(
          layer.layerId,
          'dark-grayscale',
          'Grayscale-tinted output is very dark and may muddy the overall bead preview.'
        )
      ]
    }

    if (resolvedSaturation >= 0.25 && distance >= 45) {
      return [
        createSuspect(
          layer.layerId,
          'resolved-hue-mismatch',
          'Resolved layer color still lands far from the target hue.'
        )
      ]
    }

    return []
  })
}
