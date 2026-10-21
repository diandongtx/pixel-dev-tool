import { flushSync } from 'react-dom'
import { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GridData } from '../../types/grid'
import type { PixelConfigItem } from '../../types/pixelConfig'
import { buildBeadThumbnailDataUrl } from '../../utils/beadThumbnail'
import { countPixelConfigBeads } from '../../utils/pixelConfigBeadCount'
import {
  getLevelWorkspaceSummary,
  readLevelWorkspaceLevelConfig,
  readLevelDraft,
  readLevelWorkspacePixelPalettes,
  readLevelWorkspacePixelConfig,
  readLevelWorkspaceThemeConfig,
  readLevelWorkspaceThumbnailStatus,
  saveLevelWorkspacePixelPalettes,
  saveLevelWorkspaceLevelConfig,
  saveLevelWorkspacePixelConfig,
  saveLevelDraft,
  saveLevelWorkspaceThumbnail
} from '../../utils/levelWorkspaceClient'
import { LevelProductionPreviewPanel } from '../LevelProductionPreviewPanel'

const existingPixelConfig: PixelConfigItem = {
  id: 1000,
  name: 'existing',
  gridWidthHeight: [1, 1],
  pixelWidthHeight: [1, 1],
  localPixelResource: ['bakery0'],
  pixelMatrix: [[0]],
  initPixel: [[0]],
  beadCount: countPixelConfigBeads([[0]])
}

const draftPixelConfig: PixelConfigItem = {
  ...existingPixelConfig,
  id: 1001,
  name: 'saved-draft'
}

const createGrid = (name = 'flower', width = 1, height = 1): GridData => ({
  width,
  height,
  colorIndices: Array.from({ length: height }, () => Array.from({ length: width }, () => 0)),
  colors: [{ r: 240, g: 240, b: 230, a: 255 }],
  fileName: name
})

const createTwoColorGrid = (): GridData => ({
  width: 2,
  height: 1,
  colorIndices: [[0, 1]],
  colors: [
    { r: 240, g: 240, b: 230, a: 255 },
    { r: 200, g: 40, b: 60, a: 255 }
  ],
  fileName: 'flower'
})

vi.mock('../../utils/beadResourceCatalog', async () => {
  const actual = await vi.importActual<typeof import('../../utils/beadResourceCatalog')>(
    '../../utils/beadResourceCatalog'
  )

  return {
    ...actual,
    buildBeadResourceCatalog: vi.fn(async () => [
      {
        resourceName: 'bakery0',
        compareColor: { r: 241, g: 240, b: 231, a: 255 },
        stateFiles: {
          2: { name: 'bakery0_2.png', url: '/resource/grid/bakery0_2.png' },
          3: { name: 'bakery0_3.png', url: '/resource/grid/bakery0_3.png' },
          4: { name: 'bakery0_4.png', url: '/resource/grid/bakery0_4.png' }
        },
        compareSource: { stateCode: 4, samplingRule: 'state4-side-regions' }
      },
      {
        resourceName: 'bakery1',
        compareColor: { r: 200, g: 40, b: 60, a: 255 },
        stateFiles: {
          2: { name: 'bakery1_2.png', url: '/resource/grid/bakery1_2.png' },
          3: { name: 'bakery1_3.png', url: '/resource/grid/bakery1_3.png' },
          4: { name: 'bakery1_4.png', url: '/resource/grid/bakery1_4.png' }
        },
        compareSource: { stateCode: 4, samplingRule: 'state4-side-regions' }
      }
    ])
  }
})

vi.mock('../../utils/defaultBeadResources', () => ({
  loadDefaultBeadResourceAssets: vi.fn(async () => [
    { name: 'bakery0_2.png', url: '/resource/grid/bakery0_2.png' },
    { name: 'bakery0_3.png', url: '/resource/grid/bakery0_3.png' },
    { name: 'bakery0_4.png', url: '/resource/grid/bakery0_4.png' }
  ])
}))

