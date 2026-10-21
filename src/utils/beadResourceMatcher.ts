import type { RGBColor } from '../types/grid'
import type { BeadResourceCatalogItem } from './beadResourceCatalog'

export type BeadResourceMatchConfidence = 'high' | 'medium' | 'low' | 'missing'

export interface BeadResourceMatchAlternative {
  resourceName: string
  distance: number
}

export interface BeadResourceMatch {
  colorIndex: number
  targetColor: RGBColor
  resourceName: string | null
  distance: number | null
  confidence: BeadResourceMatchConfidence
  alternatives: BeadResourceMatchAlternative[]
}

export const getRgbDistance = (left: RGBColor, right: RGBColor): number => {
  const redDiff = left.r - right.r
  const greenDiff = left.g - right.g
  const blueDiff = left.b - right.b

  return Math.sqrt((redDiff ** 2) + (greenDiff ** 2) + (blueDiff ** 2))
}

export const getMatchConfidence = (
  distance: number
): Exclude<BeadResourceMatchConfidence, 'missing'> => {
  if (distance <= 18) return 'high'
  if (distance <= 45) return 'medium'
  return 'low'
}

export const matchBeadResourcesForColors = (
  colors: RGBColor[],
  catalog: BeadResourceCatalogItem[],
  maxAlternatives = 5
): BeadResourceMatch[] => {
  return colors.map((targetColor, colorIndex) => {
    if (catalog.length === 0) {
      return {
        colorIndex,
        targetColor,
        resourceName: null,
        distance: null,
        confidence: 'missing',
        alternatives: []
      }
    }

    const sortedAlternatives = catalog
      .map((catalogItem): BeadResourceMatchAlternative => {
        const distance = getRgbDistance(targetColor, catalogItem.compareColor)

        return {
          resourceName: catalogItem.resourceName,
          distance
        }
      })
      .sort((left, right) => left.distance - right.distance)

    const bestMatch = sortedAlternatives[0]

    return {
      colorIndex,
      targetColor,
      resourceName: bestMatch.resourceName,
      distance: bestMatch.distance,
      confidence: getMatchConfidence(bestMatch.distance),
      alternatives: sortedAlternatives.slice(0, maxAlternatives)
    }
  })
}
