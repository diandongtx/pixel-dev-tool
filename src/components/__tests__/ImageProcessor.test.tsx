import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PixelConfigItem } from '../../types/pixelConfig'
import type { GridData } from '../../types/grid'
import { buildGridOutputJson } from '../../utils/gridData'
import { downloadTextFile } from '../../utils/configIO'
import { countPixelConfigBeads } from '../../utils/pixelConfigBeadCount'
import { generateRegionRecolorSortedGrid, generateSortedGridByTargetBlockCount, generateStructureAwareSortedGrid } from '../../utils/levelGridSorter'
import {
  readLevelWorkspacePixelPalettes,
  readLevelWorkspacePixelConfig,
  saveLevelDraft,
  saveLevelWorkspacePixelPalettes,
  saveLevelWorkspacePixelConfig
} from '../../utils/levelWorkspaceClient'
import { ImageProcessor } from '../ImageProcessor'

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
        resourceName: 'aqua0',
        compareColor: { r: 0, g: 255, b: 255, a: 255 },
        stateFiles: {
          2: { name: 'aqua0_2.png', url: '/resource/grid/aqua0_2.png' },
          3: { name: 'aqua0_3.png', url: '/resource/grid/aqua0_3.png' },
          4: { name: 'aqua0_4.png', url: '/resource/grid/aqua0_4.png' }
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
    drafts: [],
    pixelConfigCount: 0,
    mainLevelCount: 0,
    paths: {
      rootDir: 'data/level-workspace',
      draftsDir: 'data/level-workspace/drafts',
      configDir: 'data/level-workspace/config',
      thumbnailDir: 'resource/thumbnail',
      pixelConfigPath: 'data/level-workspace/config/pixelconfig.json'
    }
  })),
  readLevelDraft: vi.fn(),
  readLevelWorkspacePixelPalettes: vi.fn(async () => ({ version: 1, items: [] })),
  readLevelWorkspacePixelConfig: vi.fn(async () => []),
  readLevelWorkspaceLevelConfig: vi.fn(async () => []),
  readLevelWorkspaceThumbnailStatus: vi.fn(async () => ({ exists: false })),
  saveLevelWorkspaceLevelConfig: vi.fn(async () => ({ ok: true, count: 1, type: 1 })),
  saveLevelWorkspacePixelPalettes: vi.fn(async () => ({ ok: true, count: 1 })),
  saveLevelWorkspacePixelConfig: vi.fn(async () => ({ ok: true, count: 1 })),
  saveLevelDraft: vi.fn(async () => ({ name: 'flower' })),
  saveLevelWorkspaceThumbnail: vi.fn(async () => ({ ok: true, path: 'resource/thumbnail/flower.png' }))
}))

vi.mock('../../utils/levelGridSorter', async () => {
  const actual = await vi.importActual<typeof import('../../utils/levelGridSorter')>('../../utils/levelGridSorter')

  const flipGrid = (source: GridData) => ({
    ...source,
    fileName: `${source.fileName}_sorted`,
    colorIndices: source.colorIndices.map((row) => row.map((value) => (value === 0 ? 1 : 0)))
  })

  return {
    ...actual,
    generateSortedGridByTargetBlockCount: vi.fn((source) => flipGrid(source)),
    generateStructureAwareSortedGrid: vi.fn((source) => ({
      grid: flipGrid(source),
      metrics: {
        structureRetention: 0.6,
        smallBlockRatio: 0.05,
        greedyTailRun: 1,
        fixedCellRatio: 0.2,
        pickupCount: 12,
        meanBlockSize: 4,
        sizeHistogram: { '1': 0, '2': 0, '3-4': 1, '5-8': 1, '9-16': 0, '17+': 0 }
      },
      attempts: 1,
      passed: true,
      usedSeed: 12345
    })),
    // v2 起 regionRecolor 为默认排序模式；沿用 flipGrid 语义保持既有预览断言
    generateRegionRecolorSortedGrid: vi.fn((source) => ({
      grid: flipGrid(source),
      metrics: {
        structureRetention: 0.6,
        smallBlockRatio: 0.05,
        greedyTailRun: 1,
        fixedCellRatio: 0.02,
        pickupCount: 12,
        meanBlockSize: 4,
        sizeHistogram: { '1': 0, '2': 0, '3-4': 1, '5-8': 1, '9-16': 0, '17+': 0 },
        contourPreservation: 0.9,
        regionPurity: 0.95,
        regionCount: 2,
        allocStrategy: 'quota',
        fixedFloor: 0
      },
      attempts: 1,
      passed: true,
      usedSeed: 12345
    }))
  }
})

vi.mock('../../utils/configIO', async () => {
  const actual = await vi.importActual<typeof import('../../utils/configIO')>('../../utils/configIO')
  return {
    ...actual,
    downloadTextFile: vi.fn()
  }
})

const mockedDownloadTextFile = vi.mocked(downloadTextFile)
const mockedGenerateSortedGridByTargetBlockCount = vi.mocked(generateSortedGridByTargetBlockCount)
const mockedGenerateStructureAwareSortedGrid = vi.mocked(generateStructureAwareSortedGrid)
const mockedGenerateRegionRecolorSortedGrid = vi.mocked(generateRegionRecolorSortedGrid)
const mockedReadLevelWorkspacePixelPalettes = vi.mocked(readLevelWorkspacePixelPalettes)
const mockedReadLevelWorkspacePixelConfig = vi.mocked(readLevelWorkspacePixelConfig)
const mockedSaveLevelDraft = vi.mocked(saveLevelDraft)
const mockedSaveLevelWorkspacePixelPalettes = vi.mocked(saveLevelWorkspacePixelPalettes)
const mockedSaveLevelWorkspacePixelConfig = vi.mocked(saveLevelWorkspacePixelConfig)

const createCanvasContext = () => ({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray([0, 0, 0, 255])
  })),
  lineWidth: 0,
  fillStyle: '',
  strokeStyle: ''
})

const setInputFiles = (input: HTMLInputElement, files: File[]) => {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files
  })
}

const createGridFile = (name: string, contents: string): File => {
  const file = new File([contents], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: vi.fn(async () => contents)
  })
  return file
}

const setInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const setSelectValue = (select: HTMLSelectElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  valueSetter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

const flushEffects = async () => {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

// 默认排序模式为 structure；测 legacy 流程（目标色块数/约束强度参数传递）时需显式切换。
const switchToLegacySort = (container: HTMLDivElement) => {
  const legacyRadio = container.querySelector<HTMLInputElement>('input[name="level-sort-mode"][value="legacy"]')
  expect(legacyRadio).not.toBeNull()
  flushSync(() => {
    legacyRadio!.click()
  })
}

const flushResourceDownloads = async () => {
  for (let index = 0; index < 10; index += 1) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0)
    })
  }
}

const loadGridAndGenerateSort = async (container: HTMLDivElement) => {
  const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
    width: 2,
    height: 2,
    grid: [
      [0, 1],
      [1, 0]
    ],
    colors: [
      { r: 240, g: 240, b: 230, a: 255 },
      { r: 0, g: 255, b: 255, a: 255 }
    ]
  }))
  const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
  expect(gridInput).not.toBeNull()

  setInputFiles(gridInput!, [gridFile])
  flushSync(() => {
    gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await flushEffects()

  const updatePreviewButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes('更新关卡预览')
  )
  expect(updatePreviewButton).toBeDefined()

  flushSync(() => {
    updatePreviewButton!.click()
  })
  await flushEffects()

  const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
  expect(sortButton).not.toBeNull()

  flushSync(() => {
    sortButton!.click()
  })
  await flushEffects()
}

