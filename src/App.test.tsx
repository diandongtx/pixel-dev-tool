import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./components/ImageProcessor', () => ({
  ImageProcessor: ({
    gridRefreshVersion,
    onAutoGridSizeDetected,
    onGridSizeSuggestionChange
  }: {
    gridRefreshVersion?: number
    onAutoGridSizeDetected?: (gridSize: number) => void
    onGridSizeSuggestionChange?: (suggestion: { cellSize: number, confidence: 'low' | 'medium' } | null) => void
  }) => (
    <div data-testid="image-processor" data-refresh-version={gridRefreshVersion ?? 0}>
      Image Processor
      <button type="button" onClick={() => onAutoGridSizeDetected?.(12)}>
        mock detect grid
      </button>
      <button type="button" onClick={() => onGridSizeSuggestionChange?.({ cellSize: 14, confidence: 'low' })}>
        mock suggest grid
      </button>
    </div>
  )
}))

vi.mock('./components/BeadLevelPage', () => ({
  BeadLevelPage: () => <div data-testid="bead-level-page">Bead Level</div>
}))

vi.mock('./components/PixelConfigPage', () => ({
  PixelConfigPage: () => <div data-testid="pixel-config-page">Pixel Config</div>
}))

vi.mock('./components/LevelConfigPage', () => ({
  LevelConfigPage: ({ pageTitle }: { pageTitle: string }) => <div>{pageTitle}</div>
}))

vi.mock('./components/BeadDebugPage', () => ({
  BeadDebugPage: () => (
    <section>
      <h2>Bead Debug Page</h2>
      <p>Inspect the three bead states.</p>
      <input id="beadDebugJsonInput" type="file" />
    </section>
  )
}))

vi.mock('./components/LevelProductionWorkbench', () => ({
  LevelProductionWorkbench: () => (
    <div data-testid="level-production-workbench">Level Production</div>
  )
}))

describe('App', () => {
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
  })

  it('switches to the bead debug tab and renders the debug page controls', () => {
    flushSync(() => {
      root.render(<App />)
    })

    const debugTab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('豆子调试')
    )

    expect(debugTab).not.toBeUndefined()

    flushSync(() => {
      debugTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Bead Debug Page')
    expect(container.textContent).toContain('Inspect the three bead states.')
    expect(container.querySelector('#beadDebugJsonInput')).not.toBeNull()
  })

  it('refreshes the pixel processor from the grid size and color tolerance controls', () => {
    flushSync(() => {
      root.render(<App />)
    })

    const processor = container.querySelector('[data-testid="image-processor"]')
    const refreshButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('更新网格和色差')
    )

    expect(processor?.getAttribute('data-refresh-version')).toBe('0')
    expect(refreshButton).not.toBeUndefined()

    flushSync(() => {
      refreshButton!.click()
    })

    expect(container.querySelector('[data-testid="image-processor"]')?.getAttribute('data-refresh-version')).toBe('1')
  })

  it('applies high-confidence detected pixel block sizes to the grid size control', () => {
    flushSync(() => {
      root.render(<App />)
    })

    const gridSizeInput = container.querySelector<HTMLInputElement>('#gridSize')
    const detectButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('mock detect grid')
    )

    expect(gridSizeInput?.value).toBe('10')
    expect(detectButton).not.toBeUndefined()

    flushSync(() => {
      detectButton!.click()
    })

    expect(container.querySelector<HTMLInputElement>('#gridSize')?.value).toBe('12')
  })

  it('shows low-confidence detected pixel block sizes as a suggestion without applying them', () => {
    flushSync(() => {
      root.render(<App />)
    })

    const suggestButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('mock suggest grid')
    )

    expect(container.querySelector<HTMLInputElement>('#gridSize')?.value).toBe('10')
    expect(suggestButton).not.toBeUndefined()

    flushSync(() => {
      suggestButton!.click()
    })

    expect(container.querySelector<HTMLInputElement>('#gridSize')?.value).toBe('10')
    expect(container.textContent).toContain('建议 Grid Size: 14px')
    expect(container.textContent).toContain('低置信度')
  })

  it('switches to the level production workbench tab', () => {
    flushSync(() => {
      root.render(<App />)
    })

    const tab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('关卡工作台')
    )

    expect(tab).not.toBeUndefined()

    flushSync(() => {
      tab!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="level-production-workbench"]')).not.toBeNull()
  })
})
