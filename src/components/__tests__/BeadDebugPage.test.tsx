import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beadTemplates,
  buildBeadAssetFilename,
  buildBeadDebugLayerFilename,
  renderBeadDebugResult,
  resolveDebugExportBaseName
} from '../../beads'
import { BeadDebugPage } from '../BeadDebugPage'
import type { BeadDebugRenderResult, BeadTemplate } from '../../beads/types'
import type { RGBColor } from '../../types/grid'

vi.mock('../../beads', () => {
  const referenceColor = { r: 219, g: 57, b: 55, a: 255 }

  const templates: BeadTemplate[] = [
    {
      templateId: 'bean0_2',
      stateCode: 2,
      referenceColor,
      layers: [
        {
          id: 'base_2',
          assetPath: '/beads/bean0_2/base.png',
          kind: 'direct',
          baseColor: referenceColor
        },
        {
          id: 'outline_2',
          assetPath: '/beads/bean0_2/outline.png',
          kind: 'fixed',
          baseColor: { r: 100, g: 10, b: 10, a: 255 }
        }
      ]
    },
    {
      templateId: 'bean0_3',
      stateCode: 3,
      referenceColor,
      layers: [
        {
          id: 'base_3',
          assetPath: '/beads/bean0_3/base.png',
          kind: 'direct',
          baseColor: referenceColor
        }
      ]
    },
    {
      templateId: 'bean0_4',
      stateCode: 4,
      referenceColor,
      layers: [
        {
          id: 'base_4',
          assetPath: '/beads/bean0_4/base.png',
          kind: 'direct',
          baseColor: referenceColor
        }
      ]
    }
  ]

  return {
    beadTemplates: templates,
    buildBeadAssetFilename: vi.fn(
      (baseName: string, colorIndex: number, stateCode: 2 | 3 | 4) =>
        `${baseName}${colorIndex}_${stateCode}.png`
    ),
    buildBeadDebugLayerFilename: vi.fn(
      (
        baseName: string,
        colorIndex: number,
        stateCode: 2 | 3 | 4,
        layerId: string,
        variant: 'original' | 'tinted' | 'composite'
      ) => `${baseName}${colorIndex}_${stateCode}_${layerId}_${variant}.png`
    ),
    renderBeadDebugResult: vi.fn(),
    resolveDebugExportBaseName: vi.fn((manualBaseName: string, importedFilename: string) => {
      const manual = manualBaseName.trim()
      if (manual) {
        return manual
      }

      const stem = importedFilename.replace(/\.[^.]+$/, '').trim()
      return stem || 'debug'
    })
  }
})

const mockedRenderBeadDebugResult = vi.mocked(renderBeadDebugResult)
const mockedResolveDebugExportBaseName = vi.mocked(resolveDebugExportBaseName)
const mockedBuildBeadAssetFilename = vi.mocked(buildBeadAssetFilename)
const mockedBuildBeadDebugLayerFilename = vi.mocked(buildBeadDebugLayerFilename)

const importedColors: RGBColor[] = [
  { r: 40, g: 161, b: 115, a: 255 },
  { r: 240, g: 156, b: 104, a: 255 }
]

const setInputFiles = (input: HTMLInputElement, files: File[]) => {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files
  })
}

const createJsonFile = (name: string, contents: string): File => {
  const file = new File([contents], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: vi.fn(async () => contents)
  })
  return file
}

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

