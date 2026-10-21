import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PixelConfigItem } from '../../types/pixelConfig'
import { countPixelConfigBeads } from '../../utils/pixelConfigBeadCount'
import {
  deleteLevelDraft,
  getLevelWorkspaceSummary,
  readLevelDraft,
  readLevelWorkspacePixelConfig,
  readLevelWorkspaceThemeConfig,
  saveLevelWorkspacePixelConfig
} from '../../utils/levelWorkspaceClient'
import { PixelConfigPage } from '../PixelConfigPage'

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
  id: 1000,
  name: 'flower',
  gridWidthHeight: [1, 1],
  pixelWidthHeight: [1, 1],
  localPixelResource: ['caffee1'],
  pixelMatrix: [[0]],
  initPixel: [[0]],
  beadCount: countPixelConfigBeads([[0]])
}

const secondDraftPixelConfig: PixelConfigItem = {
  id: 1000,
  name: 'berry',
  gridWidthHeight: [1, 1],
  pixelWidthHeight: [1, 1],
  localPixelResource: ['berry0'],
  pixelMatrix: [[0]],
  initPixel: [[0]],
  beadCount: countPixelConfigBeads([[0]])
}

const workspaceSummary = {
  drafts: ['flower', 'berry'],
  pixelConfigCount: 1,
  mainLevelCount: 0,
  paths: {
    rootDir: 'data/level-workspace',
    draftsDir: 'data/level-workspace/drafts',
    configDir: 'data/level-workspace/config',
    thumbnailDir: 'resource/thumbnail',
    pixelConfigPath: 'data/level-workspace/config/pixelconfig.json',
    themeConfigPath: 'data/level-workspace/config/themeconfig.json'
  }
}

vi.mock('../../utils/levelWorkspaceClient', () => ({
  getLevelWorkspaceSummary: vi.fn(async () => workspaceSummary),
  readLevelWorkspacePixelConfig: vi.fn(async () => [existingPixelConfig]),
  readLevelWorkspaceThemeConfig: vi.fn(async () => [
    { theme: 'animal', themeName: '动物', sortOrder: 1 },
    { theme: 'food', themeName: '食物', sortOrder: 2 }
  ]),
  saveLevelWorkspacePixelConfig: vi.fn(async (items: PixelConfigItem[]) => ({
    ok: true,
    count: items.length
  })),
  readLevelDraft: vi.fn(async (name: string) => {
    if (name === 'berry') {
      return { name, pixelConfig: secondDraftPixelConfig }
    }
    return { name, pixelConfig: draftPixelConfig }
  }),
  deleteLevelDraft: vi.fn(async () => ({ ok: true }))
}))

vi.mock('../GridMatrixPreview', () => ({
  GridMatrixPreview: ({ title }: { title: string }) => (
    <div data-testid={`grid-matrix-preview-${title}`}>{title}</div>
  )
}))

const mockedGetLevelWorkspaceSummary = vi.mocked(getLevelWorkspaceSummary)
const mockedReadLevelWorkspacePixelConfig = vi.mocked(readLevelWorkspacePixelConfig)
const mockedReadLevelWorkspaceThemeConfig = vi.mocked(readLevelWorkspaceThemeConfig)
const mockedReadLevelDraft = vi.mocked(readLevelDraft)
const mockedSaveLevelWorkspacePixelConfig = vi.mocked(saveLevelWorkspacePixelConfig)
const mockedDeleteLevelDraft = vi.mocked(deleteLevelDraft)

