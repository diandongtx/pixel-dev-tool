import { describe, expect, it, vi } from 'vitest'
import type { RGBColor } from '../../types/grid'
import { mapDirectLayerColor, tintGrayPixel } from '../color'
import { renderBeadBlob, renderBeadDebugResult } from '../render'
import { beadTemplates } from '../templates'
import type { BeadTemplate } from '../types'

type MockImage = HTMLImageElement & {
  id: string
  pixels: Uint8ClampedArray
}

type MockContext = {
  clearRect: ReturnType<typeof vi.fn>
  drawImage: ReturnType<typeof vi.fn>
  getImageData: ReturnType<typeof vi.fn>
  putImageData: ReturnType<typeof vi.fn>
  lastImageData?: Uint8ClampedArray
}

type MockCanvas = {
  label: string
  width: number
  height: number
  pixels: Uint8ClampedArray
  context: MockContext
  getContext: ReturnType<typeof vi.fn>
  toBlob: ReturnType<typeof vi.fn>
}

const targetColor: RGBColor = { r: 40, g: 161, b: 115, a: 255 }

const clonePixels = (pixels: Uint8ClampedArray): Uint8ClampedArray => new Uint8ClampedArray(pixels)

const toRgba = (color: RGBColor): number[] => [color.r, color.g, color.b, color.a]

const readBlobLabel = async (blob: Blob): Promise<string> =>
  await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })

const blendPixelOver = (destination: number[], source: number[]): number[] => {
  const sourceAlpha = (source[3] ?? 0) / 255
  const destinationAlpha = (destination[3] ?? 0) / 255
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha)

  if (outputAlpha === 0) {
    return [0, 0, 0, 0]
  }

  return [0, 1, 2, 3].map((channel) => {
    if (channel === 3) {
      return Math.round(outputAlpha * 255)
    }

    const sourceChannel = source[channel] ?? 0
    const destinationChannel = destination[channel] ?? 0

    return Math.round(
      ((sourceChannel * sourceAlpha) +
        (destinationChannel * destinationAlpha * (1 - sourceAlpha))) /
        outputAlpha
    )
  })
}

const compositePixels = (
  destination: Uint8ClampedArray,
  source: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray => {
  const output = clonePixels(destination)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const blended = blendPixelOver(
        Array.from(output.slice(offset, offset + 4)),
        Array.from(source.slice(offset, offset + 4))
      )

      output.set(blended, offset)
    }
  }

  return output
}

const expectDefined = <T>(value: T | undefined, message: string): T => {
  expect(value, message).toBeDefined()
  return value as T
}

const expectCanvasByPixels = (
  canvases: MockCanvas[],
  pixels: number[],
  message: string
): MockCanvas =>
  expectDefined(
    canvases.find((canvas) => Array.from(canvas.pixels).join(',') === pixels.join(',')),
    message
  )

const getCanvasLabelsByPixels = (canvases: MockCanvas[], pixels: number[]): string[] =>
  canvases
    .filter((canvas) => Array.from(canvas.pixels).join(',') === pixels.join(','))
    .map((canvas) => canvas.label)

const getTemplate = (index: number): BeadTemplate =>
  expectDefined(beadTemplates[index], `expected bead template at index ${index}`)

const expectDirectLayer = (
  layer: BeadTemplate['layers'][number] | undefined,
  message: string
): Extract<BeadTemplate['layers'][number], { kind: 'direct' }> => {
  const definedLayer = expectDefined(layer, message)
  expect(definedLayer.kind).toBe('direct')
  if (definedLayer.kind !== 'direct') {
    throw new Error(message)
  }

  return definedLayer
}

const createMockImage = (
  id: string,
  pixels: number[],
  width = 1,
  height = 1
): MockImage =>
  ({
    id,
    width,
    height,
    pixels: new Uint8ClampedArray(pixels)
  }) as MockImage

