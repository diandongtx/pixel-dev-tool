import type { GridData } from '../types/grid'
import { buildGridOutputJson } from '../utils/gridData'
import { renderBeadBlob } from './render'
import { beadTemplates } from './templates'
import type { BeadTemplate } from './types'

export type BeadRenderTemplate = (
  template: BeadTemplate,
  targetColor: GridData['colors'][number]
) => Promise<Blob>

export interface BeadDownloadDeps {
  assetBaseName?: string
  jsonFilename?: string
  triggerDownload?: (blob: Blob, filename: string) => void
  renderTemplate?: BeadRenderTemplate
  wait?: (ms: number) => Promise<void>
}

export const buildBeadAssetFilename = (
  baseName: string,
  colorIndex: number,
  stateCode: BeadTemplate['stateCode']
): string => `${baseName}${colorIndex}_${stateCode}.png`

export const buildBeadGridColorsFilename = (baseName: string): string =>
  `${baseName}_grid_colors.json`

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 0)
}

const getDefaultWait = (): ((ms: number) => Promise<void>) => (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

const defaultRenderTemplate: BeadRenderTemplate = (template, targetColor) =>
  renderBeadBlob(template, targetColor)

export const downloadBeadAssetsForGrid = async (
  gridData: GridData,
  deps: BeadDownloadDeps = {}
): Promise<void> => {
  const triggerDownload = deps.triggerDownload ?? downloadBlob
  const renderTemplate = deps.renderTemplate ?? defaultRenderTemplate
  const wait = deps.wait ?? getDefaultWait()
  const assetBaseName = deps.assetBaseName ?? gridData.fileName
  const jsonFilename = deps.jsonFilename ?? buildBeadGridColorsFilename(gridData.fileName)
  const totalPngDownloads = gridData.colors.length * beadTemplates.length
  let pngDownloadsCompleted = 0

  const jsonBlob = new Blob([buildGridOutputJson(gridData)], {
    type: 'application/json'
  })
  triggerDownload(jsonBlob, jsonFilename)

  if (gridData.colors.length === 0) {
    return
  }

  await wait(80)

  for (const [colorIndex, color] of gridData.colors.entries()) {
    for (const template of beadTemplates) {
      try {
        const blob = await renderTemplate(template, color)
        triggerDownload(blob, buildBeadAssetFilename(assetBaseName, colorIndex, template.stateCode))
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        throw new Error(
          `Failed to export bead asset for color index ${colorIndex}, state ${template.stateCode} (${template.templateId}): ${message}`
        )
      }

      pngDownloadsCompleted += 1

      if (pngDownloadsCompleted < totalPngDownloads) {
        await wait(80)
      }
    }
  }
}
