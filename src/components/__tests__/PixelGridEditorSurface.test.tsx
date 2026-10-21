import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PixelGridEditorSurface,
  rgbToLab,
  type IndexedColor,
} from '../PixelGridEditorSurface'

const samplePalette: IndexedColor[] = [
  {
    id: 0,
    color: { r: 0, g: 0, b: 0, a: 255 },
    lab: [0, 0, 0],
  },
  {
    id: 1,
    color: { r: 255, g: 255, b: 255, a: 255 },
    lab: [100, 0, 0],
  },
]

const flushEffects = async () => {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

describe('PixelGridEditorSurface', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      lineWidth: 0,
      fillStyle: '',
      strokeStyle: '',
    } as unknown as CanvasRenderingContext2D))
  })

  afterEach(() => {
    flushSync(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('paints, erases, and updates the active index from the palette strip', () => {
    const onGridIndexMapChange = vi.fn()
    const onIndexedColorsChange = vi.fn()
    const onActiveIndexIdChange = vi.fn()
    const onGridEditToolChange = vi.fn()
    const onCurrentColorChange = vi.fn()
    const onRecentColorsChange = vi.fn()
    const onShowColorPaletteChange = vi.fn()
    const onPickingColorChange = vi.fn()

    const renderSurface = (gridEditTool: 'paint' | 'erase') => {
      flushSync(() => {
        root.render(
          <PixelGridEditorSurface
            gridIndexMap={[
              [0, 1],
              [1, 0],
            ]}
            indexedColors={samplePalette}
            activeIndexId={0}
            currentColor="#ffffff"
            recentColors={[]}
            showColorPalette={false}
            isPickingColor={false}
            gridEditTool={gridEditTool}
            gridSize={1}
            onGridIndexMapChange={onGridIndexMapChange}
            onIndexedColorsChange={onIndexedColorsChange}
            onActiveIndexIdChange={onActiveIndexIdChange}
            onCurrentColorChange={onCurrentColorChange}
            onRecentColorsChange={onRecentColorsChange}
            onShowColorPaletteChange={onShowColorPaletteChange}
            onPickingColorChange={onPickingColorChange}
            onGridEditToolChange={onGridEditToolChange}
          />,
        )
      })
    }

    renderSurface('paint')

    const canvas = container.querySelector<HTMLCanvasElement>('[data-testid="pixel-grid-canvas"]')
    expect(canvas).not.toBeNull()
    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 10,
        top: 20,
        width: 2,
        height: 2,
        right: 12,
        bottom: 22,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }),
    })

    flushSync(() => {
      canvas!.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 10.25,
        clientY: 20.25,
      }))
      canvas!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    expect(onGridIndexMapChange).toHaveBeenLastCalledWith([
      [1, 1],
      [1, 0],
    ])
    expect(onGridEditToolChange).not.toHaveBeenCalled()

    const eraserButton = container.querySelector<HTMLButtonElement>('[data-testid="pixel-eraser-tool"]')
    expect(eraserButton).not.toBeNull()
    flushSync(() => {
      eraserButton!.click()
    })
    expect(onGridEditToolChange).toHaveBeenCalledWith('erase')

    onGridIndexMapChange.mockClear()
    renderSurface('erase')

    flushSync(() => {
      canvas!.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 10.25,
        clientY: 20.25,
      }))
      canvas!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    expect(onGridIndexMapChange).toHaveBeenLastCalledWith([
      [-2, 1],
      [1, 0],
    ])

    const secondIndexButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button.index-item')).find(
      (button) => button.textContent?.includes('ID: 1'),
    )
    expect(secondIndexButton).toBeDefined()

    flushSync(() => {
      secondIndexButton!.click()
    })

    expect(onActiveIndexIdChange).toHaveBeenCalledWith(1)
  })

  it('shows a background color tool, uses indexed colors in its palette, and closes on outside clicks', () => {
    const onBackgroundColorChange = vi.fn()
    const onShowBackgroundColorPaletteChange = vi.fn()

    flushSync(() => {
      root.render(
        <PixelGridEditorSurface
          gridIndexMap={[
            [0, 1],
            [1, 0],
          ]}
          indexedColors={samplePalette}
          activeIndexId={null}
          currentColor="#000000"
          recentColors={['#123456']}
          showColorPalette={false}
          showBackgroundColorPalette
          backgroundColor="#ffffff"
          isPickingColor={false}
          gridEditTool="paint"
          gridSize={1}
          onGridIndexMapChange={vi.fn()}
          onIndexedColorsChange={vi.fn()}
          onActiveIndexIdChange={vi.fn()}
          onCurrentColorChange={vi.fn()}
          onRecentColorsChange={vi.fn()}
          onShowColorPaletteChange={vi.fn()}
          onShowBackgroundColorPaletteChange={onShowBackgroundColorPaletteChange}
          onBackgroundColorChange={onBackgroundColorChange}
          onPickingColorChange={vi.fn()}
          onGridEditToolChange={vi.fn()}
        />,
      )
    })

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.controls button'))
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      '🎨 调色板',
      '橡皮',
      '移动主体',
      '背景色',
      '调整尺寸',
    ])

    const backgroundButton = container.querySelector<HTMLButtonElement>('[data-testid="pixel-background-color-tool"]')
    expect(backgroundButton).not.toBeNull()
    expect(backgroundButton!.querySelector<HTMLElement>('.background-color-preview')?.style.backgroundColor).toBe('rgb(255, 255, 255)')

    const colorSections = Array.from(container.querySelectorAll<HTMLElement>('.color-section'))
    const indexColorSection = colorSections.find((section) => section.querySelector('h4')?.textContent === '索引色')
    expect(indexColorSection).toBeDefined()
    expect(Array.from(indexColorSection!.querySelectorAll<HTMLElement>('.color-item')).map((item) => item.title)).toEqual([
      '#000000',
      '#ffffff',
    ])

    const indexedWhite = Array.from(indexColorSection!.querySelectorAll<HTMLElement>('.color-item')).find(
      (item) => item.title === '#ffffff',
    )
    expect(indexedWhite).toBeDefined()

    flushSync(() => {
      indexedWhite!.click()
    })

    expect(onBackgroundColorChange).toHaveBeenCalledWith('#ffffff')

    flushSync(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(onShowBackgroundColorPaletteChange).toHaveBeenCalledWith(false)
  })

  it('only asks about merging when applying a picked duplicate color and keeps indexes separate when declined', () => {
    const onGridIndexMapChange = vi.fn()
    const onIndexedColorsChange = vi.fn()
    const onActiveIndexIdChange = vi.fn()
    const onGridEditToolChange = vi.fn()
    const onCurrentColorChange = vi.fn()
    const onRecentColorsChange = vi.fn()
    const onShowColorPaletteChange = vi.fn()
    const onPickingColorChange = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    const pickTarget = document.createElement('div')
    pickTarget.style.backgroundColor = 'rgb(255, 255, 255)'
    document.body.appendChild(pickTarget)
    Object.defineProperty(pickTarget, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 20,
        height: 20,
        right: 20,
        bottom: 20,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    const elementFromPoint = vi.fn(() => pickTarget)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    })

    flushSync(() => {
      root.render(
        <PixelGridEditorSurface
          gridIndexMap={[
            [0, 1],
            [1, 0],
          ]}
          indexedColors={samplePalette}
          activeIndexId={0}
          currentColor="#000000"
          recentColors={[]}
          showColorPalette={false}
          isPickingColor
          gridEditTool="paint"
          gridSize={1}
          onGridIndexMapChange={onGridIndexMapChange}
          onIndexedColorsChange={onIndexedColorsChange}
          onActiveIndexIdChange={onActiveIndexIdChange}
          onCurrentColorChange={onCurrentColorChange}
          onRecentColorsChange={onRecentColorsChange}
          onShowColorPaletteChange={onShowColorPaletteChange}
          onPickingColorChange={onPickingColorChange}
          onGridEditToolChange={onGridEditToolChange}
        />,
      )
    })

    flushSync(() => {
      document.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 4,
        clientY: 4,
      }))
    })

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onIndexedColorsChange).not.toHaveBeenCalled()
    expect(onGridIndexMapChange).not.toHaveBeenCalled()
    expect(onPickingColorChange).toHaveBeenCalledWith(false)

    const applyButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('应用颜色'),
    )
    expect(applyButton).toBeDefined()

    flushSync(() => {
      applyButton!.click()
    })

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(onGridIndexMapChange).not.toHaveBeenCalled()
    expect(onIndexedColorsChange).toHaveBeenLastCalledWith([
      {
        id: 0,
        color: { r: 255, g: 255, b: 255, a: 255 },
        lab: rgbToLab({ r: 255, g: 255, b: 255, a: 255 }),
      },
      samplePalette[1],
    ])

    pickTarget.remove()
  })

  it('moves the whole subject together with the move tool and fills vacated cells with the background', () => {
    const onGridIndexMapChange = vi.fn()
    const onGridEditToolChange = vi.fn()

    flushSync(() => {
      root.render(
        <PixelGridEditorSurface
          gridIndexMap={[
            [0, 0, 0],
            [0, 1, 0],
            [0, 0, 0],
          ]}
          indexedColors={samplePalette}
          activeIndexId={null}
          currentColor="#000000"
          recentColors={[]}
          showColorPalette={false}
          isPickingColor={false}
          gridEditTool="moveSubject"
          gridSize={1}
          backgroundIndex={0}
          onGridIndexMapChange={onGridIndexMapChange}
          onIndexedColorsChange={vi.fn()}
          onActiveIndexIdChange={vi.fn()}
          onCurrentColorChange={vi.fn()}
          onRecentColorsChange={vi.fn()}
          onShowColorPaletteChange={vi.fn()}
          onPickingColorChange={vi.fn()}
          onGridEditToolChange={onGridEditToolChange}
        />,
      )
    })

    const canvas = container.querySelector<HTMLCanvasElement>('[data-testid="pixel-grid-canvas"]')
    expect(canvas).not.toBeNull()
    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 3,
        height: 3,
        right: 3,
        bottom: 3,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    flushSync(() => {
      canvas!.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 0.25,
        clientY: 0.25,
      }))
      canvas!.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 1.25,
        clientY: 0.25,
      }))
      canvas!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    expect(onGridIndexMapChange).toHaveBeenLastCalledWith([
      [0, 0, 0],
      [0, 0, 1],
      [0, 0, 0],
    ])

    onGridIndexMapChange.mockClear()
    flushSync(() => {
      canvas!.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 0.25,
        clientY: 0.25,
      }))
      canvas!.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 2.25,
        clientY: 2.25,
      }))
      canvas!.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    })

    // 拖动中离开画布视为取消，不提交
    expect(onGridIndexMapChange).not.toHaveBeenCalled()

    const moveButton = container.querySelector<HTMLButtonElement>('[data-testid="pixel-move-subject-tool"]')
    expect(moveButton).not.toBeNull()
    expect(moveButton!.className).toContain('active')
  })

  it('resizes the canvas, filling grown cells with the background and cropping on shrink', async () => {
    const onGridIndexMapChange = vi.fn()

    flushSync(() => {
      root.render(
        <PixelGridEditorSurface
          gridIndexMap={[
            [0, 1],
            [1, 0],
          ]}
          indexedColors={samplePalette}
          activeIndexId={null}
          currentColor="#000000"
          recentColors={[]}
          showColorPalette={false}
          isPickingColor={false}
          gridEditTool="paint"
          gridSize={1}
          backgroundIndex={1}
          onGridIndexMapChange={onGridIndexMapChange}
          onIndexedColorsChange={vi.fn()}
          onActiveIndexIdChange={vi.fn()}
          onCurrentColorChange={vi.fn()}
          onRecentColorsChange={vi.fn()}
          onShowColorPaletteChange={vi.fn()}
          onPickingColorChange={vi.fn()}
          onGridEditToolChange={vi.fn()}
        />,
      )
    })
    await flushEffects()

    const widthInput = container.querySelector<HTMLInputElement>('[data-testid="canvas-width-input"]')
    const heightInput = container.querySelector<HTMLInputElement>('[data-testid="canvas-height-input"]')
    const applyButton = container.querySelector<HTMLButtonElement>('[data-testid="canvas-resize-apply"]')
    expect(widthInput).not.toBeNull()
    expect(heightInput).not.toBeNull()
    expect(applyButton).not.toBeNull()
    expect(widthInput!.value).toBe('2')
    expect(heightInput!.value).toBe('2')

    const widthSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    flushSync(() => {
      widthSetter?.call(widthInput!, '3')
      widthInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    flushSync(() => {
      applyButton!.click()
    })

    expect(onGridIndexMapChange).toHaveBeenLastCalledWith([
      [0, 1, 1],
      [1, 0, 1],
    ])

    onGridIndexMapChange.mockClear()
    const heightSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    flushSync(() => {
      widthSetter?.call(widthInput!, '1')
      widthInput!.dispatchEvent(new Event('input', { bubbles: true }))
      heightSetter?.call(heightInput!, '1')
      heightInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    flushSync(() => {
      applyButton!.click()
    })

    expect(onGridIndexMapChange).toHaveBeenLastCalledWith([
      [0],
    ])
  })
})