const createCanvasFactory = (options?: { failContextAt?: number; finalBlob?: Blob | null }) => {
  const canvases: MockCanvas[] = []

  const createCanvas = (): HTMLCanvasElement => {
    const index = canvases.length
    let pixels = new Uint8ClampedArray()

    const canvas = {
      label: index === 0 ? 'final' : `buffer-${index}`,
      width: 0,
      height: 0,
      pixels,
      context: undefined as unknown as MockContext
    } as MockCanvas

    const context: MockContext = {
      clearRect: vi.fn(() => {
        pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4)
        canvas.pixels = clonePixels(pixels)
      }),
      drawImage: vi.fn((source: { pixels?: Uint8ClampedArray }) => {
        const sourcePixels = source.pixels ?? new Uint8ClampedArray(canvas.width * canvas.height * 4)
        pixels = compositePixels(
          pixels.length === sourcePixels.length
            ? pixels
            : new Uint8ClampedArray(sourcePixels.length),
          sourcePixels,
          canvas.width,
          canvas.height
        )
        canvas.pixels = clonePixels(pixels)
      }),
      getImageData: vi.fn(() => ({
        data: clonePixels(pixels),
        width: canvas.width,
        height: canvas.height
      })),
      putImageData: vi.fn((imageData: { data: Uint8ClampedArray }) => {
        pixels = clonePixels(imageData.data)
        canvas.pixels = clonePixels(pixels)
        context.lastImageData = clonePixels(imageData.data)
      })
    }

    canvas.context = context
    canvas.getContext = vi.fn((kind: string) =>
      kind === '2d' && index !== options?.failContextAt ? context : null
    )
    canvas.toBlob = vi.fn((callback: BlobCallback) => {
      if (index === 0 && options && 'finalBlob' in options) {
        callback(options.finalBlob ?? null)
        return
      }

      callback(new Blob([canvas.label], { type: 'image/png' }))
    })

    canvases.push(canvas)
    return canvas as unknown as HTMLCanvasElement
  }

  return { canvases, createCanvas }
}