vi.mock('../../utils/beadThumbnail', () => ({
  buildBeadThumbnailDataUrl: vi.fn(async () => 'data:image/png;base64,thumbnail')
}))

vi.mock('../../utils/levelWorkspaceClient', () => ({
  getLevelWorkspaceSummary: vi.fn(async () => ({
    drafts: ['saved-draft'],
    pixelConfigCount: 1,
    mainLevelCount: 0,
    paths: {
      rootDir: 'data/level-workspace',
      draftsDir: 'data/level-workspace/drafts',
      configDir: 'data/level-workspace/config',
      thumbnailDir: 'resource/thumbnail',
      pixelConfigPath: 'data/level-workspace/config/pixelconfig.json'
    }
  })),
  readLevelDraft: vi.fn(async () => ({
    name: 'saved-draft',
    pixelConfig: draftPixelConfig
  })),
  readLevelWorkspacePixelPalettes: vi.fn(async () => ({ version: 1, items: [] })),
  readLevelWorkspacePixelConfig: vi.fn(async () => [existingPixelConfig]),
  readLevelWorkspaceThemeConfig: vi.fn(async () => [
    { theme: 'animal', themeName: '动物', sortOrder: 1 },
    { theme: 'food', themeName: '食物', sortOrder: 2 }
  ]),
  saveLevelWorkspacePixelPalettes: vi.fn(async () => ({ ok: true, count: 1 })),
  saveLevelWorkspacePixelConfig: vi.fn(async () => ({ ok: true, count: 2 })),
  readLevelWorkspaceLevelConfig: vi.fn(async () => []),
  saveLevelWorkspaceLevelConfig: vi.fn(async () => ({ ok: true, count: 1, type: 1 })),
  readLevelWorkspaceThumbnailStatus: vi.fn(async () => ({ exists: false })),
  saveLevelDraft: vi.fn(async () => ({ name: 'flower' })),
  saveLevelWorkspaceThumbnail: vi.fn(async () => ({
    ok: true,
    path: 'resource/thumbnail/flower.png'
  }))
}))

const mockedGetLevelWorkspaceSummary = vi.mocked(getLevelWorkspaceSummary)
const mockedReadLevelWorkspaceLevelConfig = vi.mocked(readLevelWorkspaceLevelConfig)
const mockedReadLevelDraft = vi.mocked(readLevelDraft)
const mockedReadLevelWorkspacePixelPalettes = vi.mocked(readLevelWorkspacePixelPalettes)
const mockedReadLevelWorkspacePixelConfig = vi.mocked(readLevelWorkspacePixelConfig)
const mockedReadLevelWorkspaceThemeConfig = vi.mocked(readLevelWorkspaceThemeConfig)
const mockedReadLevelWorkspaceThumbnailStatus = vi.mocked(readLevelWorkspaceThumbnailStatus)
const mockedSaveLevelWorkspacePixelPalettes = vi.mocked(saveLevelWorkspacePixelPalettes)
const mockedSaveLevelWorkspaceLevelConfig = vi.mocked(saveLevelWorkspaceLevelConfig)
const mockedSaveLevelWorkspacePixelConfig = vi.mocked(saveLevelWorkspacePixelConfig)
const mockedSaveLevelDraft = vi.mocked(saveLevelDraft)
const mockedSaveLevelWorkspaceThumbnail = vi.mocked(saveLevelWorkspaceThumbnail)
const mockedBuildBeadThumbnailDataUrl = vi.mocked(buildBeadThumbnailDataUrl)

const flushEffects = async () => {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

const flushResourceDownloads = async () => {
  for (let index = 0; index < 10; index += 1) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0)
    })
  }
}

const setNumberInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const setInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const setSelectValue = (select: HTMLSelectElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
  valueSetter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('LevelProductionPreviewPanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    // 质量报告新增结构感知 check 后，小矩阵打乱 grid 可能触发 error 级 severity。
    // 发布测试聚焦发布后数据正确性，统一假设用户已确认质量风险（个别用例可覆盖为 false）。
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    flushSync(() => {
      root.unmount()
    })
    container.remove()
    mockedGetLevelWorkspaceSummary.mockClear()
    mockedReadLevelWorkspaceLevelConfig.mockClear()
    mockedReadLevelDraft.mockClear()
    mockedReadLevelWorkspacePixelPalettes.mockClear()
    mockedReadLevelWorkspacePixelConfig.mockClear()
    mockedReadLevelWorkspaceThemeConfig.mockClear()
    mockedReadLevelWorkspaceThumbnailStatus.mockClear()
    mockedSaveLevelWorkspacePixelPalettes.mockClear()
    mockedSaveLevelWorkspaceLevelConfig.mockClear()
    mockedSaveLevelWorkspacePixelConfig.mockClear()
    mockedSaveLevelDraft.mockClear()
    mockedSaveLevelWorkspaceThumbnail.mockClear()
    mockedBuildBeadThumbnailDataUrl.mockClear()
    vi.restoreAllMocks()
  })

  it('saves drafts with the next id from internal pixelconfig and saved drafts', async () => {
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid()} pointGrid={createGrid()} />)
    })
    await flushEffects()

    const saveButton = container.querySelectorAll<HTMLButtonElement>('button')[2]
    expect(saveButton).not.toBeNull()

    flushSync(() => {
      saveButton!.click()
    })
    await flushEffects()

    expect(mockedReadLevelWorkspacePixelConfig).toHaveBeenCalled()
    expect(mockedReadLevelDraft).toHaveBeenCalledWith('saved-draft')
    expect(mockedSaveLevelDraft).toHaveBeenCalledWith(
      'flower',
      expect.objectContaining({
        pixelConfig: expect.objectContaining({
          id: 1002,
          name: 'flower'
        })
      })
    )
    expect(container.textContent).toContain('data/level-workspace/drafts/flower')
    expect(container.textContent).toContain('resource/thumbnail/flower.png')
  })

  it('uses responsive square pixel tracks for large map previews', async () => {
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid('wide-map', 30, 2)} pointGrid={createGrid('wide-map', 30, 2)} />)
    })
    await flushEffects()

    const previews = container.querySelectorAll<HTMLElement>('.level-production-map-preview')
    expect(previews).toHaveLength(2)
    expect(previews[0].style.gridTemplateColumns).toBe('repeat(30, minmax(0, 1fr))')
    expect(previews[1].style.gridTemplateColumns).toBe('repeat(30, minmax(0, 1fr))')
    expect(previews[0].style.maxWidth).toBe('885px')
    expect(previews[1].style.maxWidth).toBe('885px')
  })

  it('renders bead preview cells with state 2 bottom and state 3 top resources', async () => {
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid()} pointGrid={createGrid()} />)
    })
    await flushEffects()

    const previewCell = container.querySelector<HTMLElement>(
      '[data-testid="level-production-bead-preview"] .level-production-preview-cell'
    )
    expect(previewCell).not.toBeNull()

    const images = previewCell!.querySelectorAll<HTMLImageElement>('img')
    expect(images).toHaveLength(2)
    expect(images[0].src).toContain('/resource/grid/bakery0_2.png')
    expect(images[1].src).toContain('/resource/grid/bakery0_3.png')
    expect(images[0].style.width).toBe('100%')
    expect(images[1].style.width).toBe('84%')
    expect(images[1].style.left).toBe('50%')
    expect(images[1].style.right).toBe('auto')
    expect(images[1].style.bottom).toBe('auto')
    expect(images[1].style.inset).toBe('')
    expect(images[1].style.transform).toBe('translate(-50%, -50%)')
  })

  it('renders the map resource preview before sorting and the point resource preview after sorting', async () => {
    const mapGrid = createTwoColorGrid()
    const pointGrid: GridData = {
      ...createTwoColorGrid(),
      colorIndices: [[1, 0]],
      fileName: 'flower_sorted'
    }

    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={mapGrid} pointGrid={pointGrid} />)
    })
    await flushEffects()

    const mapImages = container.querySelectorAll<HTMLImageElement>(
      '[data-testid="level-production-map-resource-preview"] img'
    )
    const pointImages = container.querySelectorAll<HTMLImageElement>(
      '[data-testid="level-production-point-resource-preview"] img'
    )

    expect(mapImages[0].alt).toContain('preview cell 1-1 bakery0 2')
    expect(mapImages[2].alt).toContain('preview cell 1-2 bakery1 2')
    expect(pointImages[0].alt).toContain('preview cell 1-1 bakery1 2')
    expect(pointImages[2].alt).toContain('preview cell 1-2 bakery0 2')
  })

  it('downloads transparent PNG images for both displayed resource previews', async () => {
    const drawImage = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    const clickedAnchors: HTMLAnchorElement[] = []
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-image')
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      drawImage
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
      callback(new Blob(['png'], { type: 'image/png' }))
    })
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const element = originalCreateElement(tagName, options)
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(element as HTMLAnchorElement, 'click').mockImplementation(() => undefined)
        clickedAnchors.push(element as HTMLAnchorElement)
      }
      return element
    })
    vi.stubGlobal(
      'Image',
      class MockImage {
        crossOrigin = ''
        naturalWidth = 32
        naturalHeight = 32
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        private imageSrc = ''

        get src() {
          return this.imageSrc
        }

        set src(value: string) {
          this.imageSrc = value
          window.setTimeout(() => this.onload?.(), 0)
        }
      }
    )

    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createTwoColorGrid()} pointGrid={createTwoColorGrid()} />)
    })
    await flushEffects()

    const downloadButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter(
      (button) => button.textContent === '下载图片'
    )
    expect(downloadButtons).toHaveLength(2)

    flushSync(() => {
      downloadButtons[0].click()
      downloadButtons[1].click()
    })
    await flushResourceDownloads()

    const drawCalls = drawImage.mock.calls.map((call) => [
      (call[0] as HTMLImageElement).src,
      ...call.slice(1).map((value) => (typeof value === 'number' ? Number(value.toFixed(2)) : value))
    ])
    expect(drawImage).toHaveBeenCalledTimes(8)
    expect(drawCalls).toContainEqual(['/resource/grid/bakery0_2.png', 0, 0, 128, 128])
    expect(drawCalls).toContainEqual(['/resource/grid/bakery0_3.png', 10.24, 10.24, 107.52, 107.52])
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2)
    expect(clickedAnchors.map((anchor) => anchor.download)).toEqual([
      'flower-map-resource-preview.png',
      'flower-point-resource-preview.png'
    ])
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:preview-image')
  })

  it('shows a quality report for the current level draft', async () => {
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid()} pointGrid={createGrid()} />)
    })
    await flushEffects()

    expect(container.textContent).toContain('质量预检')
    expect(container.textContent).toContain('颜色数量')
    expect(container.textContent).toContain('难度估算')
  })

  it('publishes the current draft into internal pixelconfig', async () => {
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid()} pointGrid={createGrid()} />)
    })
    await flushEffects()

    const publishButton = container.querySelectorAll<HTMLButtonElement>('button')[3]
    expect(publishButton).not.toBeUndefined()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(mockedReadLevelWorkspacePixelConfig).toHaveBeenCalled()
    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1000, name: 'existing' }),
      expect.objectContaining({
        id: 1002,
        name: 'flower',
        localPixelResource: ['bakery0']
      })
    ])
    expect(mockedSaveLevelDraft).toHaveBeenCalledWith(
      'flower',
      expect.objectContaining({
        map: expect.objectContaining({ fileName: 'flower' }),
        point: expect.objectContaining({ fileName: 'flower' }),
        pixelConfig: expect.objectContaining({ id: 1002, name: 'flower' })
      })
    )
    expect(mockedReadLevelWorkspaceThumbnailStatus).toHaveBeenCalledWith('flower')
    expect(mockedSaveLevelWorkspaceThumbnail).toHaveBeenCalledWith('flower', 'data:image/png;base64,thumbnail')
    expect(container.textContent).toContain('data/level-workspace/config/pixelconfig.json')
  })

  it('publishes manually changed bottom resource names into localPixelResource', async () => {
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid()} pointGrid={createGrid()} />)
    })
    await flushEffects()

    const manualResourceInput = Array.from(container.querySelectorAll<HTMLInputElement>('input')).find(
      (input) => input.placeholder === '手动资源组名'
    )
    expect(manualResourceInput).not.toBeUndefined()

    flushSync(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(manualResourceInput, 'bakery1')
      manualResourceInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flushEffects()

    const publishButton = container.querySelectorAll<HTMLButtonElement>('button')[3]
    expect(publishButton).not.toBeUndefined()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1000, name: 'existing' }),
      expect.objectContaining({
        id: 1002,
        name: 'flower',
        localPixelResource: ['bakery1']
      })
    ])
  })

  it('publishes edited pixel metadata from the production panel', async () => {
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid()} pointGrid={createGrid()} />)
    })
    await flushEffects()

    const themeSelect = container.querySelector<HTMLSelectElement>('[data-testid="pixel-metadata-theme"]')
    const qualitySelect = container.querySelector<HTMLSelectElement>('[data-testid="pixel-metadata-quality"]')
    const imageTypeSelect = container.querySelector<HTMLSelectElement>('[data-testid="pixel-metadata-imageType"]')
    const albumInput = container.querySelector<HTMLInputElement>('[data-testid="pixel-metadata-albumId"]')
    const difficultySelect = container.querySelector<HTMLSelectElement>('[data-testid="pixel-metadata-difficulty"]')

    expect(themeSelect).not.toBeNull()
    expect(qualitySelect).not.toBeNull()
    expect(imageTypeSelect).not.toBeNull()
    expect(albumInput).not.toBeNull()
    expect(difficultySelect).not.toBeNull()

    flushSync(() => {
      setSelectValue(themeSelect!, 'animal')
      setSelectValue(qualitySelect!, '5')
      setSelectValue(imageTypeSelect!, '2')
      setInputValue(albumInput!, 'album-001')
      setSelectValue(difficultySelect!, '3')
    })
    await flushEffects()

    const publishButton = container.querySelectorAll<HTMLButtonElement>('button')[3]
    expect(publishButton).not.toBeUndefined()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(mockedReadLevelWorkspaceThemeConfig).toHaveBeenCalled()
    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1000, name: 'existing' }),
      expect.objectContaining({
        id: 1002,
        name: 'flower',
        theme: 'animal',
        difficulty: 3,
        quality: 5,
        imageType: 2,
        albumId: 'album-001'
      })
    ])
  })

  it('publishes dragged bead preview swaps into pixelMatrix', async () => {
    const StatefulPreview = () => {
      const [mapGrid, setMapGrid] = useState(createTwoColorGrid)
      const [pointGrid] = useState(createTwoColorGrid)

      return (
        <LevelProductionPreviewPanel
          mapGrid={mapGrid}
          pointGrid={pointGrid}
          onMapGridChange={setMapGrid}
        />
      )
    }

    flushSync(() => {
      root.render(<StatefulPreview />)
    })
    await flushEffects()

    const beadCells = container.querySelectorAll<HTMLElement>(
      '[data-testid="level-production-bead-preview"] .level-production-preview-cell'
    )
    expect(beadCells).toHaveLength(2)

    flushSync(() => {
      beadCells[0].dispatchEvent(new Event('dragstart', { bubbles: true }))
      beadCells[1].dispatchEvent(new Event('dragover', { bubbles: true }))
      beadCells[1].dispatchEvent(new Event('drop', { bubbles: true }))
    })
    await flushEffects()

    const publishButton = container.querySelectorAll<HTMLButtonElement>('button')[3]
    expect(publishButton).not.toBeUndefined()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1000, name: 'existing' }),
      expect.objectContaining({
        id: 1002,
        name: 'flower',
        pixelMatrix: [[1, 0]]
      })
    ])
  })

  it('does not regenerate a thumbnail when publishing an image that already has one', async () => {
    mockedReadLevelWorkspaceThumbnailStatus.mockResolvedValueOnce({ exists: true })
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid()} pointGrid={createGrid()} />)
    })
    await flushEffects()

    const publishButton = container.querySelectorAll<HTMLButtonElement>('button')[3]
    expect(publishButton).not.toBeUndefined()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(mockedReadLevelWorkspaceThumbnailStatus).toHaveBeenCalledWith('flower')
    expect(mockedBuildBeadThumbnailDataUrl).not.toHaveBeenCalled()
    expect(mockedSaveLevelWorkspaceThumbnail).not.toHaveBeenCalled()
    expect(mockedSaveLevelDraft).toHaveBeenCalledWith(
      'flower',
      expect.objectContaining({
        pixelConfig: expect.objectContaining({ id: 1002, name: 'flower' })
      })
    )
  })

  it('publishes the current draft into main levelconfig with suggested values', async () => {
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid()} pointGrid={createGrid()} />)
    })
    await flushEffects()

    const publishButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('加入主线关卡')
    )
    expect(publishButton).not.toBeUndefined()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalled()
    expect(mockedReadLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1)
    expect(mockedSaveLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1, [
      expect.objectContaining({
        id: 1,
        thumbnail: 'flower',
        type: 1,
        pixelImageId: 1002,
        difficulty: expect.any(Number),
        storageInitialSlots: expect.any(Number),
        initialTimeLimit: expect.any(Number),
        adTimeIncrement: expect.any(Number)
      })
    ])
    expect(mockedSaveLevelDraft).toHaveBeenCalledWith(
      'flower',
      expect.objectContaining({
        levelConfig: expect.objectContaining({
          id: 1,
          thumbnail: 'flower',
          pixelImageId: 1002
        }),
        pixelConfig: expect.objectContaining({ id: 1002, name: 'flower' })
      })
    )
    expect(container.textContent).toContain('data/level-workspace/config/levelconfig.json')
  })

  it('publishes main levels with manually edited level config values', async () => {
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid()} pointGrid={createGrid()} />)
    })
    await flushEffects()

    const difficultyInput = container.querySelector<HTMLInputElement>('[data-testid="level-config-difficulty"]')
    const storageInput = container.querySelector<HTMLInputElement>('[data-testid="level-config-storageInitialSlots"]')
    const timeInput = container.querySelector<HTMLInputElement>('[data-testid="level-config-initialTimeLimit"]')
    const publishButton = container.querySelector<HTMLButtonElement>('[data-testid="level-production-publish-main-level"]')

    expect(difficultyInput).not.toBeNull()
    expect(storageInput).not.toBeNull()
    expect(timeInput).not.toBeNull()
    expect(publishButton).not.toBeNull()

    flushSync(() => {
      setNumberInputValue(difficultyInput!, '7')
      setNumberInputValue(storageInput!, '24')
      setNumberInputValue(timeInput!, '240')
    })
    await flushEffects()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1, [
      expect.objectContaining({
        id: 1,
        difficulty: 7,
        storageInitialSlots: 24,
        initialTimeLimit: 240
      })
    ])
    expect(mockedSaveLevelDraft).toHaveBeenCalledWith(
      'flower',
      expect.objectContaining({
        levelConfig: expect.objectContaining({
          difficulty: 7,
          storageInitialSlots: 24,
          initialTimeLimit: 240
        })
      })
    )
  })

  it('asks for confirmation before publishing a draft with quality errors', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    flushSync(() => {
      root.render(<LevelProductionPreviewPanel mapGrid={createGrid('bad-map', 1, 1)} pointGrid={createGrid('bad-map', 2, 1)} />)
    })
    await flushEffects()

    const publishButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('加入主线关卡')
    )
    expect(publishButton).not.toBeUndefined()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('质量预检'))
    expect(mockedSaveLevelWorkspacePixelConfig).not.toHaveBeenCalled()
    expect(mockedSaveLevelWorkspaceLevelConfig).not.toHaveBeenCalled()
  })
})
