import type { RGBColor } from '../types/grid'
import {
  extractDominantOpaqueColor,
  extractSideRegionCompareColor,
  loadPngImageData,
  type ImageDataLike,
  type PngImageSource
} from './imageColorSampling'

export type BeadResourceStateCode = 2 | 3 | 4
export type BeadResourceAsset = PngImageSource
type LoadImageData = (asset: BeadResourceAsset) => Promise<ImageDataLike>

export interface BeadResourceFilenameMeta {
  resourceName: string
  stateCode: BeadResourceStateCode
}

export interface BeadResourceFileGroup {
  resourceName: string
  stateFiles: Partial<Record<BeadResourceStateCode, BeadResourceAsset>>
}

export interface BeadResourceCatalogItem {
  resourceName: string
  compareColor: RGBColor
  stateFiles: Partial<Record<BeadResourceStateCode, BeadResourceAsset>>
  compareSource: {
    stateCode: BeadResourceStateCode
    samplingRule: 'state4-side-regions' | 'state3-side-regions' | 'fallback-dominant-color'
  }
}

const BEAD_RESOURCE_FILENAME_PATTERN = /^(.+)_(2|3|4)\.png$/i

export const parseBeadResourceFilename = (fileName: string): BeadResourceFilenameMeta | null => {
  const match = BEAD_RESOURCE_FILENAME_PATTERN.exec(fileName)
  if (!match) return null

  const resourceName = match[1]?.trim()
  const stateCode = Number(match[2])
  if (!resourceName || (stateCode !== 2 && stateCode !== 3 && stateCode !== 4)) {
    return null
  }

  return {
    resourceName,
    stateCode
  }
}

export const groupBeadResourceFiles = (files: BeadResourceAsset[]): BeadResourceFileGroup[] => {
  const groups = new Map<string, BeadResourceFileGroup>()

  for (const file of files) {
    const meta = parseBeadResourceFilename(file.name)
    if (!meta) continue

    const group = groups.get(meta.resourceName) ?? {
      resourceName: meta.resourceName,
      stateFiles: {}
    }
    group.stateFiles[meta.stateCode] = file
    groups.set(meta.resourceName, group)
  }

  return Array.from(groups.values()).sort((left, right) =>
    left.resourceName.localeCompare(right.resourceName)
  )
}

const getCompareFile = (
  group: BeadResourceFileGroup
): { file: BeadResourceAsset, stateCode: BeadResourceStateCode } | null => {
  for (const stateCode of [4, 3, 2] as const) {
    const file = group.stateFiles[stateCode]
    if (file) {
      return { file, stateCode }
    }
  }

  return null
}

const getSamplingRule = (
  stateCode: BeadResourceStateCode
): BeadResourceCatalogItem['compareSource']['samplingRule'] => {
  if (stateCode === 4) return 'state4-side-regions'
  if (stateCode === 3) return 'state3-side-regions'
  return 'fallback-dominant-color'
}

export const buildBeadResourceCatalog = async (
  files: BeadResourceAsset[],
  loadImageData: LoadImageData = loadPngImageData
): Promise<BeadResourceCatalogItem[]> => {
  const catalogItems: BeadResourceCatalogItem[] = []

  for (const group of groupBeadResourceFiles(files)) {
    const compareFile = getCompareFile(group)
    if (compareFile === null) continue

    const imageData = await loadImageData(compareFile.file)
    const compareColor = compareFile.stateCode === 2
      ? extractDominantOpaqueColor(imageData)
      : extractSideRegionCompareColor(imageData)

    if (compareColor === null) continue

    catalogItems.push({
      resourceName: group.resourceName,
      compareColor,
      stateFiles: group.stateFiles,
      compareSource: {
        stateCode: compareFile.stateCode,
        samplingRule: getSamplingRule(compareFile.stateCode)
      }
    })
  }

  return catalogItems
}