describe('renderBeadBlob', () => {
  it('renders layers in order, recolors each path, and composites the final canvas output', async () => {
    const referenceTemplate = getTemplate(0)
    const template: BeadTemplate = {
      templateId: 'test-composite',
      stateCode: 2,
      referenceColor: referenceTemplate.referenceColor,
      layers: [
        {
          id: 'base',
          assetPath: '/test/direct.png',
          kind: 'direct',
          baseColor: { r: 171, g: 31, b: 30, a: 255 }
        },
        {
          id: 'shine',
          assetPath: '/test/fixed.png',
          kind: 'fixed',
          baseColor: { r: 255, g: 255, b: 255, a: 255 },
          opacity: 0.5
        },
        {
          id: 'shadow',
          assetPath: '/test/tinted.png',
          kind: 'tinted-grayscale'
        }
      ]
    }
    const directImage = createMockImage('base', [1, 2, 3, 255])
    const fixedImage = createMockImage('shine', [12, 24, 36, 128])
    const tintedImage = createMockImage('shadow', [128, 128, 128, 128])
    const imagesByPath: Record<string, MockImage> = {
      '/test/direct.png': directImage,
      '/test/fixed.png': fixedImage,
      '/test/tinted.png': tintedImage
    }
    const loadImage = vi.fn(async (assetPath: string) => imagesByPath[assetPath])
    const { canvases, createCanvas } = createCanvasFactory()

    const blob = await renderBeadBlob(template, targetColor, {
      loadImage,
      createCanvas
    })

    const finalCanvas = expectDefined(canvases[0], 'expected final canvas')
    const directCanvas = expectDefined(canvases[1], 'expected direct layer canvas')
    const fixedCanvas = expectDefined(canvases[2], 'expected fixed layer canvas')
    const tintedCanvas = expectDefined(canvases[3], 'expected tinted layer canvas')
    const directLayer = expectDirectLayer(template.layers[0], 'expected direct layer')
    const directOutput = toRgba(
      mapDirectLayerColor(template.referenceColor, directLayer.baseColor, targetColor)
    )
    const fixedOutput = [255, 255, 255, 64]
    const tintedOutput = toRgba(tintGrayPixel({ gray: 128, alpha: 128 }, targetColor))
    const expectedFinalPixels = blendPixelOver(
      blendPixelOver(directOutput, fixedOutput),
      tintedOutput
    )

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(loadImage.mock.calls.map(([assetPath]) => assetPath)).toEqual(
      template.layers.map((layer) => layer.assetPath)
    )
    expect(finalCanvas.width).toBe(1)
    expect(finalCanvas.height).toBe(1)
    expect(finalCanvas.context.clearRect).toHaveBeenCalledWith(0, 0, 1, 1)
    expect(finalCanvas.context.drawImage.mock.calls.map(([source]) => source.label)).toEqual([
      'buffer-1',
      'buffer-2',
      'buffer-3'
    ])

    expect(Array.from(directCanvas.context.lastImageData ?? [])).toEqual(directOutput)
    expect(Array.from(fixedCanvas.context.lastImageData ?? [])).toEqual(fixedOutput)
    expect(Array.from(tintedCanvas.context.lastImageData ?? [])).toEqual(tintedOutput)
    expect(Array.from(finalCanvas.pixels)).toEqual(expectedFinalPixels)
    expect(Array.from(finalCanvas.pixels)).not.toEqual(directOutput)
    expect(Array.from(finalCanvas.pixels)).not.toEqual(tintedOutput)
  })

  it('throws when a template has no layers', async () => {
    const template: BeadTemplate = {
      ...getTemplate(0),
      templateId: 'empty-template',
      layers: []
    }

    await expect(
      renderBeadBlob(template, targetColor, {
        loadImage: vi.fn(),
        createCanvas: vi.fn()
      })
    ).rejects.toThrow('Template empty-template has no layers')
  })

  it('throws when layer dimensions do not match', async () => {
    const template = getTemplate(0)
    const { createCanvas } = createCanvasFactory()

    await expect(
      renderBeadBlob(template, targetColor, {
        loadImage: vi
          .fn()
          .mockResolvedValueOnce(createMockImage('top_gray', [0, 0, 0, 255], 2, 2))
          .mockResolvedValueOnce(createMockImage('mid', [0, 0, 0, 255], 1, 2))
          .mockResolvedValueOnce(createMockImage('base', [0, 0, 0, 255], 2, 2)),
        createCanvas
      })
    ).rejects.toThrow('Layer size mismatch in template bean0_2')
  })

  it('throws when a 2D context is unavailable', async () => {
    const template = getTemplate(0)
    const { createCanvas } = createCanvasFactory({ failContextAt: 1 })

    await expect(
      renderBeadBlob(template, targetColor, {
        loadImage: vi
          .fn()
          .mockResolvedValue(createMockImage('layer', [0, 0, 0, 255])),
        createCanvas
      })
    ).rejects.toThrow('Canvas 2D context unavailable for bean0_2/base')
  })

  it('rejects clearly when the final canvas cannot export a blob', async () => {
    const template = getTemplate(0)
    const { createCanvas } = createCanvasFactory({ finalBlob: null })

    await expect(
      renderBeadBlob(template, targetColor, {
        loadImage: vi
          .fn()
          .mockResolvedValue(createMockImage('layer', [0, 0, 0, 255])),
        createCanvas
      })
    ).rejects.toThrow('Failed to export PNG blob for template bean0_2')
  })
})

