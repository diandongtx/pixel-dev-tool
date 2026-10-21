import { useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagedLevelConfigItem as LevelConfigItem } from '../../types/levelConfig'
import type { PixelConfigItem } from '../../types/pixelConfig'
import type { LevelWorkspaceThumbnailRecord } from '../../utils/levelWorkspaceClient'
import { countPixelConfigBeads } from '../../utils/pixelConfigBeadCount'
import * as pixelMatrixThumbnail from '../../utils/pixelMatrixThumbnail'

const assessLevelWithPixelConfig = vi.fn(() => ({
  valid: true,
  reason: null,
  estimatedSteps: 7,
  colorCount: 2,
  occupiedCellCount: 4,
  trayUsagePeak: 1,
  directPlacementStepCount: 6,
  trayTransferStepCount: 1,
  temporarySlotCount: 3,
  difficultyScore: 18,
  rawEstimate: {
    valid: true,
    reason: null,
    occupiedSlotCount: 4,
    fixedSlotCount: 0,
    misplacedSlotCount: 4,
    imageSpareSlotCount: 0,
    temporarySlotCount: 3,
    totalSpareSlotCount: 3,
    estimatedStepCount: 7,
    directPlacementStepCount: 6,
    trayTransferStepCount: 1,
    trayUsagePeak: 1,
    remainingMismatchCount: 0,
    ruleAssumptionVersion: 'test'
  }
}))

const suggestLevelConfigValues = vi.fn(() => ({
  difficulty: 1,
  storageInitialSlots: 12,
  initialTimeLimit: 150,
  adTimeIncrement: 120
}))

const readLevelWorkspaceLevelConfig = vi.fn()
const readLevelWorkspacePixelConfig = vi.fn()
const readLevelWorkspaceThumbnails = vi.fn<() => Promise<LevelWorkspaceThumbnailRecord[]>>(async () => [])
const generateMainLevelReview = vi.fn()
const saveLevelWorkspaceLevelConfig = vi.fn(async (_type: number, items: LevelConfigItem[]) => ({
  ok: true,
  count: items.length,
  type: _type
}))

const createCanvasContext = () => ({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  lineWidth: 0,
  fillStyle: '',
  strokeStyle: ''
})

vi.mock('../../utils/levelAssessment', () => ({
  assessLevelWithPixelConfig,
  suggestLevelConfigValues
}))

vi.mock('../../utils/levelWorkspaceClient', () => ({
  generateMainLevelReview,
  readLevelWorkspaceLevelConfig,
  readLevelWorkspacePixelConfig,
  readLevelWorkspaceThumbnails,
  saveLevelWorkspaceLevelConfig
}))

const { LevelConfigPage } = await import('../LevelConfigPage')

const LevelConfigPageHarness = ({
  initialPixelConfigs = []
}: {
  initialPixelConfigs?: PixelConfigItem[]
}) => {
  const [items, setItems] = useState<PixelConfigItem[]>(initialPixelConfigs)
  const [loadedName, setLoadedName] = useState('pixelconfig.json')

  return (
    <LevelConfigPage
      levelType={1}
      pageTitle="涓荤嚎鍏冲崱绠＄悊"
      pixelConfigs={items}
      onPixelConfigsChange={setItems}
      loadedPixelConfigName={loadedName}
      onLoadedPixelConfigNameChange={setLoadedName}
    />
  )
}

