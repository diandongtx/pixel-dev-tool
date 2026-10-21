import { describe, expect, it, vi } from 'vitest'
import type { GridData } from '../../types/grid'
import type { BeadResourceCatalogItem } from '../beadResourceCatalog'
import type { BeadResourceMatch } from '../beadResourceMatcher'
import { buildBeadThumbnailDataUrl } from '../beadThumbnail'

const grid: GridData = {
  width: 2,
  height: 1,
  colorIndices: [[0, 1]],
  colors: [
    { r: 240, g: 240, b: 230, a: 255 },
    { r: 192, g: 161, b: 30, a: 255 }
  ],
  fileName: 'flower'
}

const matches: BeadResourceMatch[] = [
  {
    colorIndex: 0,
    targetColor: grid.colors[0]!,
    resourceName: 'bakery0',
    distance: 0,
    confidence: 'high',
    alternatives: []
  },
  {
    colorIndex: 1,
    targetColor: grid.colors[1]!,
    resourceName: 'caffee1',
    distance: 0,
    confidence: 'high',
    alternatives: []
  }
]

const catalog: BeadResourceCatalogItem[] = [
  {
    resourceName: 'bakery0',
    compareColor: grid.colors[0]!,
    stateFiles: {
      4: { name: 'bakery0_4.png', url: '/resource/grid/bakery0_4.png' }
    },
    compareSource: { stateCode: 4, samplingRule: 'state4-side-regions' }
  },
  {
    resourceName: 'caffee1',
    compareColor: grid.colors[1]!,
    stateFiles: {
      4: { name: 'caffee1_4.png', url: '/resource/grid/caffee1_4.png' }
    },
    compareSource: { stateCode: 4, samplingRule: 'state4-side-regions' }
  }
]

const createMockCanvas = () => {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn()
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn((kind: string) => (kind === '2d' ? context : null)),
    toDataURL: vi.fn(() => 'data:image/png;base64,thumbnail')
  }

  return { canvas: canvas as unknown as HTMLCanvasElement, context }
}

describe('buildBeadThumbnailDataUrl', () => {
  it('draws matched state 4 bead images into a transparent grid canvas', async () => {
    const { canvas, context } = createMockCanvas()
    const loadedImages = new Map<string, HTMLImageElement>()
    const loadImage = vi.fn(async (url: string) => {
      const image = { src: url } as HTMLImageElement
      loadedImages.set(url, image)
      return image
    })

    const dataUrl = await buildBeadThumbnailDataUrl(grid, matches, catalog, {
      cellSize: 10,
      createCanvas: () => canvas,
      loadImage
    })

    expect(dataUrl).toBe('data:image/png;base64,thumbnail')
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(canvas.width).toBe(20)
    expect(canvas.height).toBe(10)
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 20, 10)
    expect(loadImage).toHaveBeenCalledTimes(2)
    expect(loadImage.mock.calls.map(([url]) => url)).toEqual([
      '/resource/grid/bakery0_4.png',
      '/resource/grid/caffee1_4.png'
    ])
    expect(context.drawImage).toHaveBeenNthCalledWith(
      1,
      loadedImages.get('/resource/grid/bakery0_4.png'),
      0,
      0,
      10,
      10
    )
    expect(context.drawImage).toHaveBeenNthCalledWith(
      2,
      loadedImages.get('/resource/grid/caffee1_4.png'),
      10,
      0,
      10,
      10
    )
  })

  it('skips colors without a matched state 4 resource', async () => {
    const { canvas, context } = createMockCanvas()

    await buildBeadThumbnailDataUrl(
      grid,
      [{ ...matches[0]!, resourceName: null }, matches[1]!],
      catalog,
      {
        createCanvas: () => canvas,
        loadImage: vi.fn(async (url: string) => ({ src: url }) as HTMLImageElement)
      }
    )

    expect(context.drawImage).toHaveBeenCalledTimes(1)
    expect(context.drawImage.mock.calls[0]?.[1]).toBe(27)
  })
})