describe('renderBeadDebugResult', () => {
  it('uses the bean0_4 side-color mapping for all direct layers, including the border', async () => {
    const template = getTemplate(2)
    const orangeSideColor: RGBColor = { r: 252, g: 140, b: 15, a: 255 }
    const loadImage = vi
      .fn()
      .mockResolvedValue(createMockImage('layer', [0, 0, 0, 255]))
    const { createCanvas } = createCanvasFactory()

    const result = await renderBeadDebugResult(template, orangeSideColor, undefined, {
      loadImage,
      createCanvas
    })

    expect(result.layers.map((layer) => [layer.layerId, layer.resolvedColor])).toEqual([
      ['base-1', { r: 213, g: 89, b: 7, a: 255 }],
      ['mid-down', { r: 229, g: 106, b: 0, a: 255 }],
      ['mid-left', { r: 252, g: 140, b: 15, a: 255 }],
      ['mid-right', { r: 252, g: 140, b: 15, a: 255 }],
      ['mid-up', { r: 249, g: 176, b: 62, a: 255 }],
      ['top-frame', { r: 147, g: 49, b: 22, a: 255 }]
    ])
  })

  it('flags dark grayscale output from the actual tinted layer pixels', async () => {
    const referenceTemplate = getTemplate(0)
    const template: BeadTemplate = {
      templateId: 'debug-dark-grayscale',
      stateCode: 2,
      referenceColor: referenceTemplate.referenceColor,
      layers: [
        {
          id: 'shadow',
          assetPath: '/test/shadow.png',
          kind: 'tinted-grayscale'
        }
      ]
    }
    const shadowImage = createMockImage('shadow', [16, 16, 16, 255])
    const loadImage = vi.fn(async () => shadowImage)
    const { canvases, createCanvas } = createCanvasFactory()

    const result = await renderBeadDebugResult(template, targetColor, undefined, {
      loadImage,
      createCanvas
    })

    expect(result.suspects).toEqual([
      {
        layerId: 'shadow',
        reason: 'dark-grayscale',
        message: expect.any(String)
      }
    ])

    const tintedCanvas = expectCanvasByPixels(
      canvases,
      toRgba(tintGrayPixel({ gray: 16, alpha: 255 }, targetColor)),
      'expected dark grayscale tinted canvas'
    )
    expect(getCanvasLabelsByPixels(canvases, Array.from(tintedCanvas.pixels))).toContain(
      await readBlobLabel(result.layers[0]!.tintedBlob)
    )
  })

  it('returns final and ordered layer debug blobs while preserving the production composite', async () => {
    const referenceTemplate = getTemplate(0)
    const template: BeadTemplate = {
      templateId: 'debug-composite',
      stateCode: 3,
      referenceColor: referenceTemplate.referenceColor,
      layers: [
        {
          id: 'base',
          assetPath: '/test/direct.png',
          kind: 'direct',
          baseColor: { r: 171, g: 31, b: 30, a: 255 }
        },
        {
          id: 'shine',
          assetPath: '/test/fixed.png',
          kind: 'fixed',
          baseColor: { r: 255, g: 255, b: 255, a: 255 },
          opacity: 0.5
        },
        {
          id: 'shadow',
          assetPath: '/test/tinted.png',
          kind: 'tinted-grayscale'
        }
      ]
    }
    const directImage = createMockImage('base', [1, 2, 3, 255])
    const fixedImage = createMockImage('shine', [12, 24, 36, 128])
    const tintedImage = createMockImage('shadow', [128, 128, 128, 128])
    const imagesByPath: Record<string, MockImage> = {
      '/test/direct.png': directImage,
      '/test/fixed.png': fixedImage,
      '/test/tinted.png': tintedImage
    }
    const loadImage = vi.fn(async (assetPath: string) => imagesByPath[assetPath])
    const { canvases, createCanvas } = createCanvasFactory()

    const result = await renderBeadDebugResult(template, targetColor, undefined, {
      loadImage,
      createCanvas
    })

    const finalCanvas = expectDefined(canvases[0], 'expected final canvas')
    const directLayer = expectDirectLayer(template.layers[0], 'expected direct layer')
    const directOutput = toRgba(
      mapDirectLayerColor(template.referenceColor, directLayer.baseColor, targetColor)
    )
    const fixedOutput = [255, 255, 255, 64]
    const tintedOutput = toRgba(tintGrayPixel({ gray: 128, alpha: 128 }, targetColor))
    const expectedFinalPixels = blendPixelOver(
      blendPixelOver(directOutput, fixedOutput),
      tintedOutput
    )
    const directOriginalCanvas = expectCanvasByPixels(
      canvases,
      Array.from(directImage.pixels),
      'expected direct original canvas'
    )
    const directTintedCanvas = expectCanvasByPixels(
      canvases,
      directOutput,
      'expected direct tinted canvas'
    )
    const fixedTintedCanvas = expectCanvasByPixels(
      canvases,
      fixedOutput,
      'expected fixed tinted canvas'
    )
    const shadowTintedCanvas = expectCanvasByPixels(
      canvases,
      tintedOutput,
      'expected shadow tinted canvas'
    )

    expect(result.templateId).toBe(template.templateId)
    expect(result.stateCode).toBe(template.stateCode)
    expect(result.targetColor).toEqual(targetColor)
    expect(result.suspects).toEqual([])
    expect(result.finalBlob).toBeInstanceOf(Blob)
    expect(result.finalBlob.type).toBe('image/png')
    expect(await readBlobLabel(result.finalBlob)).toBe(finalCanvas.label)
    expect(Array.from(finalCanvas.pixels)).toEqual(expectedFinalPixels)

    expect(result.layers).toHaveLength(3)
    expect(result.layers.map((layer) => layer.layerId)).toEqual(['base', 'shine', 'shadow'])

    expect(result.layers[0]).toMatchObject({
      layerId: 'base',
      kind: 'direct',
      baseColor: directLayer.baseColor,
      opacity: undefined,
      usesGrayscaleTint: false,
      visible: true,
      resolvedColor: mapDirectLayerColor(template.referenceColor, directLayer.baseColor, targetColor)
    })
    expect('suspectHints' in result.layers[0]!).toBe(false)
    expect(await readBlobLabel(result.layers[0]!.originalBlob)).toBe(directOriginalCanvas.label)
    expect(await readBlobLabel(result.layers[0]!.tintedBlob)).toBe(directTintedCanvas.label)
    expect(getCanvasLabelsByPixels(canvases, directOutput)).toContain(
      await readBlobLabel(result.layers[0]!.compositeBlob)
    )

    expect(result.layers[1]).toMatchObject({
      layerId: 'shine',
      kind: 'fixed',
      baseColor: { r: 255, g: 255, b: 255, a: 255 },
      opacity: 0.5,
      usesGrayscaleTint: false,
      visible: true,
      resolvedColor: { r: 255, g: 255, b: 255, a: 255 }
    })
    expect(await readBlobLabel(result.layers[1]!.originalBlob)).toBe(
      expectCanvasByPixels(canvases, Array.from(fixedImage.pixels), 'expected fixed original canvas').label
    )
    expect(await readBlobLabel(result.layers[1]!.tintedBlob)).toBe(fixedTintedCanvas.label)
    expect(getCanvasLabelsByPixels(canvases, blendPixelOver(directOutput, fixedOutput))).toContain(
      await readBlobLabel(result.layers[1]!.compositeBlob)
    )
    expect(result.layers[2]).toMatchObject({
      layerId: 'shadow',
      kind: 'tinted-grayscale',
      baseColor: undefined,
      opacity: undefined,
      usesGrayscaleTint: true,
      visible: true,
      resolvedColor: targetColor
    })
    expect(await readBlobLabel(result.layers[2]!.originalBlob)).toBe(
      expectCanvasByPixels(canvases, Array.from(tintedImage.pixels), 'expected shadow original canvas').label
    )
    expect(await readBlobLabel(result.layers[2]!.tintedBlob)).toBe(shadowTintedCanvas.label)
    expect(getCanvasLabelsByPixels(canvases, expectedFinalPixels)).toContain(
      await readBlobLabel(result.layers[2]!.compositeBlob)
    )
  })

  it('keeps hidden layers out of final and cumulative composites while retaining previews', async () => {
    const referenceTemplate = getTemplate(0)
    const template: BeadTemplate = {
      templateId: 'debug-hidden',
      stateCode: 4,
      referenceColor: referenceTemplate.referenceColor,
      layers: [
        {
          id: 'base',
          assetPath: '/test/direct.png',
          kind: 'direct',
          baseColor: { r: 171, g: 31, b: 30, a: 255 }
        },
        {
          id: 'shadow',
          assetPath: '/test/tinted.png',
          kind: 'tinted-grayscale'
        }
      ]
    }
    const directImage = createMockImage('base', [1, 2, 3, 255])
    const tintedImage = createMockImage('shadow', [128, 128, 128, 128])
    const imagesByPath: Record<string, MockImage> = {
      '/test/direct.png': directImage,
      '/test/tinted.png': tintedImage
    }
    const loadImage = vi.fn(async (assetPath: string) => imagesByPath[assetPath])
    const { canvases, createCanvas } = createCanvasFactory()

    const result = await renderBeadDebugResult(
      template,
      targetColor,
      { hiddenLayerIds: ['shadow'] },
      { loadImage, createCanvas }
    )

    const finalCanvas = expectDefined(canvases[0], 'expected final canvas')
    const baseLayer = expectDirectLayer(template.layers[0], 'expected visible base layer')
    const visiblePixels = toRgba(
      mapDirectLayerColor(template.referenceColor, baseLayer.baseColor, targetColor)
    )
    const firstLayerCompositeCanvas = expectCanvasByPixels(
      canvases,
      visiblePixels,
      'expected first layer composite canvas'
    )
    const hiddenLayerTintedCanvas = expectCanvasByPixels(
      canvases,
      toRgba(tintGrayPixel({ gray: 128, alpha: 128 }, targetColor)),
      'expected hidden tinted canvas'
    )
    const hiddenLayerCompositeCanvas = expectCanvasByPixels(
      canvases,
      visiblePixels,
      'expected hidden composite canvas'
    )
    const hiddenLayer = expectDefined(result.layers[1], 'expected hidden layer')

    expect(result.suspects).toEqual([])
    expect(hiddenLayer.visible).toBe(false)
    expect(hiddenLayer.usesGrayscaleTint).toBe(true)
    expect('suspectHints' in hiddenLayer).toBe(false)
    expect(await readBlobLabel(hiddenLayer.originalBlob)).toBe(
      expectCanvasByPixels(canvases, Array.from(tintedImage.pixels), 'expected hidden original canvas').label
    )
    expect(await readBlobLabel(hiddenLayer.tintedBlob)).toBe(hiddenLayerTintedCanvas.label)
    expect(getCanvasLabelsByPixels(canvases, visiblePixels)).toContain(
      await readBlobLabel(hiddenLayer.compositeBlob)
    )
    expect(getCanvasLabelsByPixels(canvases, visiblePixels)).toContain(
      await readBlobLabel(result.layers[0]!.compositeBlob)
    )
    expect(Array.from(finalCanvas.pixels)).toEqual(Array.from(firstLayerCompositeCanvas.pixels))
    expect(Array.from(hiddenLayerCompositeCanvas.pixels)).toEqual(
      Array.from(firstLayerCompositeCanvas.pixels)
    )
    expect(Array.from(hiddenLayerTintedCanvas.pixels)).not.toEqual(Array.from(finalCanvas.pixels))
  })

  it('excludes hidden layers from top-level suspects so warnings match the visible preview', async () => {
    const referenceTemplate = getTemplate(0)
    const template: BeadTemplate = {
      templateId: 'debug-hidden-suspects',
      stateCode: 2,
      referenceColor: referenceTemplate.referenceColor,
      layers: [
        {
          id: 'visible-shadow',
          assetPath: '/test/visible-shadow.png',
          kind: 'tinted-grayscale'
        },
        {
          id: 'hidden-shadow',
          assetPath: '/test/hidden-shadow.png',
          kind: 'tinted-grayscale'
        }
      ]
    }
    const imagesByPath: Record<string, MockImage> = {
      '/test/visible-shadow.png': createMockImage('visible-shadow', [220, 220, 220, 255]),
      '/test/hidden-shadow.png': createMockImage('hidden-shadow', [16, 16, 16, 255])
    }
    const loadImage = vi.fn(async (assetPath: string) => imagesByPath[assetPath])
    const { createCanvas } = createCanvasFactory()

    const result = await renderBeadDebugResult(
      template,
      targetColor,
      { hiddenLayerIds: ['hidden-shadow'] },
      { loadImage, createCanvas }
    )

    expect(result.layers.map((layer) => ({ layerId: layer.layerId, visible: layer.visible }))).toEqual([
      { layerId: 'visible-shadow', visible: true },
      { layerId: 'hidden-shadow', visible: false }
    ])
    expect(result.suspects).toEqual([])
  })
})
