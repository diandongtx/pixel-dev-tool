import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildBeadThumbnailDataUrl } from '../../utils/beadThumbnail'
import { downloadTextFile } from '../../utils/configIO'
import { saveLevelDraft, saveLevelWorkspaceThumbnail } from '../../utils/levelWorkspaceClient'
import { LevelProductionWorkbench } from '../LevelProductionWorkbench'

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
        resourceName: 'caffee1',
        compareColor: { r: 192, g: 161, b: 30, a: 255 },
        stateFiles: {
          2: { name: 'caffee1_2.png', url: '/resource/grid/caffee1_2.png' },
          3: { name: 'caffee1_3.png', url: '/resource/grid/caffee1_3.png' },
          4: { name: 'caffee1_4.png', url: '/resource/grid/caffee1_4.png' }
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
    { name: 'bakery0_4.png', url: '/resource/grid/bakery0_4.png' },
    { name: 'caffee1_2.png', url: '/resource/grid/caffee1_2.png' },
    { name: 'caffee1_3.png', url: '/resource/grid/caffee1_3.png' },
    { name: 'caffee1_4.png', url: '/resource/grid/caffee1_4.png' }
  ])
}))

vi.mock('../../utils/configIO', async () => {
  const actual = await vi.importActual<typeof import('../../utils/configIO')>('../../utils/configIO')

  return {
    ...actual,
    downloadTextFile: vi.fn()
  }
})

vi.mock('../../utils/beadThumbnail', () => ({
  buildBeadThumbnailDataUrl: vi.fn(async () => 'data:image/png;base64,thumbnail')
}))

vi.mock('../../utils/levelWorkspaceClient', () => ({
  saveLevelDraft: vi.fn(async () => ({ name: 'flower' })),
  saveLevelWorkspaceThumbnail: vi.fn(async () => ({ ok: true, path: 'resource/thumbnail/flower.png' }))
}))

const mockedBuildBeadThumbnailDataUrl = vi.mocked(buildBeadThumbnailDataUrl)
const mockedDownloadTextFile = vi.mocked(downloadTextFile)
const mockedSaveLevelDraft = vi.mocked(saveLevelDraft)
const mockedSaveLevelWorkspaceThumbnail = vi.mocked(saveLevelWorkspaceThumbnail)

const setInputFiles = (input: HTMLInputElement, files: File[]) => {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files
  })
}

const changeInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const createTextFile = (name: string, contents: string): File => {
  const file = new File([contents], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: vi.fn(async () => contents)
  })
  return file
}