const flushEffects = async () => {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

describe('PixelConfigPage internal workspace management', () => {
  let container: HTMLDivElement
  let root: Root
  let pixelConfigs: PixelConfigItem[]
  let loadedConfigName: string

  const renderPage = () => {
    flushSync(() => {
      root.render(
        <PixelConfigPage
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={(items) => {
            pixelConfigs = items
            renderPage()
          }}
          loadedConfigName={loadedConfigName}
          onLoadedConfigNameChange={(fileName) => {
            loadedConfigName = fileName
            renderPage()
          }}
        />
      )
    })
  }

  const findButtonByTestId = (testId: string): HTMLButtonElement => {
    const button = container.querySelector(`button[data-testid="${testId}"]`)
    expect(button).toBeDefined()
    return button as HTMLButtonElement
  }

  const findCheckbox = (name: string): HTMLInputElement => {
    const checkbox = container.querySelector(`input[data-testid="draft-checkbox-${name}"]`)
    expect(checkbox).toBeDefined()
    return checkbox as HTMLInputElement
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    pixelConfigs = []
    loadedConfigName = 'pixelconfig.json'
  })

  afterEach(() => {
    flushSync(() => {
      root.unmount()
    })
    container.remove()
    mockedGetLevelWorkspaceSummary.mockReset()
    mockedGetLevelWorkspaceSummary.mockResolvedValue(workspaceSummary)
    mockedReadLevelWorkspacePixelConfig.mockClear()
    mockedReadLevelWorkspaceThemeConfig.mockClear()
    mockedReadLevelDraft.mockReset()
    mockedReadLevelDraft.mockImplementation(async (name: string) => {
      if (name === 'berry') {
        return { name, pixelConfig: secondDraftPixelConfig }
      }
      return { name, pixelConfig: draftPixelConfig }
    })
    mockedSaveLevelWorkspacePixelConfig.mockClear()
    mockedDeleteLevelDraft.mockClear()
    vi.restoreAllMocks()
  })

  it('loads internal pixelconfig and lists internal drafts', async () => {
    renderPage()
    await flushEffects()

    expect(mockedGetLevelWorkspaceSummary).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('flower')
    expect(container.textContent).toContain('berry')

    flushSync(() => {
      findButtonByTestId('load-internal-pixelconfig').click()
    })
    await flushEffects()

    expect(mockedReadLevelWorkspacePixelConfig).toHaveBeenCalledOnce()
    expect(pixelConfigs).toEqual([existingPixelConfig])
    expect(container.textContent).toContain('existing')
  })

  it('opens the internal drafts picker at the default drafts path without importing immediately', async () => {
    pixelConfigs = [existingPixelConfig]
    renderPage()
    await flushEffects()

    flushSync(() => {
      findButtonByTestId('add-draft-to-pixelconfig').click()
    })
    await flushEffects()

    expect(container.querySelector('[data-testid="draft-picker-dialog"]')).not.toBeNull()
    expect(container.textContent).toContain('data/level-workspace/drafts')
    expect(mockedReadLevelDraft).not.toHaveBeenCalled()
    expect(mockedSaveLevelWorkspacePixelConfig).not.toHaveBeenCalled()
    expect(pixelConfigs).toEqual([existingPixelConfig])
  })

  it('imports multiple checked internal drafts and assigns safe ids', async () => {
    pixelConfigs = [existingPixelConfig]
    renderPage()
    await flushEffects()

    flushSync(() => {
      findButtonByTestId('add-draft-to-pixelconfig').click()
    })
    await flushEffects()

    flushSync(() => {
      findCheckbox('flower').click()
      findCheckbox('berry').click()
      findButtonByTestId('confirm-draft-import').click()
    })
    await flushEffects()

    expect(mockedReadLevelDraft).toHaveBeenCalledWith('flower')
    expect(mockedReadLevelDraft).toHaveBeenCalledWith('berry')
    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalledWith([
      existingPixelConfig,
      expect.objectContaining({
        id: 1001,
        name: 'flower',
        localPixelResource: ['caffee1']
      }),
      expect.objectContaining({
        id: 1002,
        name: 'berry',
        localPixelResource: ['berry0']
      })
    ])
    expect(pixelConfigs.map((item) => item.name)).toEqual(['existing', 'flower', 'berry'])
    expect(container.textContent).toContain('data/level-workspace/config/pixelconfig.json')
  })

  it('merges selected drafts with the latest internal pixelconfig file when page state is empty', async () => {
    pixelConfigs = []
    renderPage()
    await flushEffects()

    flushSync(() => {
      findButtonByTestId('add-draft-to-pixelconfig').click()
    })
    await flushEffects()

    flushSync(() => {
      findCheckbox('flower').click()
      findButtonByTestId('confirm-draft-import').click()
    })
    await flushEffects()

    expect(mockedReadLevelWorkspacePixelConfig).toHaveBeenCalledOnce()
    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalledWith([
      existingPixelConfig,
      expect.objectContaining({
        id: 1001,
        name: 'flower'
      })
    ])
    expect(pixelConfigs.map((item) => item.name)).toEqual(['existing', 'flower'])
  })

  it('warns and aborts when a selected internal draft has invalid format', async () => {
    mockedGetLevelWorkspaceSummary.mockResolvedValue({
      ...workspaceSummary,
      drafts: ['broken']
    })
    mockedReadLevelDraft.mockResolvedValueOnce({
      name: 'broken',
      pixelConfig: {
        name: ''
      } as PixelConfigItem
    })
    pixelConfigs = [existingPixelConfig]
    renderPage()
    await flushEffects()

    flushSync(() => {
      findButtonByTestId('add-draft-to-pixelconfig').click()
    })
    await flushEffects()

    flushSync(() => {
      findCheckbox('broken').click()
      findButtonByTestId('confirm-draft-import').click()
    })
    await flushEffects()

    expect(mockedSaveLevelWorkspacePixelConfig).not.toHaveBeenCalled()
    expect(pixelConfigs).toEqual([existingPixelConfig])
    expect(container.textContent).toContain('格式错误')
  })

  it('asks before replacing existing pixelconfig items from selected internal drafts', async () => {
    mockedGetLevelWorkspaceSummary.mockResolvedValue({
      ...workspaceSummary,
      drafts: ['existing']
    })
    mockedReadLevelDraft.mockResolvedValueOnce({
      name: 'existing',
      pixelConfig: {
        ...draftPixelConfig,
        name: 'existing'
      }
    })
    pixelConfigs = [existingPixelConfig]
    renderPage()
    await flushEffects()

    const confirmReplace = vi.spyOn(window, 'confirm').mockReturnValue(false)

    flushSync(() => {
      findButtonByTestId('add-draft-to-pixelconfig').click()
    })
    await flushEffects()

    flushSync(() => {
      findCheckbox('existing').click()
      findButtonByTestId('confirm-draft-import').click()
    })
    await flushEffects()

    expect(confirmReplace).toHaveBeenCalledWith(expect.stringContaining('existing'))
    expect(mockedSaveLevelWorkspacePixelConfig).not.toHaveBeenCalled()
    expect(pixelConfigs).toEqual([existingPixelConfig])
  })

  it('removes a pixelconfig item without deleting its draft', async () => {
    pixelConfigs = [
      existingPixelConfig,
      { ...draftPixelConfig, id: 1001 }
    ]
    renderPage()
    await flushEffects()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const deleteButtons = Array.from(container.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('删除')
    )

    flushSync(() => {
      deleteButtons[1]!.click()
    })
    await flushEffects()

    expect(mockedSaveLevelWorkspacePixelConfig).toHaveBeenCalledWith([existingPixelConfig])
    expect(mockedDeleteLevelDraft).not.toHaveBeenCalled()
    expect(pixelConfigs).toEqual([existingPixelConfig])
  })

  it('edits v0.5 metadata fields on a pixel config item', async () => {
    pixelConfigs = [existingPixelConfig]
    renderPage()
    await flushEffects()

    const changeSelect = (testId: string, value: string) => {
      const select = container.querySelector<HTMLSelectElement>(`select[data-testid="${testId}"]`)
      expect(select).toBeTruthy()
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
      valueSetter?.call(select, value)
      select!.dispatchEvent(new Event('change', { bubbles: true }))
    }

    const changeInput = (testId: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(`input[data-testid="${testId}"]`)
      expect(input).toBeTruthy()
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(input, value)
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    }

    flushSync(() => {
      changeSelect('pixel-theme-1000', 'animal')
      changeSelect('pixel-quality-1000', '5')
      changeSelect('pixel-image-type-1000', '2')
      changeInput('pixel-album-id-1000', 'album-001')
      changeSelect('pixel-difficulty-1000', '5')
    })
    await flushEffects()

    const difficultySelect = container.querySelector<HTMLSelectElement>('select[data-testid="pixel-difficulty-1000"]')
    expect(Array.from(difficultySelect!.options).map((option) => option.textContent)).toContain('5 大师')
    expect(pixelConfigs[0]).toMatchObject({
      theme: 'animal',
      quality: 5,
      imageType: 2,
      albumId: 'album-001',
      difficulty: 5
    })
  })

  it('displays bead count as a read-only pixel config field', async () => {
    pixelConfigs = [existingPixelConfig]
    renderPage()
    await flushEffects()

    const beadCountInput = container.querySelector<HTMLInputElement>('input[data-testid="pixel-bead-count-1000"]')

    expect(beadCountInput?.value).toBe('1')
    expect(beadCountInput?.disabled).toBe(true)
  })

  it('displays the used color count of pixelMatrix as a read-only pixel config field', async () => {
    pixelConfigs = [{
      ...existingPixelConfig,
      gridWidthHeight: [2, 2],
      pixelMatrix: [
        [0, 1],
        [1, -2]
      ]
    }]
    renderPage()
    await flushEffects()

    const colorCountInput = container.querySelector<HTMLInputElement>('input[data-testid="pixel-color-count-1000"]')

    expect(colorCountInput?.value).toBe('2')
    expect(colorCountInput?.disabled).toBe(true)
  })
})
