import { t } from '../i18n'
import type { GridData } from '../types/grid'
import type { BeadResourceCatalogItem } from './beadResourceCatalog'
import type { BeadResourceMatch } from './beadResourceMatcher'

interface BeadThumbnailOptions {
  cellSize?: number
  createCanvas?: () => HTMLCanvasElement
  loadImage?: (url: string) => Promise<HTMLImageElement>
}

const DEFAULT_CELL_SIZE = 27

const createDefaultCanvas = (): HTMLCanvasElement => document.createElement('canvas')

const loadDefaultImage = async (url: string): Promise<HTMLImageElement> =>
  await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(t("缩略图资源加载失败：{0}", url)))
    image.src = url
  })

export const buildBeadThumbnailDataUrl = async (
  grid: GridData,
  matches: BeadResourceMatch[],
  catalog: BeadResourceCatalogItem[],
  options: BeadThumbnailOptions = {}
): Promise<string> => {
  const cellSize = options.cellSize ?? DEFAULT_CELL_SIZE
  const canvas = (options.createCanvas ?? createDefaultCanvas)()
  canvas.width = grid.width * cellSize
  canvas.height = grid.height * cellSize

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error(t("缩略图 canvas 2D context 不可用"))
  }

  context.clearRect(0, 0, canvas.width, canvas.height)

  const catalogByName = new Map(catalog.map((item) => [item.resourceName, item]))
  const matchByColorIndex = new Map(matches.map((match) => [match.colorIndex, match]))
  const imageCache = new Map<string, HTMLImageElement>()
  const loadImage = options.loadImage ?? loadDefaultImage

  const getImage = async (url: string): Promise<HTMLImageElement> => {
    const cachedImage = imageCache.get(url)
    if (cachedImage) return cachedImage

    const image = await loadImage(url)
    imageCache.set(url, image)
    return image
  }

  for (let rowIndex = 0; rowIndex < grid.colorIndices.length; rowIndex += 1) {
    const row = grid.colorIndices[rowIndex]
    if (!row) continue

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const colorIndex = row[columnIndex]
      const resourceName = colorIndex === undefined
        ? null
        : matchByColorIndex.get(colorIndex)?.resourceName
      if (!resourceName) continue

      const state4Url = catalogByName.get(resourceName)?.stateFiles[4]?.url
      if (!state4Url) continue

      const image = await getImage(state4Url)
      context.drawImage(
        image,
        columnIndex * cellSize,
        rowIndex * cellSize,
        cellSize,
        cellSize
      )
    }
  }

  return canvas.toDataURL('image/png')
}