const flushEffects = async () => {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

const importMap = async (container: HTMLDivElement) => {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]')
  const gridJson = JSON.stringify({
    width: 1,
    height: 1,
    grid: [[0]],
    colors: [{ r: 240, g: 240, b: 230, a: 255 }]
  })

  setInputFiles(inputs[0]!, [createTextFile('flower_map.json', gridJson)])
  flushSync(() => {
    inputs[0]!.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await flushEffects()
}

describe('LevelProductionWorkbench', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    flushSync(() => {
      root.unmount()
    })
    container.remove()
    mockedBuildBeadThumbnailDataUrl.mockClear()
    mockedDownloadTextFile.mockClear()
    mockedSaveLevelDraft.mockClear()
    mockedSaveLevelWorkspaceThumbnail.mockClear()
    vi.restoreAllMocks()
  })

  it('imports a map and automatically displays default resource matches', async () => {
    flushSync(() => {
      root.render(<LevelProductionWorkbench />)
    })

    await flushEffects()
    await importMap(container)

    expect(container.textContent).toContain('flower')
    expect(container.textContent).toContain('bakery0')
    expect(container.textContent).toContain('high')
    expect(container.querySelector('button')?.textContent).toContain('导入 map')
    expect(container.textContent).not.toContain('扫描豆子资源目录')
  })

  it('shows all three bead state images for each matched color and a map preview', async () => {
    flushSync(() => {
      root.render(<LevelProductionWorkbench />)
    })

    await flushEffects()
    await importMap(container)

    expect(container.querySelector('img[alt="bakery0 状态 2"]')?.getAttribute('src')).toBe('/resource/grid/bakery0_2.png')
    expect(container.querySelector('img[alt="bakery0 状态 3"]')?.getAttribute('src')).toBe('/resource/grid/bakery0_3.png')
    expect(container.querySelector('img[alt="bakery0 状态 4"]')?.getAttribute('src')).toBe('/resource/grid/bakery0_4.png')
    expect(container.textContent).toContain('原色像素预览')
    expect(container.textContent).toContain('豆子资源预览')
    expect(container.querySelector('[data-testid="level-production-color-preview"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="level-production-bead-preview"]')).not.toBeNull()
    expect(container.querySelector('img[alt="预览格子 1-1 bakery0"]')?.getAttribute('src')).toBe('/resource/grid/bakery0_4.png')
  })

  it('exports a pixelconfig draft with resource group names only', async () => {
    flushSync(() => {
      root.render(<LevelProductionWorkbench />)
    })

    await flushEffects()
    await importMap(container)

    const exportButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('导出 pixelconfig 草稿')
    )

    flushSync(() => {
      exportButton!.click()
    })

    const [contents, fileName] = mockedDownloadTextFile.mock.calls[0] ?? []
    expect(fileName).toBe('flower_pixelconfig_draft.json')
    expect(JSON.parse(String(contents))[0].localPixelResource).toEqual(['bakery0'])
  })

  it('uses manual resource overrides when exporting the pixelconfig draft', async () => {
    flushSync(() => {
      root.render(<LevelProductionWorkbench />)
    })

    await flushEffects()
    await importMap(container)

    const overrideInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="手动替换颜色 0 的资源"]'
    )
    expect(overrideInput).not.toBeNull()

    flushSync(() => {
      changeInputValue(overrideInput!, 'custom0')
    })

    const exportButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('导出 pixelconfig 草稿')
    )

    flushSync(() => {
      exportButton!.click()
    })

    const [contents] = mockedDownloadTextFile.mock.calls[0] ?? []
    expect(JSON.parse(String(contents))[0].localPixelResource).toEqual(['custom0'])
  })

  it('saves the current map as a local level draft', async () => {
    flushSync(() => {
      root.render(<LevelProductionWorkbench />)
    })

    await flushEffects()
    await importMap(container)

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('保存草稿')
    )

    expect(saveButton).toBeDefined()

    flushSync(() => {
      saveButton!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelDraft).toHaveBeenCalledWith(
      'flower',
      expect.objectContaining({
        map: expect.objectContaining({ fileName: 'flower', width: 1, height: 1 }),
        point: expect.objectContaining({ fileName: 'flower', width: 1, height: 1 }),
        pixelConfig: expect.objectContaining({
          name: 'flower',
          localPixelResource: ['bakery0']
        })
      })
    )
    expect(mockedBuildBeadThumbnailDataUrl).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'flower', width: 1, height: 1 }),
      expect.any(Array),
      expect.any(Array)
    )
    expect(mockedSaveLevelWorkspaceThumbnail).toHaveBeenCalledWith(
      'flower',
      'data:image/png;base64,thumbnail'
    )
    expect(container.textContent).toContain('已保存草稿：flower')
  })

  it('replaces a matched bead resource from the color picker panel', async () => {
    flushSync(() => {
      root.render(<LevelProductionWorkbench />)
    })

    await flushEffects()
    await importMap(container)

    const replaceButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('更换')
    )
    expect(replaceButton).toBeDefined()

    flushSync(() => {
      replaceButton!.click()
    })

    expect(container.textContent).toContain('更换豆子资源')
    expect(container.textContent).toContain('当前颜色')
    expect(container.textContent).toContain('新选择颜色')
    expect(container.textContent).toContain('caffee1')
    expect(container.textContent).toContain('C0A11E')
    expect(container.querySelector('img[alt="caffee1 4号资源"]')?.getAttribute('src')).toBe('/resource/grid/caffee1_4.png')

    const caffeeButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('caffee1')
    )
    expect(caffeeButton).toBeDefined()

    flushSync(() => {
      caffeeButton!.click()
    })

    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('确认')
    )

    flushSync(() => {
      confirmButton!.click()
    })

    expect(container.textContent).not.toContain('更换豆子资源')
    expect(container.querySelector('img[alt="预览格子 1-1 caffee1"]')?.getAttribute('src')).toBe('/resource/grid/caffee1_4.png')

    const exportButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('导出 pixelconfig 草稿')
    )

    flushSync(() => {
      exportButton!.click()
    })

    const [contents] = mockedDownloadTextFile.mock.calls[0] ?? []
    expect(JSON.parse(String(contents))[0].localPixelResource).toEqual(['caffee1'])
  })
})
