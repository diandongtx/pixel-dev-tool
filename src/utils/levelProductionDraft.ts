import type { PixelConfigItem } from '../types/pixelConfig'
import type { BeadResourceMatch } from './beadResourceMatcher'

export const applyBeadResourceMatchesToPixelConfig = (
  pixelConfig: PixelConfigItem,
  matches: BeadResourceMatch[]
): PixelConfigItem => {
  const nextResources = [...pixelConfig.localPixelResource]

  for (const match of matches) {
    if (match.resourceName) {
      nextResources[match.colorIndex] = match.resourceName
    }
  }

  return {
    ...pixelConfig,
    localPixelResource: nextResources
  }
}