const flushEffects = async () => {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

const buildDebugResult = (
  template: BeadTemplate,
  targetColor: RGBColor,
  hiddenLayerIds: string[] = []
): BeadDebugRenderResult => ({
  templateId: template.templateId,
  stateCode: template.stateCode,
  targetColor,
  finalBlob: new Blob([`${template.templateId}:final`], { type: 'image/png' }),
  suspects: template.stateCode === 2
    ? [
        {
          layerId: 'outline_2',
          reason: 'fixed-hue-mismatch',
          message: 'Possible suspect layer.'
        }
      ]
    : [],
  layers: template.layers.map((layer, index) => ({
    layerId: layer.id,
    assetPath: layer.assetPath,
    kind: layer.kind,
    order: index,
    baseColor: 'baseColor' in layer ? layer.baseColor : undefined,
    opacity: layer.kind === 'fixed' ? layer.opacity : undefined,
    usesGrayscaleTint: layer.kind === 'tinted-grayscale',
    resolvedColor: targetColor,
    analysisColor: targetColor,
    visible: !hiddenLayerIds.includes(layer.id),
    originalBlob: new Blob([`${layer.id}:original`], { type: 'image/png' }),
    tintedBlob: new Blob([`${layer.id}:tinted`], { type: 'image/png' }),
    compositeBlob: new Blob([`${layer.id}:composite`], { type: 'image/png' })
  }))
})

describe('BeadDebugPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    mockedRenderBeadDebugResult.mockImplementation(async (template, targetColor, options = {}) =>
      buildDebugResult(template, targetColor, options.hiddenLayerIds ?? [])
    )
  })

  afterEach(() => {
    flushSync(() => {
      root.unmount()
    })
    container.remove()
    mockedRenderBeadDebugResult.mockReset()
    mockedResolveDebugExportBaseName.mockClear()
    mockedBuildBeadAssetFilename.mockClear()
    mockedBuildBeadDebugLayerFilename.mockClear()
    vi.restoreAllMocks()
  })

  it('renders three state previews for the default single-color mode', async () => {
    flushSync(() => {
      root.render(<BeadDebugPage />)
    })

    await flushEffects()

    expect(mockedRenderBeadDebugResult).toHaveBeenCalledTimes(beadTemplates.length)
    expect(container.querySelector('[data-testid="final-preview-2"]')?.textContent).toContain('bean0_2')
    expect(container.querySelector('[data-testid="final-preview-3"]')?.textContent).toContain('bean0_3')
    expect(container.querySelector('[data-testid="final-preview-4"]')?.textContent).toContain('bean0_4')
    expect(container.textContent).toContain('Possible suspect layer.')
  })

  it('re-renders after hiding a layer in the focused state', async () => {
    flushSync(() => {
      root.render(<BeadDebugPage />)
    })

    await flushEffects()

    const toggle = container.querySelector<HTMLInputElement>('input[data-layer-id="base_2"]')

    expect(toggle).not.toBeNull()

    flushSync(() => {
      toggle!.click()
    })

    await flushEffects()

    const bean0_2Calls = mockedRenderBeadDebugResult.mock.calls.filter(
      (call) => call[0].templateId === 'bean0_2'
    )
    const rerenderCall = bean0_2Calls.find(
      (call) => JSON.stringify(call[2]?.hiddenLayerIds ?? []) === JSON.stringify(['base_2'])
    )

    expect(bean0_2Calls).toHaveLength(2)
    expect(rerenderCall?.[0]).toMatchObject({ templateId: 'bean0_2' })
    expect(rerenderCall?.[2]).toEqual({ hiddenLayerIds: ['base_2'] })
  })

  it('imports json colors and re-renders for the selected imported index', async () => {
    flushSync(() => {
      root.render(<BeadDebugPage />)
    })

    await flushEffects()

    const input = container.querySelector<HTMLInputElement>('#beadDebugJsonInput')

    expect(input).not.toBeNull()

    const jsonFile = createJsonFile('flower_grid_colors.json', JSON.stringify({ colors: importedColors }))
    setInputFiles(input!, [jsonFile])

    flushSync(() => {
      input!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await flushEffects()

    const selector = container.querySelector<HTMLSelectElement>('#beadDebugColorSource')

    expect(selector).not.toBeNull()

    flushSync(() => {
      selector!.value = '1'
      selector!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await flushEffects()

    const rerenderCalls = mockedRenderBeadDebugResult.mock.calls.slice(-3)

    expect(rerenderCalls).toHaveLength(3)
    expect(rerenderCalls.map((call) => call[1])).toEqual([
      importedColors[1],
      importedColors[1],
      importedColors[1]
    ])
    expect(container.textContent).toContain('flower_grid_colors')
  })

  it('downloads one final png and one layer png with the expected filenames', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      flushSync(() => {
        root.render(<BeadDebugPage />)
      })

      await flushEffects()

      const input = container.querySelector<HTMLInputElement>('#beadDebugJsonInput')
      expect(input).not.toBeNull()

      const jsonFile = createJsonFile('flower.json', JSON.stringify({ colors: importedColors }))
      setInputFiles(input!, [jsonFile])

      flushSync(() => {
        input!.dispatchEvent(new Event('change', { bubbles: true }))
      })

      await flushEffects()

      const selector = container.querySelector<HTMLSelectElement>('#beadDebugColorSource')
      expect(selector).not.toBeNull()

      flushSync(() => {
        selector!.value = '1'
        selector!.dispatchEvent(new Event('change', { bubbles: true }))
      })

      await flushEffects()

      const finalDownloadButton = container.querySelector<HTMLButtonElement>(
        'button[data-testid="download-final-2"]'
      )
      const layerDownloadButton = container.querySelector<HTMLButtonElement>(
        'button[data-testid="download-layer-base_2-composite"]'
      )

      expect(finalDownloadButton).not.toBeNull()
      expect(layerDownloadButton).not.toBeNull()

      flushSync(() => {
        finalDownloadButton!.click()
      })
      flushSync(() => {
        layerDownloadButton!.click()
      })

      const downloads = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[download]'))
        .map((anchor) => anchor.download)

      expect(downloads).toContain('flower1_2.png')
      expect(downloads).toContain('flower1_2_base_2_composite.png')
      expect(mockedBuildBeadAssetFilename).toHaveBeenCalledWith('flower', 1, 2)
      expect(mockedBuildBeadDebugLayerFilename).toHaveBeenCalledWith(
        'flower',
        1,
        2,
        'base_2',
        'composite'
      )
      expect(click).toHaveBeenCalledTimes(2)
    } finally {
      click.mockRestore()
    }
  })

  it('disables downloads while a new render is in flight so stale blobs cannot use new filenames', async () => {
    const pendingRenders = new Map<string, ReturnType<typeof createDeferred<BeadDebugRenderResult>>>()

    mockedRenderBeadDebugResult.mockImplementation((template, targetColor, options = {}) => {
      const key = `${template.templateId}:${targetColor.r}:${(options.hiddenLayerIds ?? []).join(',')}`
      const deferred = createDeferred<BeadDebugRenderResult>()
      pendingRenders.set(key, deferred)
      return deferred.promise
    })

    flushSync(() => {
      root.render(<BeadDebugPage />)
    })

    beadTemplates.forEach((template) => {
      pendingRenders.get(`${template.templateId}:219:`)?.resolve(buildDebugResult(template, {
        r: 219,
        g: 57,
        b: 55,
        a: 255
      }))
    })

    await flushEffects()

    const finalDownloadButton = container.querySelector<HTMLButtonElement>(
      'button[data-testid="download-final-2"]'
    )
    const layerDownloadButton = container.querySelector<HTMLButtonElement>(
      'button[data-testid="download-layer-base_2-composite"]'
    )
    const input = container.querySelector<HTMLInputElement>('#beadDebugJsonInput')

    expect(finalDownloadButton?.disabled).toBe(false)
    expect(layerDownloadButton?.disabled).toBe(false)
    expect(input).not.toBeNull()

    const jsonFile = createJsonFile('flower_grid_colors.json', JSON.stringify({ colors: importedColors }))
    setInputFiles(input!, [jsonFile])

    flushSync(() => {
      input!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await flushEffects()

    const selector = container.querySelector<HTMLSelectElement>('#beadDebugColorSource')

    expect(selector).not.toBeNull()

    flushSync(() => {
      selector!.value = '1'
      selector!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const updatedFinalDownloadButton = container.querySelector<HTMLButtonElement>('button[data-testid="download-final-2"]')
    const updatedLayerDownloadButton = container.querySelector<HTMLButtonElement>('button[data-testid="download-layer-base_2-composite"]')

    expect(container.textContent).toContain('Filename: flower_grid_colors1_2.png')
    expect(updatedFinalDownloadButton?.disabled).toBe(true)
    expect(updatedLayerDownloadButton).toBeNull()
  })

  it('keeps the later json import when two imports resolve out of order', async () => {
    const firstImport = createDeferred<string>()
    const secondImport = createDeferred<string>()
    const slowFile = createJsonFile('slow_grid_colors.json', JSON.stringify({ colors: importedColors }))
    const fastFile = createJsonFile('fast_grid_colors.json', JSON.stringify({ colors: [importedColors[1]] }))
    const inputText = vi.fn()
      .mockReturnValueOnce(firstImport.promise)
      .mockReturnValueOnce(secondImport.promise)

    Object.defineProperty(slowFile, 'text', {
      configurable: true,
      value: inputText
    })
    Object.defineProperty(fastFile, 'text', {
      configurable: true,
      value: inputText
    })

    flushSync(() => {
      root.render(<BeadDebugPage />)
    })

    await flushEffects()

    const input = container.querySelector<HTMLInputElement>('#beadDebugJsonInput')
    expect(input).not.toBeNull()

    setInputFiles(input!, [slowFile])
    flushSync(() => {
      input!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    setInputFiles(input!, [fastFile])
    flushSync(() => {
      input!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    secondImport.resolve(JSON.stringify({ colors: [importedColors[1]] }))
    await flushEffects()

    firstImport.resolve(JSON.stringify({ colors: importedColors }))
    await flushEffects()

    const selector = container.querySelector<HTMLSelectElement>('#beadDebugColorSource')

    expect(container.textContent).toContain('Imported file: fast_grid_colors.json')
    expect(selector?.textContent).toContain('#f09c68')
    expect(selector?.textContent).not.toContain('#28a173')
  })

  it('clears stale focused results when the current cycle fails for that state', async () => {
    mockedRenderBeadDebugResult.mockImplementation(async (template, targetColor, options = {}) => {
      if (template.templateId === 'bean0_2' && targetColor.r === 240) {
        throw new Error('bean0_2 failed')
      }

      return buildDebugResult(template, targetColor, options.hiddenLayerIds ?? [])
    })

    flushSync(() => {
      root.render(<BeadDebugPage />)
    })

    await flushEffects()

    expect(container.querySelector('button[data-testid="download-final-2"]')?.hasAttribute('disabled')).toBe(false)
    expect(container.querySelector('[data-testid="layer-card-base_2"]')).not.toBeNull()

    const input = container.querySelector<HTMLInputElement>('#beadDebugJsonInput')
    expect(input).not.toBeNull()

    const jsonFile = createJsonFile('flower.json', JSON.stringify({ colors: importedColors }))
    setInputFiles(input!, [jsonFile])

    flushSync(() => {
      input!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await flushEffects()

    const selector = container.querySelector<HTMLSelectElement>('#beadDebugColorSource')
    expect(selector).not.toBeNull()

    flushSync(() => {
      selector!.value = '1'
      selector!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await flushEffects()

    expect(container.textContent).toContain('bean0_2 failed')
    expect(container.querySelector('button[data-testid="download-final-2"]')?.hasAttribute('disabled')).toBe(true)
    expect(container.querySelector('[data-testid="layer-card-base_2"]')).toBeNull()
    expect(container.querySelector('button[data-testid="download-layer-base_2-composite"]')).toBeNull()
  })

  it('ignores pending render completions after unmount', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pendingRenders = new Map<string, ReturnType<typeof createDeferred<BeadDebugRenderResult>>>()

    mockedRenderBeadDebugResult.mockImplementation((template, targetColor, options = {}) => {
      const key = `${template.templateId}:${targetColor.r}:${(options.hiddenLayerIds ?? []).join(',')}`
      const deferred = createDeferred<BeadDebugRenderResult>()
      pendingRenders.set(key, deferred)
      return deferred.promise
    })

    flushSync(() => {
      root.render(<BeadDebugPage />)
    })

    flushSync(() => {
      root.unmount()
    })

    await expect(async () => {
      beadTemplates.forEach((template) => {
        pendingRenders.get(`${template.templateId}:219:`)?.resolve(buildDebugResult(template, {
          r: 219,
          g: 57,
          b: 55,
          a: 255
        }))
      })

      await flushEffects()
    }).not.toThrow()

    expect(consoleError).not.toHaveBeenCalled()
  })
})