const pixelConfigs: PixelConfigItem[] = [
  {
    id: 1001,
    name: 'fox',
    gridWidthHeight: [2, 2],
    pixelWidthHeight: [2, 2],
    localPixelResource: [],
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
]

const levelConfig = [
  {
    id: 1,
    thumbnail: 'fox',
    type: 1,
    difficulty: 1,
    pixelImageId: 1001,
    widthHeight: [2, 2],
    storageMaxSlots: 3,
    storageCols: 12,
    storageInitialSlots: 12,
    adUnlockIncrement: 12,
    initialTimeLimit: 180,
    adTimeIncrement: 180,
    reviveCount: 5,
    propConfigs: []
  }
]

const createLevel = (id: number, pixelImageId = 1000 + id): LevelConfigItem => ({
  id,
  thumbnail: `image${pixelImageId}`,
  type: 1,
  difficulty: 1,
  pixelImageId,
  widthHeight: [2, 2],
  storageMaxSlots: 3,
  storageCols: 12,
  storageInitialSlots: 12,
  adUnlockIncrement: 12,
  initialTimeLimit: 180,
  adTimeIncrement: 180,
  reviveCount: 5,
  propConfigs: []
})

const findButton = (container: HTMLDivElement, label: string): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label)
  )
  expect(button).toBeDefined()
  return button as HTMLButtonElement
}

const findExactButton = (container: HTMLDivElement, label: string): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim() === label
  )
  expect(button).toBeDefined()
  return button as HTMLButtonElement
}

const changeInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const changeSelectValue = (select: HTMLSelectElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  valueSetter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

const changeTextareaValue = (textarea: HTMLTextAreaElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  valueSetter?.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

const waitForReact = async () => {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

describe('LevelConfigPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => (
      createCanvasContext() as unknown as CanvasRenderingContext2D
    ))
    vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => (
      `blob:${(file as File).name}`
    ))
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    assessLevelWithPixelConfig.mockClear()
    suggestLevelConfigValues.mockClear()
    readLevelWorkspaceLevelConfig.mockReset()
    readLevelWorkspacePixelConfig.mockReset()
    readLevelWorkspacePixelConfig.mockResolvedValue([])
    readLevelWorkspaceThumbnails.mockReset()
    readLevelWorkspaceThumbnails.mockResolvedValue([])
    generateMainLevelReview.mockReset()
    saveLevelWorkspaceLevelConfig.mockClear()
  })

  afterEach(() => {
    flushSync(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('keeps imported level rows lightweight until a row is opened', async () => {
    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="pixelconfig.json"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    const levelConfigInput = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[2]
    expect(levelConfigInput).toBeTruthy()

    const contents = JSON.stringify(levelConfig)
    const file = new File([contents], 'levelconfig_1.json', {
      type: 'application/json'
    })
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: vi.fn(async () => contents)
    })
    Object.defineProperty(levelConfigInput, 'files', {
      configurable: true,
      value: [file]
    })

    flushSync(() => {
      levelConfigInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await waitForReact()

    expect(assessLevelWithPixelConfig).not.toHaveBeenCalled()
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.querySelector('.pixel-config-preview-row')).toBeNull()
    expect(container.querySelector('.level-config-card-summary-thumbnail canvas')).not.toBeNull()

    const details = container.querySelector('details')
    expect(details).toBeTruthy()

    details!.open = true
    details!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    expect(assessLevelWithPixelConfig).not.toHaveBeenCalled()
    expect(container.textContent).toContain('步数: 暂不评估')
    expect(container.querySelector('textarea')).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()
  })

  it('shows the review button only for main levels and disables it before levels load', () => {
    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="内部 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    expect(findButton(container, '更新网页阅览').disabled).toBe(true)

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={2}
          pageTitle="每日挑战关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="内部 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    expect(container.textContent).not.toContain('更新网页阅览')
  })

  it('loads daily dates, saves date edits, and deletes without shifting later dates', async () => {
    const daily = { ...levelConfig[0], id: '2026-05-01', type: 1, highDifficulty: false, threeStarSeconds: 90, twoStarSeconds: 110 }
    const later = { ...daily, id: '2026-05-02' }
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([daily, later])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    flushSync(() => root.render(
      <LevelConfigPage levelType={2} pageTitle="每日挑战管理" pixelConfigs={pixelConfigs}
        onPixelConfigsChange={vi.fn()} loadedPixelConfigName="内部 pixelconfig" onLoadedPixelConfigNameChange={vi.fn()} />
    ))
    flushSync(() => findButton(container, '加载内部 dailylevelconfig').click())
    await waitForReact()
    expect(readLevelWorkspaceLevelConfig).toHaveBeenCalledWith(2)
    expect(container.textContent).toContain('已加载内部 dailylevelconfig.json，共 2 个关卡')
    expect(container.querySelectorAll('details')).toHaveLength(2)
    const details = container.querySelector('details')!
    details.open = true
    details.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()
    const dateInput = details.querySelector<HTMLInputElement>('input[type="date"]')!
    expect(dateInput.value).toBe(daily.id)

    flushSync(() => changeInputValue(dateInput, later.id))
    flushSync(() => findButton(container, '保存内部 dailylevelconfig').click())
    await waitForReact()
    expect(container.textContent).toContain('日期 2026-05-02 已有每日挑战')
    expect(saveLevelWorkspaceLevelConfig).not.toHaveBeenCalled()

    flushSync(() => changeInputValue(dateInput, '2026-04-30'))
    flushSync(() => findButton(container, '保存内部 dailylevelconfig').click())
    await waitForReact()
    expect(saveLevelWorkspaceLevelConfig).toHaveBeenLastCalledWith(2, [{ ...daily, id: '2026-04-30' }, later])

    const renamedDetails = container.querySelector('details')!
    renamedDetails.open = true
    renamedDetails.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()
    flushSync(() => findButton(container, '删除关卡').click())
    await waitForReact()
    expect(saveLevelWorkspaceLevelConfig).toHaveBeenLastCalledWith(2, [later])

    flushSync(() => findExactButton(container, '新增关卡').click())
    await waitForReact()
    flushSync(() => findButton(container, '保存内部 dailylevelconfig').click())
    await waitForReact()
    expect(saveLevelWorkspaceLevelConfig).toHaveBeenLastCalledWith(2, [later,
      expect.objectContaining({ id: '2026-05-03', type: 1, pixelImageId: 1001 })])
  })

  it('generates from current edits, disables while pending, and opens the preview synchronously', async () => {
    const originalPropConfigs = [{ id: 1, count: 2 }]
    readLevelWorkspacePixelConfig.mockResolvedValue(pixelConfigs)
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([{
      ...createLevel(3, 1001),
      propConfigs: originalPropConfigs
    }])
    const response = {
      ok: true as const,
      levelCount: 1,
      outputPath: 'output/main-level-review/index.html' as const,
      previewUrl: '/api/level-workspace/main-level-review-preview/index.html' as const,
      warnings: ['关卡 5：缺少 blue_2.png', '关卡 5：缺少 blue_3.png']
    }
    let finishGeneration: (() => void) | undefined
    const previewTab = { location: { replace: vi.fn() }, close: vi.fn() }
    const openPreview = vi.spyOn(window, 'open').mockReturnValue(previewTab as unknown as Window)
    generateMainLevelReview.mockImplementationOnce(async () => {
      expect(openPreview).toHaveBeenCalledWith('', '_blank')
      await new Promise<void>((resolve) => {
        finishGeneration = resolve
      })
      return response
    })

    flushSync(() => root.render(<LevelConfigPageHarness initialPixelConfigs={pixelConfigs} />))
    await waitForReact()
    flushSync(() => findButton(container, '加载内部 levelconfig').click())
    await waitForReact()

    const details = container.querySelector('details')!
    details.open = true
    details.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    const idLabel = Array.from(details.querySelectorAll('label')).find((label) =>
      label.textContent?.trim().startsWith('ID')
    )!
    const timeLabel = Array.from(details.querySelectorAll('label')).find((label) =>
      label.textContent?.includes('initialTimeLimit')
    )!
    const idInput = idLabel.querySelector<HTMLInputElement>('input')!
    const timeInput = timeLabel.querySelector<HTMLInputElement>('input')!
    const propConfigsTextarea = details.querySelector<HTMLTextAreaElement>('textarea')!

    flushSync(() => {
      changeInputValue(idInput, '5')
      changeInputValue(timeInput, '420')
      changeTextareaValue(propConfigsTextarea, '{ invalid draft')
    })
    await waitForReact()

    const levelReadCount = readLevelWorkspaceLevelConfig.mock.calls.length
    const pixelReadCount = readLevelWorkspacePixelConfig.mock.calls.length
    flushSync(() => findButton(container, '更新网页阅览').click())
    await waitForReact()

    expect(generateMainLevelReview).toHaveBeenCalledWith({
      levels: [expect.objectContaining({
        id: 5,
        initialTimeLimit: 420,
        propConfigs: originalPropConfigs
      })],
      pixelConfigs
    })
    expect(readLevelWorkspaceLevelConfig).toHaveBeenCalledTimes(levelReadCount)
    expect(readLevelWorkspacePixelConfig).toHaveBeenCalledTimes(pixelReadCount)
    expect(saveLevelWorkspaceLevelConfig).not.toHaveBeenCalled()
    expect(findButton(container, '正在生成网页').disabled).toBe(true)
    expect(previewTab.location.replace).not.toHaveBeenCalled()

    finishGeneration?.()
    await waitForReact()

    expect(previewTab.location.replace).toHaveBeenCalledWith(response.previewUrl)
    expect(container.textContent).toContain('output/main-level-review/index.html')
    expect(container.textContent).toContain('共 1 个关卡')
    expect(container.textContent).toContain('2 条资源提示')
    expect(findButton(container, '更新网页阅览').disabled).toBe(false)
  })

  it('closes the reserved preview tab and reports generation failures', async () => {
    readLevelWorkspacePixelConfig.mockResolvedValue(pixelConfigs)
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([createLevel(1, 1001)])
    const previewTab = { location: { replace: vi.fn() }, close: vi.fn() }
    const openPreview = vi.spyOn(window, 'open').mockReturnValue(previewTab as unknown as Window)
    generateMainLevelReview.mockImplementationOnce(() => {
      expect(openPreview).toHaveBeenCalledWith('', '_blank')
      return Promise.reject(new Error('resource copy failed'))
    })

    flushSync(() => root.render(<LevelConfigPageHarness initialPixelConfigs={pixelConfigs} />))
    await waitForReact()
    flushSync(() => findButton(container, '加载内部 levelconfig').click())
    await waitForReact()
    flushSync(() => findButton(container, '更新网页阅览').click())
    await waitForReact()

    expect(previewTab.close).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('生成网页阅览失败：resource copy failed')
    expect(findButton(container, '更新网页阅览').disabled).toBe(false)
  })

  it('rejects invalid pending level ids without generating a review', async () => {
    readLevelWorkspacePixelConfig.mockResolvedValue(pixelConfigs)
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([createLevel(1, 1001)])
    const previewTab = { location: { replace: vi.fn() }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(previewTab as unknown as Window)

    flushSync(() => root.render(<LevelConfigPageHarness initialPixelConfigs={pixelConfigs} />))
    await waitForReact()
    flushSync(() => findButton(container, '加载内部 levelconfig').click())
    await waitForReact()

    const details = container.querySelector('details')!
    details.open = true
    details.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()
    const idInput = details.querySelector<HTMLInputElement>('input[type="number"]')!
    flushSync(() => changeInputValue(idInput, '0'))
    await waitForReact()
    flushSync(() => findButton(container, '更新网页阅览').click())
    await waitForReact()

    expect(generateMainLevelReview).not.toHaveBeenCalled()
    expect(previewTab.close).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('关卡 1 的 ID 必须大于 0')
    expect(findButton(container, '更新网页阅览').disabled).toBe(false)
  })

  it('shows a small thumbnail on each main level list row', async () => {
    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="涓荤嚎鍏冲崱绠＄悊"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="pixelconfig.json"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]')
    const levelConfigInput = inputs[2]
    const thumbnailInput = inputs[3]
    const contents = JSON.stringify(levelConfig)
    const levelFile = new File([contents], 'levelconfig_1.json', {
      type: 'application/json'
    })
    Object.defineProperty(levelFile, 'text', {
      configurable: true,
      value: vi.fn(async () => contents)
    })
    Object.defineProperty(levelConfigInput, 'files', {
      configurable: true,
      value: [levelFile]
    })

    flushSync(() => {
      levelConfigInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await waitForReact()

    const thumbnailFile = new File(['png'], 'fox.png', { type: 'image/png' })
    Object.defineProperty(thumbnailInput, 'files', {
      configurable: true,
      value: [thumbnailFile]
    })

    flushSync(() => {
      thumbnailInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await waitForReact()

    const summaryThumbnail = container.querySelector<HTMLImageElement>('.level-config-card-summary-thumbnail img')
    expect(summaryThumbnail).not.toBeNull()
    expect(summaryThumbnail?.getAttribute('src')).toBe('blob:fox.png')
    expect(summaryThumbnail?.getAttribute('alt')).toContain('fox')
  })

  it('auto-loads thumbnails from the internal thumbnail directory', async () => {
    readLevelWorkspaceThumbnails.mockResolvedValueOnce([
      {
        name: 'fox',
        path: 'resource/thumbnail/fox.png',
        dataUrl: 'data:image/png;base64,fox'
      }
    ])

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="涓荤嚎鍏冲崱绠＄悊"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="pixelconfig.json"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    const levelConfigInput = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[2]
    const contents = JSON.stringify(levelConfig)
    const levelFile = new File([contents], 'levelconfig_1.json', {
      type: 'application/json'
    })
    Object.defineProperty(levelFile, 'text', {
      configurable: true,
      value: vi.fn(async () => contents)
    })
    Object.defineProperty(levelConfigInput, 'files', {
      configurable: true,
      value: [levelFile]
    })

    flushSync(() => {
      levelConfigInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await waitForReact()

    const summaryThumbnail = container.querySelector<HTMLImageElement>('.level-config-card-summary-thumbnail img')
    expect(readLevelWorkspaceThumbnails).toHaveBeenCalled()
    expect(summaryThumbnail).not.toBeNull()
    expect(summaryThumbnail?.getAttribute('src')).toBe('data:image/png;base64,fox')
  })

  it.each([true, false])('uses each linked pixel image when levels share a stale thumbnail (file available: %s)', async (hasThumbnail) => {
    const parrot: PixelConfigItem = {
      ...pixelConfigs[0],
      id: 1002,
      name: 'parrot',
      localPixelResource: ['FF0000', '00FF00'],
      pixelMatrix: [[0, -1, 1]]
    }
    readLevelWorkspacePixelConfig.mockResolvedValue([...pixelConfigs, parrot])
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([
      levelConfig[0],
      { ...levelConfig[0], id: 2, pixelImageId: parrot.id }
    ])
    readLevelWorkspaceThumbnails.mockResolvedValueOnce([
      { name: 'fox', path: 'resource/thumbnail/fox.png', dataUrl: 'data:image/png;base64,fox' },
      ...(hasThumbnail ? [{
        name: 'parrot', path: 'resource/thumbnail/parrot.png', dataUrl: 'data:image/png;base64,parrot'
      }] : [])
    ])
    const drawThumbnail = vi.spyOn(pixelMatrixThumbnail, 'drawPixelMatrixThumbnail')

    flushSync(() => root.render(<LevelConfigPageHarness />))
    await waitForReact()
    flushSync(() => findButton(container, '加载内部 levelconfig').click())
    await waitForReact()

    const thumbnails = container.querySelectorAll('.level-config-card-summary-thumbnail')
    expect(thumbnails[0].querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,fox')
    if (hasThumbnail) {
      expect(thumbnails[1].querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,parrot')
      expect(thumbnails[1].querySelector('img')?.alt).toBe('parrot 缩略图')
    } else {
      expect(thumbnails[1].querySelector('img')).toBeNull()
      const canvas = thumbnails[1].querySelector('canvas')
      expect(canvas?.getAttribute('aria-label')).toBe('parrot 缩略图')
      expect(drawThumbnail).toHaveBeenCalledWith(canvas, parrot.pixelMatrix, parrot.localPixelResource, 1)
      expect(canvas?.width).toBe(3)
      expect(canvas?.height).toBe(1)
    }

    const details = container.querySelectorAll('details')[1]
    details.open = true
    details.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()
    if (hasThumbnail) {
      expect(details.querySelector('.level-config-thumbnail-image')?.getAttribute('src')).toBe('data:image/png;base64,parrot')
    }
    const pixelSelect = Array.from(details.querySelectorAll('label'))
      .find((label) => label.textContent?.trim().startsWith('pixelImageId'))!
      .querySelector('select')!
    flushSync(() => changeSelectValue(pixelSelect, '1001'))
    await waitForReact()
    expect(thumbnails[1].querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,fox')
  })

  it('auto-loads internal pixelconfig so internal level rows are associated', async () => {
    readLevelWorkspacePixelConfig.mockResolvedValue(pixelConfigs)
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce(levelConfig)

    flushSync(() => {
      root.render(<LevelConfigPageHarness />)
    })
    await waitForReact()

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    expect(readLevelWorkspacePixelConfig).toHaveBeenCalled()
    expect(container.textContent).toContain('fox')
    expect(container.textContent).not.toContain('pixel 1001')

    const details = container.querySelector('details')
    expect(details).toBeTruthy()

    details!.open = true
    details!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    expect(assessLevelWithPixelConfig).not.toHaveBeenCalled()
    expect(container.textContent).toContain('步数: 暂不评估')
    expect(container.textContent).toContain('豆子数量：4')
  })

  it('loads internal levelconfig and saves an appended level', async () => {
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([createLevel(1, 1001)])

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="内部 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    expect(readLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1)

    flushSync(() => {
      findExactButton(container, '新增关卡').click()
    })
    await waitForReact()

    flushSync(() => {
      findButton(container, '保存内部 levelconfig').click()
    })
    await waitForReact()

    expect(saveLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1, [
      expect.objectContaining({ id: 1, pixelImageId: 1001 }),
      expect.objectContaining({ id: 2, pixelImageId: 1001 })
    ])
    expect(container.textContent).toContain('data/level-workspace/config/levelconfig.json')
  })

  it('uses five difficulty tiers and inherits master difficulty from the selected pixel', async () => {
    const masterPixelConfigs = [
      {
        ...pixelConfigs[0],
        difficulty: 5,
        theme: 'animal',
        quality: 4,
        imageType: 2,
        albumId: 'album-fox'
      }
    ]
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([])

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={masterPixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="内部 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    expect(container.textContent).toContain('主题：animal')
    expect(container.textContent).toContain('品质：4')
    expect(container.textContent).toContain('图片类型：2')
    expect(container.textContent).toContain('专辑：album-fox')
    expect(container.textContent).toContain('难度：5 大师')

    flushSync(() => {
      findExactButton(container, '新增关卡').click()
    })
    await waitForReact()

    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    details!.open = true
    details!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    const difficultySelect = details!.querySelector<HTMLSelectElement>('select[data-testid="level-difficulty"]')
    expect(difficultySelect).not.toBeNull()
    expect(difficultySelect!.value).toBe('5')
    expect(Array.from(difficultySelect!.options).map((option) => option.textContent)).toContain('5 大师')
    expect(details!.textContent).toContain('图片元信息')
    expect(details!.textContent).toContain('主题：animal')
    expect(details!.textContent).toContain('品质：4')
    expect(details!.textContent).toContain('图片类型：2')
    expect(details!.textContent).toContain('专辑：album-fox')

    flushSync(() => {
      changeSelectValue(difficultySelect!, '4')
      findButton(container, '保存内部 levelconfig').click()
    })
    await waitForReact()

    expect(saveLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1, [
      expect.objectContaining({ id: 1, pixelImageId: 1001, difficulty: 4 })
    ])
    const savedCalls = saveLevelWorkspaceLevelConfig.mock.calls
    const savedLevel = savedCalls[savedCalls.length - 1]?.[1][0]
    expect(savedLevel).not.toHaveProperty('theme')
    expect(savedLevel).not.toHaveProperty('quality')
    expect(savedLevel).not.toHaveProperty('imageType')
    expect(savedLevel).not.toHaveProperty('albumId')
  })

  it('deletes a level and shifts later ids before saving internally', async () => {
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([
      createLevel(1, 1001),
      createLevel(2, 1002),
      createLevel(3, 1003)
    ])
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="内部 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    const details = container.querySelectorAll('details')
    details[1]!.open = true
    details[1]!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    const deleteButtons = Array.from(container.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('删除关卡')
    )
    flushSync(() => {
      deleteButtons[0]!.click()
    })
    await waitForReact()

    flushSync(() => {
      findButton(container, '保存内部 levelconfig').click()
    })
    await waitForReact()

    expect(saveLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1, [
      expect.objectContaining({ id: 1, pixelImageId: 1001 }),
      expect.objectContaining({ id: 2, pixelImageId: 1003 })
    ])
  })

  it('persists a deleted internal level immediately', async () => {
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([
      createLevel(1, 1001),
      createLevel(2, 1002),
      createLevel(3, 1003)
    ])
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="鍐呴儴 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    const details = container.querySelectorAll('details')
    details[1]!.open = true
    details[1]!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    const deleteButtons = Array.from(container.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('删除关卡')
    )
    flushSync(() => {
      deleteButtons[0]!.click()
    })
    await waitForReact()

    expect(saveLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1, [
      expect.objectContaining({ id: 1, pixelImageId: 1001 }),
      expect.objectContaining({ id: 2, pixelImageId: 1003 })
    ])
  })

  it('saves edits from an opened level row to internal levelconfig', async () => {
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([createLevel(1, 1001)])

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="涓荤嚎鍏冲崱绠＄悊"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="鍐呴儴 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    const details = container.querySelectorAll('details')
    details[0]!.open = true
    details[0]!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    const numericInputs = details[0]!.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const initialTimeLimitInput = numericInputs[8]
    expect(initialTimeLimitInput).not.toBeUndefined()

    flushSync(() => {
      changeInputValue(initialTimeLimitInput!, '240')
    })
    await waitForReact()

    const saveLevelButton = details[0]!.querySelector<HTMLButtonElement>('[data-level-save-button="true"]')
    expect(saveLevelButton).not.toBeNull()

    flushSync(() => {
      saveLevelButton!.click()
    })
    await waitForReact()

    expect(saveLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1, [
      expect.objectContaining({ id: 1, pixelImageId: 1001, initialTimeLimit: 240 })
    ])
  })

  it('keeps propConfigs drafts while other level fields are edited', async () => {
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([
      {
        ...createLevel(1, 1001),
        propConfigs: [{ id: 1, count: 2 }]
      }
    ])

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="内部 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    details!.open = true
    details!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    const textarea = details!.querySelector<HTMLTextAreaElement>('textarea')
    expect(textarea).not.toBeNull()

    const draft = '[{"id":2,"count":5}]'
    flushSync(() => {
      changeTextareaValue(textarea!, draft)
    })
    await waitForReact()

    const numericInputs = details!.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const difficultyInput = numericInputs[2]
    expect(difficultyInput).not.toBeUndefined()

    flushSync(() => {
      changeInputValue(difficultyInput!, '2')
    })
    await waitForReact()

    expect(textarea!.value).toBe(draft)
  })

  it('does not reassess an opened level when unrelated fields change', async () => {
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([createLevel(1, 1001)])

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="内部 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    details!.open = true
    details!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    expect(assessLevelWithPixelConfig).not.toHaveBeenCalled()

    const numericInputs = details!.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const difficultyInput = numericInputs[2]
    expect(difficultyInput).not.toBeUndefined()

    flushSync(() => {
      changeInputValue(difficultyInput!, '2')
    })
    await waitForReact()

    expect(assessLevelWithPixelConfig).not.toHaveBeenCalled()
  })

  it('does not resolve level id conflicts while the id field is still being typed', async () => {
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([
      createLevel(1, 1001),
      createLevel(2, 1002),
      createLevel(3, 1003)
    ])
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="涓荤嚎鍏冲崱绠＄悊"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="鍐呴儴 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    const details = container.querySelectorAll('details')
    details[2]!.open = true
    details[2]!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    const idInput = details[2]!.querySelector<HTMLInputElement>('input[type="number"]')
    expect(idInput).not.toBeNull()

    flushSync(() => {
      changeInputValue(idInput!, '1')
    })
    await waitForReact()

    expect(window.confirm).not.toHaveBeenCalled()
    expect(saveLevelWorkspaceLevelConfig).not.toHaveBeenCalled()
  })

  it('swaps level ids when an id conflict is confirmed', async () => {
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([
      createLevel(1, 1001),
      createLevel(2, 1002),
      createLevel(3, 1003)
    ])
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="内部 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    const details = container.querySelectorAll('details')
    details[2]!.open = true
    details[2]!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    const idInput = details[2]!.querySelector<HTMLInputElement>('input[type="number"]')
    expect(idInput).not.toBeNull()

    flushSync(() => {
      changeInputValue(idInput!, '1')
      findButton(container, '保存内部 levelconfig').click()
    })
    await waitForReact()

    expect(saveLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1, [
      expect.objectContaining({ id: 1, pixelImageId: 1003 }),
      expect.objectContaining({ id: 2, pixelImageId: 1002 }),
      expect.objectContaining({ id: 3, pixelImageId: 1001 })
    ])
  })

  it('inserts level ids when an id conflict is cancelled', async () => {
    readLevelWorkspaceLevelConfig.mockResolvedValueOnce([
      createLevel(1, 1001),
      createLevel(2, 1002),
      createLevel(3, 1003)
    ])
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    flushSync(() => {
      root.render(
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={vi.fn()}
          loadedPixelConfigName="内部 pixelconfig"
          onLoadedPixelConfigNameChange={vi.fn()}
        />
      )
    })

    flushSync(() => {
      findButton(container, '加载内部 levelconfig').click()
    })
    await waitForReact()

    const details = container.querySelectorAll('details')
    details[2]!.open = true
    details[2]!.dispatchEvent(new Event('toggle', { bubbles: true }))
    await waitForReact()

    const idInput = details[2]!.querySelector<HTMLInputElement>('input[type="number"]')
    expect(idInput).not.toBeNull()

    flushSync(() => {
      changeInputValue(idInput!, '1')
      findButton(container, '保存内部 levelconfig').click()
    })
    await waitForReact()

    expect(saveLevelWorkspaceLevelConfig).toHaveBeenCalledWith(1, [
      expect.objectContaining({ id: 1, pixelImageId: 1003 }),
      expect.objectContaining({ id: 2, pixelImageId: 1001 }),
      expect.objectContaining({ id: 3, pixelImageId: 1002 })
    ])
  })
})