describe('ImageProcessor color exports', () => {
  let container: HTMLDivElement
  let root: Root
  let canvasContext: ReturnType<typeof createCanvasContext>

  beforeEach(async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    canvasContext = createCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => (
      canvasContext as unknown as CanvasRenderingContext2D
    ))
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    // 质量报告新增结构感知 check 后，小矩阵打乱 grid 可能触发 error 级 severity。
    // 发布测试聚焦发布后数据正确性，统一假设用户已确认质量风险。
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    flushSync(() => {
      root.render(<ImageProcessor gridSize={1} colorTolerance={0} />)
    })
    await flushEffects()
  })

  afterEach(async () => {
    flushSync(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
    mockedDownloadTextFile.mockReset()
    mockedGenerateSortedGridByTargetBlockCount.mockClear()
    mockedGenerateStructureAwareSortedGrid.mockClear()
    mockedGenerateRegionRecolorSortedGrid.mockClear()
    mockedReadLevelWorkspacePixelPalettes.mockClear()
    mockedReadLevelWorkspacePixelPalettes.mockResolvedValue({ version: 1, items: [] })
    mockedReadLevelWorkspacePixelConfig.mockClear()
    mockedReadLevelWorkspacePixelConfig.mockResolvedValue([])
    mockedSaveLevelDraft.mockClear()
    mockedSaveLevelWorkspacePixelPalettes.mockClear()
    mockedSaveLevelWorkspacePixelConfig.mockClear()
  })

  it('downloads parsed grid data as a point json file when the grid download button is clicked', async () => {
    const gridFile = createGridFile('flower.json', JSON.stringify({
      width: 2,
      height: 2,
      grid: [
        [0, 1],
        [1, 0]
      ],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 },
        { r: 40, g: 161, b: 115, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    const downloadButtons = container.querySelectorAll<HTMLButtonElement>('button.download-button')

    expect(gridInput).not.toBeNull()
    expect(downloadButtons).toHaveLength(2)

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    flushSync(() => {
      downloadButtons[0].click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(buildGridOutputJson({
      width: 2,
      height: 2,
      colorIndices: [
        [0, 1],
        [1, 0]
      ],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 },
        { r: 40, g: 161, b: 115, a: 255 }
      ],
      fileName: 'flower'
    }), 'flower_point.json')
  })

  it('reuses the image basename when re-exporting an imported grid colors file', async () => {
    const gridFile = createGridFile('flower_grid_colors.json', JSON.stringify({
      width: 1,
      height: 1,
      grid: [[0]],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    const downloadButtons = container.querySelectorAll<HTMLButtonElement>('button.download-button')

    expect(gridInput).not.toBeNull()
    expect(downloadButtons).toHaveLength(2)

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    flushSync(() => {
      downloadButtons[0].click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(buildGridOutputJson({
      width: 1,
      height: 1,
      colorIndices: [[0]],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 }
      ],
      fileName: 'flower'
    }), 'flower_point.json')
  })

  it('keeps subject exports derived from an imported grid colors file on the logical image basename', async () => {
    const gridFile = createGridFile('flower_grid_colors.json', JSON.stringify({
      width: 3,
      height: 3,
      grid: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0]
      ],
      colors: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    const downloadButtons = container.querySelectorAll<HTMLButtonElement>('button.download-button')

    expect(gridInput).not.toBeNull()
    expect(downloadButtons).toHaveLength(2)

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    flushSync(() => {
      downloadButtons[1].click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(buildGridOutputJson({
      width: 1,
      height: 1,
      colorIndices: [[1]],
      colors: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ],
      fileName: 'flower_subject'
    }), 'flower_map.json')
  })

  it('keeps imported subject grid exports on the original image basename without duplicating subject', async () => {
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 1,
      height: 1,
      grid: [[0]],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    const downloadButtons = container.querySelectorAll<HTMLButtonElement>('button.download-button')

    expect(gridInput).not.toBeNull()
    expect(downloadButtons).toHaveLength(2)

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    flushSync(() => {
      downloadButtons[1].click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(buildGridOutputJson({
      width: 1,
      height: 1,
      colorIndices: [[0]],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 }
      ],
      fileName: 'flower'
    }), 'flower_map.json')
  })

  it('erases processed grid cells to empty slots with the eraser tool', async () => {
    const gridFile = createGridFile('flower_grid_colors.json', JSON.stringify({
      width: 2,
      height: 1,
      grid: [[0, 1]],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 },
        { r: 40, g: 161, b: 115, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const eraserButton = container.querySelector<HTMLButtonElement>('[data-testid="pixel-eraser-tool"]')
    const resultCanvas = container.querySelectorAll<HTMLCanvasElement>('canvas')[1]
    const downloadButton = container.querySelector<HTMLButtonElement>('button.download-button')

    expect(eraserButton).not.toBeNull()
    expect(resultCanvas).not.toBeUndefined()
    expect(downloadButton).not.toBeNull()

    Object.defineProperty(resultCanvas!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 10,
        top: 20,
        width: 2,
        height: 1,
        right: 12,
        bottom: 21,
        x: 10,
        y: 20,
        toJSON: () => ({})
      })
    })

    flushSync(() => {
      eraserButton!.click()
    })
    await flushEffects()

    flushSync(() => {
      resultCanvas!.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 10.25,
        clientY: 20.5
      }))
      resultCanvas!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    await flushEffects()

    flushSync(() => {
      downloadButton!.click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(buildGridOutputJson({
      width: 2,
      height: 1,
      colorIndices: [[-2, 0]],
      colors: [
        { r: 40, g: 161, b: 115, a: 255 }
      ],
      fileName: 'flower'
    }), 'flower_point.json')
    expect(container.querySelectorAll('button.index-item')).toHaveLength(1)
  })

  it('merges colors by dragging one indexed color onto another', async () => {
    const gridFile = createGridFile('flower_grid_colors.json', JSON.stringify({
      width: 2,
      height: 1,
      grid: [[0, 1]],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 },
        { r: 40, g: 161, b: 115, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    const downloadButton = container.querySelector<HTMLButtonElement>('button.download-button')

    expect(gridInput).not.toBeNull()
    expect(downloadButton).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const indexButtons = container.querySelectorAll<HTMLButtonElement>('button.index-item')
    expect(indexButtons).toHaveLength(2)

    flushSync(() => {
      indexButtons[0].dispatchEvent(new Event('dragstart', { bubbles: true }))
      indexButtons[1].dispatchEvent(new Event('drop', { bubbles: true }))
    })
    await flushEffects()

    expect(container.querySelectorAll('button.index-item')).toHaveLength(1)

    flushSync(() => {
      downloadButton!.click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(buildGridOutputJson({
      width: 2,
      height: 1,
      colorIndices: [[0, 0]],
      colors: [
        { r: 40, g: 161, b: 115, a: 255 }
      ],
      fileName: 'flower'
    }), 'flower_point.json')
  })

  it('downloads subject grid data as a map json file when the subject download button is clicked', async () => {
    const gridFile = createGridFile('flower.json', JSON.stringify({
      width: 3,
      height: 3,
      grid: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0]
      ],
      colors: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    const downloadButtons = container.querySelectorAll<HTMLButtonElement>('button.download-button')

    expect(gridInput).not.toBeNull()
    expect(downloadButtons).toHaveLength(2)

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    flushSync(() => {
      downloadButtons[1].click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(buildGridOutputJson({
      width: 1,
      height: 1,
      colorIndices: [[1]],
      colors: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ],
      fileName: 'flower_subject'
    }), 'flower_map.json')
  })

  it('removes all manually selected background index cells from the subject grid export', async () => {
    const gridFile = createGridFile('flower.json', JSON.stringify({
      width: 5,
      height: 5,
      grid: [
        [0, 0, 0, 0, 0],
        [0, 2, 2, 2, 0],
        [0, 2, 1, 2, 0],
        [0, 2, 2, 2, 0],
        [0, 0, 0, 0, 0]
      ],
      colors: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 20, g: 20, b: 20, a: 255 },
        { r: 230, g: 60, b: 60, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    const downloadButtons = container.querySelectorAll<HTMLButtonElement>('button.download-button')

    expect(gridInput).not.toBeNull()
    expect(downloadButtons).toHaveLength(2)

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const backgroundButton = container.querySelector<HTMLButtonElement>('[data-testid="pixel-background-color-tool"]')
    expect(backgroundButton).not.toBeNull()
    flushSync(() => {
      backgroundButton!.click()
    })
    await flushEffects()

    const indexColorButton = Array.from(container.querySelectorAll<HTMLElement>('.background-color-palette-container .color-item')).find(
      (item) => item.title === '#141414'
    )
    expect(indexColorButton).toBeDefined()
    flushSync(() => {
      indexColorButton!.click()
    })
    await flushEffects()

    flushSync(() => {
      downloadButtons[1].click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(buildGridOutputJson({
      width: 5,
      height: 5,
      colorIndices: [
        [0, 0, 0, 0, 0],
        [0, 2, 2, 2, 0],
        [0, 2, -2, 2, 0],
        [0, 2, 2, 2, 0],
        [0, 0, 0, 0, 0]
      ],
      colors: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 20, g: 20, b: 20, a: 255 },
        { r: 230, g: 60, b: 60, a: 255 }
      ],
      fileName: 'flower_subject'
    }), 'flower_map.json')
  })

  it('alerts when json export fails', async () => {
    mockedDownloadTextFile.mockImplementation(() => {
      throw new Error('export failed')
    })
    const alertSpy = vi.spyOn(window, 'alert')
    const gridFile = createGridFile('flower.json', JSON.stringify({
      width: 1,
      height: 1,
      grid: [[0]],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    const downloadButton = container.querySelector<HTMLButtonElement>('button.download-button')

    expect(gridInput).not.toBeNull()
    expect(downloadButton).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    flushSync(() => {
      downloadButton!.click()
    })
    await flushEffects()

    expect(alertSpy).toHaveBeenCalled()
  })

  it('shows a level production preview after manually updating from the current grid', async () => {
    const gridFile = createGridFile('flower_grid_colors.json', JSON.stringify({
      width: 1,
      height: 1,
      grid: [[0]],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const updatePreviewButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('更新关卡预览')
    )

    expect(updatePreviewButton).toBeDefined()

    flushSync(() => {
      updatePreviewButton!.click()
    })
    await flushEffects()

    expect(container.textContent).toContain('豆子资源预览')
    expect(container.textContent).toContain('保存草稿')
    expect(container.querySelector('[data-testid="level-production-bead-preview"]')).not.toBeNull()
  })

  it('loads an internal pixel config into the editable pixel grid without remapping indices', async () => {
    const internalPixelConfig: PixelConfigItem = {
      id: 1002,
      name: 'cake',
      gridWidthHeight: [2, 2],
      pixelWidthHeight: [2, 2],
      localPixelResource: ['bakery0', 'unused-resource', 'bakery0'],
      pixelMatrix: [
        [0, 2],
        [2, 0]
      ],
      initPixel: [
        [2, 0],
        [0, 2]
      ],
      beadCount: countPixelConfigBeads([
        [0, 2],
        [2, 0]
      ])
    }
    mockedReadLevelWorkspacePixelConfig.mockResolvedValueOnce([internalPixelConfig])

    const loadButton = container.querySelector<HTMLButtonElement>('[data-testid="internal-pixel-load"]')
    expect(loadButton).not.toBeNull()

    flushSync(() => {
      loadButton!.click()
    })
    await flushEffects()

    const selector = container.querySelector<HTMLSelectElement>('[data-testid="internal-pixel-select"]')
    expect(selector).not.toBeNull()
    expect(selector!.textContent).toContain('cake')

    flushSync(() => {
      setSelectValue(selector!, '1002')
    })
    await flushEffects()

    const downloadButtons = container.querySelectorAll<HTMLButtonElement>('button.download-button')
    flushSync(() => {
      downloadButtons[1].click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(
      expect.stringContaining('        [0, 2],\n        [2, 0]'),
      'cake_map.json'
    )
  })

  it('prefers resource colors over saved palette colors when loading an internal pixel config', async () => {
    const internalPixelConfig: PixelConfigItem = {
      id: 1002,
      name: 'cake',
      gridWidthHeight: [1, 2],
      pixelWidthHeight: [2, 2],
      localPixelResource: ['bakery0', 'aqua0'],
      pixelMatrix: [
        [0],
        [1]
      ],
      initPixel: [
        [1],
        [0]
      ],
      beadCount: countPixelConfigBeads([
        [0],
        [1]
      ])
    }
    mockedReadLevelWorkspacePixelConfig.mockResolvedValueOnce([internalPixelConfig])
    mockedReadLevelWorkspacePixelPalettes.mockResolvedValueOnce({
      version: 1,
      items: [
        {
          pixelImageId: 1002,
          name: 'cake',
          colors: [
            { r: 12, g: 34, b: 56, a: 255 },
            { r: 90, g: 80, b: 70, a: 255 }
          ],
          updatedAt: '2026-05-19T00:00:00.000Z'
        }
      ]
    })

    const loadButton = container.querySelector<HTMLButtonElement>('[data-testid="internal-pixel-load"]')
    expect(loadButton).not.toBeNull()

    flushSync(() => {
      loadButton!.click()
    })
    await flushEffects()

    const selector = container.querySelector<HTMLSelectElement>('[data-testid="internal-pixel-select"]')
    expect(selector).not.toBeNull()

    flushSync(() => {
      setSelectValue(selector!, '1002')
    })
    await flushEffects()

    const colorPreviews = Array.from(container.querySelectorAll<HTMLElement>('.index-color-preview'))
    expect(colorPreviews.map((item) => item.style.backgroundColor)).toEqual([
      'rgb(241, 240, 231)',
      'rgb(0, 255, 255)'
    ])
  })

  it('falls back to saved palette colors for indices missing from the resource table', async () => {
    const internalPixelConfig: PixelConfigItem = {
      id: 1002,
      name: 'cake',
      gridWidthHeight: [1, 2],
      pixelWidthHeight: [2, 2],
      localPixelResource: ['bakery0', 'missing-resource'],
      pixelMatrix: [
        [0],
        [1]
      ],
      initPixel: [
        [1],
        [0]
      ],
      beadCount: countPixelConfigBeads([
        [0],
        [1]
      ])
    }
    mockedReadLevelWorkspacePixelConfig.mockResolvedValueOnce([internalPixelConfig])
    mockedReadLevelWorkspacePixelPalettes.mockResolvedValueOnce({
      version: 1,
      items: [
        {
          pixelImageId: 1002,
          name: 'cake',
          colors: [
            { r: 12, g: 34, b: 56, a: 255 },
            { r: 90, g: 80, b: 70, a: 255 }
          ],
          updatedAt: '2026-05-19T00:00:00.000Z'
        }
      ]
    })

    const loadButton = container.querySelector<HTMLButtonElement>('[data-testid="internal-pixel-load"]')
    expect(loadButton).not.toBeNull()

    flushSync(() => {
      loadButton!.click()
    })
    await flushEffects()

    const selector = container.querySelector<HTMLSelectElement>('[data-testid="internal-pixel-select"]')
    expect(selector).not.toBeNull()

    flushSync(() => {
      setSelectValue(selector!, '1002')
    })
    await flushEffects()

    const colorPreviews = Array.from(container.querySelectorAll<HTMLElement>('.index-color-preview'))
    expect(colorPreviews.map((item) => item.style.backgroundColor)).toEqual([
      'rgb(241, 240, 231)',
      'rgb(90, 80, 70)'
    ])
  })

  it('loads the existing initPixel and pixel matrix previews without generating a new sort', async () => {
    const internalPixelConfig: PixelConfigItem = {
      id: 1002,
      name: 'cake',
      gridWidthHeight: [2, 2],
      pixelWidthHeight: [2, 2],
      localPixelResource: ['bakery0', 'aqua0'],
      pixelMatrix: [
        [0, 1],
        [1, 0]
      ],
      initPixel: [
        [1, 0],
        [0, 1]
      ],
      beadCount: countPixelConfigBeads([
        [0, 1],
        [1, 0]
      ])
    }
    mockedReadLevelWorkspacePixelConfig.mockResolvedValueOnce([internalPixelConfig])

    const loadButton = container.querySelector<HTMLButtonElement>('[data-testid="internal-pixel-load"]')
    expect(loadButton).not.toBeNull()

    flushSync(() => {
      loadButton!.click()
    })
    await flushEffects()

    const selector = container.querySelector<HTMLSelectElement>('[data-testid="internal-pixel-select"]')
    expect(selector).not.toBeNull()

    flushSync(() => {
      setSelectValue(selector!, '1002')
    })
    await flushEffects()

    const sortPanel = container.querySelector<HTMLElement>('[data-testid="level-production-sort-panel"]')
    expect(sortPanel).not.toBeNull()

    const mapCells = sortPanel!.querySelectorAll<HTMLElement>(
      '[data-testid="level-production-map-resource-preview"] .level-production-preview-cell'
    )
    const pointCells = sortPanel!.querySelectorAll<HTMLElement>(
      '[data-testid="level-production-point-resource-preview"] .level-production-preview-cell'
    )
    expect(mapCells).toHaveLength(4)
    expect(pointCells).toHaveLength(4)

    const mapFirstCellImages = mapCells[0]?.querySelectorAll<HTMLImageElement>('img') ?? []
    const pointFirstCellImages = pointCells[0]?.querySelectorAll<HTMLImageElement>('img') ?? []
    expect(mapFirstCellImages[0]?.src).toContain('/resource/grid/bakery0_2.png')
    expect(pointFirstCellImages[0]?.src).toContain('/resource/grid/aqua0_2.png')

    expect(mockedGenerateSortedGridByTargetBlockCount).not.toHaveBeenCalled()
    expect(mockedGenerateStructureAwareSortedGrid).not.toHaveBeenCalled()
    expect(mockedGenerateRegionRecolorSortedGrid).not.toHaveBeenCalled()
  })

  it('keeps showing initPixel previews when switching to another internal pixel config with initPixel', async () => {
    const firstConfig: PixelConfigItem = {
      id: 1001,
      name: 'alpha',
      gridWidthHeight: [2, 2],
      pixelWidthHeight: [2, 2],
      localPixelResource: ['bakery0', 'aqua0'],
      pixelMatrix: [
        [0, 1],
        [1, 0]
      ],
      initPixel: [
        [1, 0],
        [0, 1]
      ],
      beadCount: 4
    }
    const secondConfig: PixelConfigItem = {
      id: 1002,
      name: 'beta',
      gridWidthHeight: [2, 2],
      pixelWidthHeight: [2, 2],
      localPixelResource: ['bakery0', 'aqua0'],
      pixelMatrix: [
        [1, 0],
        [0, 1]
      ],
      initPixel: [
        [0, 1],
        [1, 0]
      ],
      beadCount: 4
    }
    mockedReadLevelWorkspacePixelConfig.mockResolvedValueOnce([firstConfig, secondConfig])

    const loadButton = container.querySelector<HTMLButtonElement>('[data-testid="internal-pixel-load"]')
    flushSync(() => {
      loadButton!.click()
    })
    await flushEffects()

    const selector = container.querySelector<HTMLSelectElement>('[data-testid="internal-pixel-select"]')
    expect(selector).not.toBeNull()

    flushSync(() => {
      setSelectValue(selector!, '1001')
    })
    await flushEffects()

    let sortPanel = container.querySelector<HTMLElement>('[data-testid="level-production-sort-panel"]')
    let pointCells = sortPanel?.querySelectorAll<HTMLElement>(
      '[data-testid="level-production-point-resource-preview"] .level-production-preview-cell'
    ) ?? []
    let pointFirstCellImages = pointCells[0]?.querySelectorAll<HTMLImageElement>('img') ?? []
    expect(pointFirstCellImages[0]?.src).toContain('/resource/grid/aqua0_2.png')

    flushSync(() => {
      setSelectValue(selector!, '1002')
    })
    await flushEffects()

    sortPanel = container.querySelector<HTMLElement>('[data-testid="level-production-sort-panel"]')
    expect(sortPanel).not.toBeNull()
    pointCells = sortPanel!.querySelectorAll<HTMLElement>(
      '[data-testid="level-production-point-resource-preview"] .level-production-preview-cell'
    )
    expect(pointCells).toHaveLength(4)
    pointFirstCellImages = pointCells[0]?.querySelectorAll<HTMLImageElement>('img') ?? []
    expect(pointFirstCellImages[0]?.src).toContain('/resource/grid/bakery0_2.png')
  })

  it('keeps the sort panel empty when the internal pixel config has no initPixel', async () => {
    const internalPixelConfig: PixelConfigItem = {
      id: 1002,
      name: 'cake',
      gridWidthHeight: [2, 2],
      pixelWidthHeight: [2, 2],
      localPixelResource: ['bakery0', 'aqua0'],
      pixelMatrix: [
        [0, 1],
        [1, 0]
      ],
      initPixel: [],
      beadCount: 4
    }
    mockedReadLevelWorkspacePixelConfig.mockResolvedValueOnce([internalPixelConfig])

    const loadButton = container.querySelector<HTMLButtonElement>('[data-testid="internal-pixel-load"]')
    flushSync(() => {
      loadButton!.click()
    })
    await flushEffects()

    const selector = container.querySelector<HTMLSelectElement>('[data-testid="internal-pixel-select"]')
    expect(selector).not.toBeNull()

    flushSync(() => {
      setSelectValue(selector!, '1002')
    })
    await flushEffects()

    expect(container.querySelector('[data-testid="level-production-sort-panel"]')).toBeNull()
  })

  it('replaces the existing background color without touching same-color cells inside the subject', async () => {
    const gridFile = createGridFile('flower.json', JSON.stringify({
      width: 5,
      height: 5,
      grid: [
        [0, 0, 0, 0, 0],
        [0, 1, 1, 1, 0],
        [0, 1, 0, 1, 0],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const backgroundButton = container.querySelector<HTMLButtonElement>('[data-testid="pixel-background-color-tool"]')
    expect(backgroundButton).not.toBeNull()
    flushSync(() => {
      backgroundButton!.click()
    })
    await flushEffects()

    const backgroundPanel = container.querySelector<HTMLElement>('.background-color-palette-container')
    expect(backgroundPanel).not.toBeNull()
    const backgroundPicker = backgroundPanel!.querySelector<HTMLInputElement>('input[type="color"]')
    expect(backgroundPicker).not.toBeNull()

    const colorSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    flushSync(() => {
      colorSetter?.call(backgroundPicker!, '#00ff00')
      backgroundPicker!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flushEffects()

    // 背景换成绿色，主体红环与被包围的白色中心格保持原色
    const colorPreviews = Array.from(container.querySelectorAll<HTMLElement>('.index-color-preview'))
    expect(colorPreviews.map((item) => item.style.backgroundColor)).toEqual([
      'rgb(240, 240, 230)',
      'rgb(219, 57, 55)',
      'rgb(0, 255, 0)'
    ])
    expect(
      container.querySelector<HTMLElement>('.background-color-preview')?.style.backgroundColor
    ).toBe('rgb(0, 255, 0)')

    const downloadButtons = container.querySelectorAll<HTMLButtonElement>('button.download-button')
    flushSync(() => {
      downloadButtons[0].click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(
      expect.stringContaining('        [2, 1, 0, 1, 2],'),
      'flower_point.json'
    )
  })

  it('adds a new background color filling empty cells when no background exists', async () => {
    const gridFile = createGridFile('sticker.json', JSON.stringify({
      width: 2,
      height: 2,
      grid: [
        [-2, -2],
        [-2, 0]
      ],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const backgroundButton = container.querySelector<HTMLButtonElement>('[data-testid="pixel-background-color-tool"]')
    expect(backgroundButton).not.toBeNull()
    flushSync(() => {
      backgroundButton!.click()
    })
    await flushEffects()

    const backgroundPanel = container.querySelector<HTMLElement>('.background-color-palette-container')
    const backgroundPicker = backgroundPanel!.querySelector<HTMLInputElement>('input[type="color"]')
    expect(backgroundPicker).not.toBeNull()

    const colorSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    flushSync(() => {
      colorSetter?.call(backgroundPicker!, '#00ff00')
      backgroundPicker!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flushEffects()

    const colorPreviews = Array.from(container.querySelectorAll<HTMLElement>('.index-color-preview'))
    expect(colorPreviews.map((item) => item.style.backgroundColor)).toEqual([
      'rgb(219, 57, 55)',
      'rgb(0, 255, 0)'
    ])
    expect(
      container.querySelector<HTMLElement>('.background-color-preview')?.style.backgroundColor
    ).toBe('rgb(0, 255, 0)')

    const downloadButtons = container.querySelectorAll<HTMLButtonElement>('button.download-button')
    flushSync(() => {
      downloadButtons[0].click()
    })
    await flushEffects()

    expect(mockedDownloadTextFile).toHaveBeenCalledWith(
      expect.stringContaining('        [1, 1],\n        [1, 0]'),
      'sticker_point.json'
    )
  })

  it('saves level drafts with the generated sorted point grid from the pixel page', async () => {
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 2,
      height: 2,
      grid: [
        [0, 1],
        [1, 0]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const updatePreviewButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('更新关卡预览')
    )
    expect(updatePreviewButton).toBeDefined()

    flushSync(() => {
      updatePreviewButton!.click()
    })
    await flushEffects()

    const saveDraftButtonBeforeSort = container.querySelector<HTMLButtonElement>('[data-testid="level-production-save-draft"]')
    expect(saveDraftButtonBeforeSort).not.toBeNull()
    expect(saveDraftButtonBeforeSort!.disabled).toBe(true)

    switchToLegacySort(container)

    const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    const overflowInput = container.querySelector<HTMLInputElement>('#levelOverflowConstraintInput')
    expect(sortButton).not.toBeNull()
    expect(overflowInput).not.toBeNull()

    flushSync(() => {
      setInputValue(overflowInput!, '2')
    })
    await flushEffects()

    flushSync(() => {
      sortButton!.click()
    })
    await flushEffects()

    expect(mockedGenerateSortedGridByTargetBlockCount).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'flower' }),
      30,
      {
        overflowConstraint: 2,
        inferExternalBackground: false,
        normalizeExternalBackground: true
      }
    )
    const saveDraftButton = container.querySelector<HTMLButtonElement>('[data-testid="level-production-save-draft"]')
    expect(saveDraftButton).not.toBeNull()
    expect(saveDraftButton!.disabled).toBe(false)
    const sortPanel = container.querySelector<HTMLElement>('[data-testid="level-production-sort-panel"]')
    expect(sortPanel?.querySelector('[data-testid="level-production-map-resource-preview"]')).not.toBeNull()
    const pointResourcePreview = sortPanel?.querySelector('[data-testid="level-production-point-resource-preview"]')
    expect(pointResourcePreview).not.toBeNull()
    const pointPreviewImages = pointResourcePreview?.querySelectorAll('img') ?? []
    expect(pointPreviewImages).toHaveLength(8)
    expect(pointPreviewImages[0]?.getAttribute('src')).toBe('/resource/grid/bakery0_2.png')
    expect(pointPreviewImages[1]?.getAttribute('src')).toBe('/resource/grid/bakery0_3.png')

    flushSync(() => {
      saveDraftButton!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelDraft).toHaveBeenCalledWith(
      'flower',
      expect.objectContaining({
        map: expect.objectContaining({
          fileName: 'flower',
          colorIndices: [
            [0, 1],
            [1, 0]
          ]
        }),
        point: expect.objectContaining({
          fileName: 'flower_sorted',
          colorIndices: [
            [1, 0],
            [0, 1]
          ]
        }),
        pixelConfig: expect.objectContaining({
          initPixel: [
            [1, 0],
            [0, 1]
          ]
        })
      })
    )
    expect(mockedSaveLevelWorkspacePixelPalettes).toHaveBeenCalledWith({
      version: 1,
      items: [
        expect.objectContaining({
          name: 'flower',
          colors: [
            { r: 240, g: 240, b: 230, a: 255 },
            { r: 219, g: 57, b: 55, a: 255 }
          ]
        })
      ]
    })
  })

  it('saves dragged swaps from the sorted point resource preview into initPixel', async () => {
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 2,
      height: 2,
      grid: [
        [0, 1],
        [1, 0]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const updatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    expect(updatePreviewButton).not.toBeUndefined()

    flushSync(() => {
      updatePreviewButton.click()
    })
    await flushEffects()

    const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    expect(sortButton).not.toBeNull()

    flushSync(() => {
      sortButton!.click()
    })
    await flushEffects()

    const sortPanel = container.querySelector<HTMLElement>('[data-testid="level-production-sort-panel"]')
    expect(sortPanel).not.toBeNull()

    const resourcePreviewCells = sortPanel!.querySelectorAll<HTMLElement>(
      '[data-testid="level-production-point-resource-preview"] .level-production-preview-cell'
    )
    expect(resourcePreviewCells).toHaveLength(4)

    flushSync(() => {
      resourcePreviewCells[0].dispatchEvent(new Event('dragstart', { bubbles: true }))
      resourcePreviewCells[1].dispatchEvent(new Event('dragover', { bubbles: true }))
      resourcePreviewCells[1].dispatchEvent(new Event('drop', { bubbles: true }))
    })
    await flushEffects()

    const saveDraftButton = container.querySelector<HTMLButtonElement>('[data-testid="level-production-save-draft"]')
    expect(saveDraftButton).not.toBeNull()

    flushSync(() => {
      saveDraftButton!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelDraft).toHaveBeenCalledWith(
      'flower',
      expect.objectContaining({
        point: expect.objectContaining({
          colorIndices: [
            [0, 1],
            [0, 1]
          ]
        }),
        pixelConfig: expect.objectContaining({
          initPixel: [
            [0, 1],
            [0, 1]
          ]
        })
      })
    )
  })

  it('shows the unsorted map resource preview beside the sorted point resource preview', async () => {
    await loadGridAndGenerateSort(container)

    const mapImages = container.querySelectorAll<HTMLImageElement>(
      '[data-testid="level-production-map-resource-preview"] img'
    )
    const sortPanel = container.querySelector<HTMLElement>('[data-testid="level-production-sort-panel"]')
    expect(sortPanel).not.toBeNull()

    const sortPanelMapCells = sortPanel!.querySelectorAll<HTMLElement>(
      '[data-testid="level-production-map-resource-preview"] .level-production-preview-cell'
    )
    const pointCells = sortPanel!.querySelectorAll<HTMLElement>(
      '[data-testid="level-production-point-resource-preview"] .level-production-preview-cell'
    )
    const sortPanelMapImages = sortPanelMapCells[0]?.querySelectorAll<HTMLImageElement>('img') ?? []
    const secondMapCellImages = sortPanelMapCells[1]?.querySelectorAll<HTMLImageElement>('img') ?? []
    const pointImages = pointCells[0]?.querySelectorAll<HTMLImageElement>('img') ?? []
    const secondPointCellImages = pointCells[1]?.querySelectorAll<HTMLImageElement>('img') ?? []

    expect(mapImages.length).toBeGreaterThanOrEqual(4)
    expect(sortPanelMapImages[0]?.src).toContain('/resource/grid/bakery0_2.png')
    expect(sortPanelMapImages[1]?.src).toContain('/resource/grid/bakery0_3.png')
    expect(sortPanelMapImages[1]?.style.top).toBe('50%')
    expect(sortPanelMapImages[1]?.style.left).toBe('50%')
    expect(sortPanelMapImages[1]?.style.right).toBe('auto')
    expect(sortPanelMapImages[1]?.style.bottom).toBe('auto')
    expect(sortPanelMapImages[1]?.style.inset).toBe('')
    expect(secondMapCellImages[0]?.src).toContain('/resource/grid/aqua0_2.png')
    expect(secondMapCellImages[1]?.src).toContain('/resource/grid/aqua0_3.png')
    expect(pointImages[0]?.src).toContain('/resource/grid/aqua0_2.png')
    expect(pointImages[1]?.src).toContain('/resource/grid/aqua0_3.png')
    expect(secondPointCellImages[0]?.src).toContain('/resource/grid/bakery0_2.png')
    expect(secondPointCellImages[1]?.src).toContain('/resource/grid/bakery0_3.png')
  })

  it('downloads transparent PNG images for the visible map and point resource previews', async () => {
    const drawImage = vi.fn()
    const clickedAnchors: HTMLAnchorElement[] = []
    const originalCreateElement = document.createElement.bind(document)
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:level-preview')
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    canvasContext.drawImage = drawImage
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

    await loadGridAndGenerateSort(container)

    const sortPanel = container.querySelector<HTMLElement>('[data-testid="level-production-sort-panel"]')
    const downloadButtons = Array.from(sortPanel?.querySelectorAll<HTMLButtonElement>('button') ?? []).filter(
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
    expect(drawImage).toHaveBeenCalledTimes(16)
    expect(drawCalls).toContainEqual(['/resource/grid/bakery0_2.png', 0, 0, 128, 128])
    expect(drawCalls).toContainEqual(['/resource/grid/bakery0_3.png', 10.24, 10.24, 107.52, 107.52])
    expect(drawCalls).toContainEqual(['/resource/grid/aqua0_2.png', 0, 0, 128, 128])
    expect(drawCalls).toContainEqual(['/resource/grid/aqua0_3.png', 10.24, 10.24, 107.52, 107.52])
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2)
    expect(clickedAnchors.map((anchor) => anchor.download)).toEqual([
      'flower-map-resource-preview.png',
      'flower_sorted-point-resource-preview.png'
    ])
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:level-preview')
  })

  it('regenerates level sorting from the edited indexed colors after a previous sort exists', async () => {
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 2,
      height: 2,
      grid: [
        [0, 1],
        [1, 0]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const updatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    expect(updatePreviewButton).not.toBeUndefined()

    flushSync(() => {
      updatePreviewButton.click()
    })
    await flushEffects()

    const sortButtonBeforeEdit = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    expect(sortButtonBeforeEdit).not.toBeNull()

    flushSync(() => {
      sortButtonBeforeEdit!.click()
    })
    await flushEffects()

    mockedGenerateSortedGridByTargetBlockCount.mockClear()
    mockedGenerateStructureAwareSortedGrid.mockClear()

    const firstIndexButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button.index-item')).find((button) =>
      button.textContent?.includes('ID: 0')
    )
    expect(firstIndexButton).toBeDefined()

    flushSync(() => {
      firstIndexButton!.click()
    })
    await flushEffects()

    const colorInput = container.querySelector<HTMLInputElement>('.index-panel input[type="color"]')
    expect(colorInput).not.toBeNull()

    flushSync(() => {
      setInputValue(colorInput!, '#123456')
    })
    await flushEffects()

    const applyColorButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.index-panel button')).find((button) =>
      button.textContent?.includes('应用颜色')
    )
    expect(applyColorButton).toBeDefined()

    flushSync(() => {
      applyColorButton!.click()
    })
    await flushEffects()

    switchToLegacySort(container)

    const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    expect(sortButton).not.toBeNull()
    expect(sortButton!.disabled).toBe(false)

    flushSync(() => {
      sortButton!.click()
    })
    await flushEffects()

    expect(mockedGenerateSortedGridByTargetBlockCount).toHaveBeenCalled()
    const sortCalls = mockedGenerateSortedGridByTargetBlockCount.mock.calls
    const sortedSource = sortCalls[sortCalls.length - 1]?.[0]
    expect(sortedSource?.colors[0]).toEqual({ r: 18, g: 52, b: 86, a: 255 })
    expect(sortedSource?.colorIndices).toEqual([
      [0, 1],
      [1, 0]
    ])

    const updatedFirstIndexButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button.index-item')).find((button) =>
      button.textContent?.includes('ID: 0')
    )
    const updatedColorPreview = updatedFirstIndexButton?.querySelector<HTMLElement>('.index-color-preview')
    expect(updatedColorPreview?.style.backgroundColor).toBe('rgb(18, 52, 86)')
  })

  it('renders resource previews instead of the legacy solid color sort preview', async () => {
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 2,
      height: 2,
      grid: [
        [0, 1],
        [1, 0]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const updatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    expect(updatePreviewButton).not.toBeUndefined()

    flushSync(() => {
      updatePreviewButton.click()
    })
    await flushEffects()

    const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    expect(sortButton).not.toBeNull()

    flushSync(() => {
      sortButton!.click()
    })
    await flushEffects()

    const sortPanel = container.querySelector<HTMLElement>('[data-testid="level-production-sort-panel"]')
    expect(sortPanel).not.toBeNull()

    expect(sortPanel!.querySelector('[data-testid="level-production-color-preview"]')).toBeNull()
    expect(sortPanel!.querySelector('[data-testid="level-production-map-resource-preview"]')).not.toBeNull()
    expect(sortPanel!.querySelector('[data-testid="level-production-point-resource-preview"]')).not.toBeNull()
  })

  it('samples scaled canvas coordinates when Alt-picking from the processed grid canvas', async () => {
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 2,
      height: 1,
      grid: [[0, 1]],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const secondIndexButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button.index-item')).find((button) =>
      button.textContent?.includes('ID: 1')
    )
    expect(secondIndexButton).toBeDefined()

    flushSync(() => {
      secondIndexButton!.click()
    })
    await flushEffects()

    const resultCanvas = container.querySelectorAll<HTMLCanvasElement>('canvas')[1]
    expect(resultCanvas).not.toBeUndefined()

    Object.defineProperty(resultCanvas!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 10,
        top: 20,
        width: 1,
        height: 1,
        right: 11,
        bottom: 21,
        x: 10,
        y: 20,
        toJSON: () => ({})
      })
    })

    canvasContext.getImageData.mockImplementation((x = 0) => ({
      data: new Uint8ClampedArray(x >= 1 ? [10, 20, 30, 255] : [200, 210, 220, 255])
    }))

    const elementFromPoint = vi.fn(() => resultCanvas)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint
    })

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true }))
    })
    await flushEffects()

    flushSync(() => {
      document.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 10.75,
        clientY: 20.5
      }))
    })
    await flushEffects()

    expect(canvasContext.getImageData).toHaveBeenCalledWith(1, 0, 1, 1)

    const applyColorButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.index-panel button')).find((button) =>
      button.textContent?.includes('应用颜色')
    )
    expect(applyColorButton).toBeDefined()

    flushSync(() => {
      applyColorButton!.click()
    })
    await flushEffects()

    const updatedSecondIndexButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button.index-item')).find((button) =>
      button.textContent?.includes('ID: 1')
    )
    const updatedColorPreview = updatedSecondIndexButton?.querySelector<HTMLElement>('.index-color-preview')

    expect(updatedColorPreview?.style.backgroundColor).toBe('rgb(10, 20, 30)')
  })

  it('syncs manual draft color replacements into the grid used for level sorting', async () => {
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 2,
      height: 2,
      grid: [
        [0, 1],
        [1, 0]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const updatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    expect(updatePreviewButton).not.toBeUndefined()

    flushSync(() => {
      updatePreviewButton.click()
    })
    await flushEffects()

    const manualInputs = container.querySelectorAll<HTMLInputElement>('.level-production-match input')
    expect(manualInputs.length).toBeGreaterThan(0)

    flushSync(() => {
      setInputValue(manualInputs[0], 'aqua0')
    })
    await flushEffects()

    switchToLegacySort(container)

    const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    expect(sortButton).not.toBeNull()

    flushSync(() => {
      sortButton!.click()
    })
    await flushEffects()

    const sortCalls = mockedGenerateSortedGridByTargetBlockCount.mock.calls
    const sortedSource = sortCalls[sortCalls.length - 1]?.[0]
    expect(sortedSource?.colors[0]).toEqual({ r: 0, g: 255, b: 255, a: 255 })

    const updatedManualInputs = container.querySelectorAll<HTMLInputElement>('.level-production-match input')
    expect(updatedManualInputs[0]?.value).toBe('aqua0')
  })

  it('publishes pixel page bottom resource changes into pixelconfig localPixelResource', async () => {
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 2,
      height: 2,
      grid: [
        [0, 1],
        [1, 0]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const updatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    expect(updatePreviewButton).not.toBeUndefined()

    flushSync(() => {
      updatePreviewButton.click()
    })
    await flushEffects()

    const manualInputs = container.querySelectorAll<HTMLInputElement>('.level-production-match input')
    expect(manualInputs.length).toBeGreaterThan(0)

    flushSync(() => {
      setInputValue(manualInputs[0], 'aqua0')
    })
    await flushEffects()

    const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    expect(sortButton).not.toBeNull()

    flushSync(() => {
      sortButton!.click()
    })
    await flushEffects()

    const publishButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('加入内部 pixelconfig')
    )
    expect(publishButton).not.toBeUndefined()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'flower',
        localPixelResource: ['aqua0', 'bakery0']
      })
    ])
  })

  it('publishes pixel page replacement picker choices into pixelconfig localPixelResource', async () => {
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 2,
      height: 2,
      grid: [
        [0, 1],
        [1, 0]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const updatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    expect(updatePreviewButton).not.toBeUndefined()

    flushSync(() => {
      updatePreviewButton.click()
    })
    await flushEffects()

    const replaceButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('更换')
    )
    expect(replaceButton).not.toBeUndefined()

    flushSync(() => {
      replaceButton!.click()
    })
    await flushEffects()

    const aquaOption = Array.from(container.querySelectorAll<HTMLButtonElement>('.level-production-resource-option')).find(
      (button) => button.textContent?.includes('aqua0')
    )
    expect(aquaOption).not.toBeUndefined()

    flushSync(() => {
      aquaOption!.click()
    })
    await flushEffects()

    const confirmButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('确认')
    )
    expect(confirmButton).not.toBeUndefined()

    flushSync(() => {
      confirmButton!.click()
    })
    await flushEffects()

    const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    expect(sortButton).not.toBeNull()

    flushSync(() => {
      sortButton!.click()
    })
    await flushEffects()

    const publishButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('加入内部 pixelconfig')
    )
    expect(publishButton).not.toBeUndefined()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'flower',
        localPixelResource: ['aqua0', 'bakery0']
      })
    ])
  })

  it('replaces an existing internal pixel config with pixel page bottom resource changes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockedReadLevelWorkspacePixelConfig.mockResolvedValue([
      {
        id: 1234,
        name: 'flower',
        gridWidthHeight: [2, 2],
        pixelWidthHeight: [21, 21],
        localPixelResource: ['bakery0', 'bakery0'],
        pixelMatrix: [
          [0, 1],
          [1, 0]
        ],
        initPixel: [
          [0, 1],
          [1, 0]
        ],
        beadCount: countPixelConfigBeads([
          [0, 1],
          [1, 0]
        ])
      }
    ])
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 2,
      height: 2,
      grid: [
        [0, 1],
        [1, 0]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const updatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    expect(updatePreviewButton).not.toBeUndefined()

    flushSync(() => {
      updatePreviewButton.click()
    })
    await flushEffects()

    const manualInputs = container.querySelectorAll<HTMLInputElement>('.level-production-match input')
    expect(manualInputs.length).toBeGreaterThan(0)

    flushSync(() => {
      setInputValue(manualInputs[0], 'aqua0')
    })
    await flushEffects()

    const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    expect(sortButton).not.toBeNull()

    flushSync(() => {
      sortButton!.click()
    })
    await flushEffects()

    const publishButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('加入内部 pixelconfig')
    )
    expect(publishButton).not.toBeUndefined()

    flushSync(() => {
      publishButton!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 1234,
        name: 'flower',
        localPixelResource: ['aqua0', 'bakery0']
      })
    ])
  })

  it('keeps external empty cells when merging indexed colors before level sorting', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 3,
      height: 3,
      grid: [
        [-2, 0, -2],
        [0, 1, 0],
        [-2, 0, -2]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const secondIndexButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button.index-item')).find((button) =>
      button.textContent?.includes('ID: 1')
    )
    expect(secondIndexButton).toBeDefined()

    flushSync(() => {
      secondIndexButton!.click()
    })
    await flushEffects()

    const colorInput = container.querySelector<HTMLInputElement>('.index-panel input[type="color"]')
    expect(colorInput).not.toBeNull()

    flushSync(() => {
      setInputValue(colorInput!, '#f0f0e6')
    })
    await flushEffects()

    const applyColorButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.index-panel button')).find((button) =>
      button.textContent?.includes('应用颜色')
    )
    expect(applyColorButton).toBeDefined()

    flushSync(() => {
      applyColorButton!.click()
    })
    await flushEffects()

    const updatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    expect(updatePreviewButton).not.toBeUndefined()

    flushSync(() => {
      updatePreviewButton.click()
    })
    await flushEffects()

    switchToLegacySort(container)

    const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    expect(sortButton).not.toBeNull()

    flushSync(() => {
      sortButton!.click()
    })
    await flushEffects()

    const sortCalls = mockedGenerateSortedGridByTargetBlockCount.mock.calls
    const sortedSource = sortCalls[sortCalls.length - 1]?.[0]
    expect(sortedSource?.colorIndices).toEqual([
      [-2, 0, -2],
      [0, 0, 0],
      [-2, 0, -2]
    ])
    expect(sortedSource?.colors).toEqual([
      { r: 240, g: 240, b: 230, a: 255 }
    ])
  })

  it('can generate level sorting from the full grid when subject grid usage is disabled', async () => {
    const gridFile = createGridFile('flower_grid_colors.json', JSON.stringify({
      width: 3,
      height: 3,
      grid: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0]
      ],
      colors: [
        { r: 240, g: 240, b: 230, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    const updatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    expect(updatePreviewButton).not.toBeUndefined()

    flushSync(() => {
      updatePreviewButton.click()
    })
    await flushEffects()

    const useSubjectCheckbox = container.querySelector<HTMLInputElement>('[data-testid="level-sort-use-subject-grid"]')
    expect(useSubjectCheckbox).not.toBeNull()
    expect(useSubjectCheckbox!.checked).toBe(true)

    flushSync(() => {
      useSubjectCheckbox!.click()
    })
    await flushEffects()

    switchToLegacySort(container)

    const sortButton = container.querySelector<HTMLButtonElement>('[data-testid="level-sort-generate"]')
    expect(sortButton).not.toBeNull()

    flushSync(() => {
      sortButton!.click()
    })
    await flushEffects()

    const sortCalls = mockedGenerateSortedGridByTargetBlockCount.mock.calls
    const sortedSource = sortCalls[sortCalls.length - 1]?.[0]
    const sortOptions = sortCalls[sortCalls.length - 1]?.[2]
    expect(sortedSource).toEqual(expect.objectContaining({
      fileName: 'flower',
      width: 3,
      height: 3,
      colorIndices: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0]
      ]
    }))
    expect(sortOptions).toEqual(expect.objectContaining({
      inferExternalBackground: false,
      normalizeExternalBackground: false
    }))
  })

  it('keeps the previous export basename when a new grid file fails to parse', async () => {
    const alertSpy = vi.spyOn(window, 'alert')
    const validGridFile = createGridFile('flower.json', JSON.stringify({
      width: 1,
      height: 1,
      grid: [[0]],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 }
      ]
    }))
    const invalidGridFile = createGridFile('broken_grid_colors.json', '{"width": 1}')
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')
    const downloadButton = container.querySelector<HTMLButtonElement>('button.download-button')

    expect(gridInput).not.toBeNull()
    expect(downloadButton).not.toBeNull()

    setInputFiles(gridInput!, [validGridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    setInputFiles(gridInput!, [invalidGridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    flushSync(() => {
      downloadButton!.click()
    })
    await flushEffects()

    expect(alertSpy).toHaveBeenCalled()
    expect(mockedDownloadTextFile).toHaveBeenCalledWith(buildGridOutputJson({
      width: 1,
      height: 1,
      colorIndices: [[0]],
      colors: [
        { r: 219, g: 57, b: 55, a: 255 }
      ],
      fileName: 'flower'
    }), 'flower_point.json')
  })

  it('refreshes an imported grid with the latest color tolerance without updating the level preview draft', async () => {
    const gridFile = createGridFile('flower_subject_grid_colors.json', JSON.stringify({
      width: 2,
      height: 1,
      grid: [[0, 1]],
      colors: [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 1, g: 1, b: 1, a: 255 }
      ]
    }))
    const gridInput = container.querySelector<HTMLInputElement>('#gridColorInput')

    expect(gridInput).not.toBeNull()

    setInputFiles(gridInput!, [gridFile])
    flushSync(() => {
      gridInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushEffects()

    expect(container.querySelectorAll('button.index-item')).toHaveLength(2)

    const updatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    expect(updatePreviewButton).not.toBeUndefined()

    flushSync(() => {
      updatePreviewButton.click()
    })
    await flushEffects()

    expect(container.textContent).toContain('颜色数量：2')

    flushSync(() => {
      root.render(<ImageProcessor gridSize={1} colorTolerance={100} gridRefreshVersion={1} />)
    })
    await flushEffects()

    expect(container.querySelectorAll('button.index-item')).toHaveLength(1)
    expect(container.textContent).toContain('颜色数量：2')

    const nextUpdatePreviewButton = container.querySelectorAll<HTMLButtonElement>('button.update-button')[1]
    flushSync(() => {
      nextUpdatePreviewButton.click()
    })
    await flushEffects()

    expect(container.textContent).toContain('颜色数量：1')
  })
})
