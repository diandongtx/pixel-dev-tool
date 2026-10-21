import type { RGBColor } from '../types/grid'
import { clampByte, mapBean0_4LayerColor, mapDirectLayerColor, tintGrayPixel } from './color'
import { analyzeDebugSuspects } from './debug'
import type {
  BeadDebugLayerResult,
  BeadDebugRenderOptions,
  BeadDebugRenderResult,
  BeadLayerTemplate,
  BeadTemplate
} from './types'

export interface RenderDeps {
  loadImage: (assetPath: string) => Promise<HTMLImageElement>
  createCanvas: () => HTMLCanvasElement
}

interface PaintedLayerResult {
  canvas: HTMLCanvasElement
  analysisColor: RGBColor
}

const defaultDeps: RenderDeps = {
  loadImage: (assetPath) =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`Failed to load bead layer image: ${assetPath}`))
      image.src = assetPath
    }),
  createCanvas: () => document.createElement('canvas')
}

const getCanvasContext = (
  canvas: HTMLCanvasElement,
  label: string
): CanvasRenderingContext2D => {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error(`Canvas 2D context unavailable for ${label}`)
  }

  return context
}

const exportCanvasBlob = (
  canvas: HTMLCanvasElement,
  failureMessage: string
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(failureMessage))
        return
      }

      resolve(blob)
    }, 'image/png')
  })

const applyAlphaMask = (sourceAlpha: number, targetAlpha: number): number =>
  clampByte((sourceAlpha * targetAlpha) / 255)

const getGrayscaleIntensity = (red: number, green: number, blue: number): number =>
  Math.round((red + green + blue) / 3)

const resolveLayerColor = (
  template: BeadTemplate,
  layer: BeadLayerTemplate,
  targetColor: RGBColor
): RGBColor => {
  if (template.templateId === 'bean0_4') {
    return mapBean0_4LayerColor(layer.id, targetColor)
  }

  if (layer.kind === 'direct') {
    return mapDirectLayerColor(template.referenceColor, layer.baseColor, targetColor)
  }

  if (layer.kind === 'fixed') {
    return layer.baseColor
  }

  return targetColor
}

const getAverageOpaqueColor = (imageData: ImageData): RGBColor => {
  let alphaTotal = 0
  let redTotal = 0
  let greenTotal = 0
  let blueTotal = 0

  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3]
    if (alpha === 0) {
      continue
    }

    alphaTotal += alpha
    redTotal += imageData.data[index] * alpha
    greenTotal += imageData.data[index + 1] * alpha
    blueTotal += imageData.data[index + 2] * alpha
  }

  if (alphaTotal === 0) {
    return { r: 0, g: 0, b: 0, a: 0 }
  }

  return {
    r: clampByte(redTotal / alphaTotal),
    g: clampByte(greenTotal / alphaTotal),
    b: clampByte(blueTotal / alphaTotal),
    a: clampByte(alphaTotal / (imageData.data.length / 4))
  }
}

const paintLayerToCanvas = (
  template: BeadTemplate,
  layer: BeadLayerTemplate,
  image: HTMLImageElement,
  targetColor: RGBColor,
  createCanvas: RenderDeps['createCanvas']
): PaintedLayerResult => {
  const canvas = createCanvas()
  canvas.width = image.width
  canvas.height = image.height

  const context = getCanvasContext(canvas, `${template.templateId}/${layer.id}`)
  context.drawImage(image, 0, 0)

  const imageData = context.getImageData(0, 0, image.width, image.height)
  const layerColor = resolveLayerColor(template, layer, targetColor)

  for (let index = 0; index < imageData.data.length; index += 4) {
    const sourceAlpha = imageData.data[index + 3]
    if (sourceAlpha === 0) {
      continue
    }

    if (layer.kind === 'tinted-grayscale') {
      const tinted = tintGrayPixel(
        {
          gray: getGrayscaleIntensity(
            imageData.data[index],
            imageData.data[index + 1],
            imageData.data[index + 2]
          ),
          alpha: sourceAlpha
        },
        layerColor
      )

      imageData.data[index] = tinted.r
      imageData.data[index + 1] = tinted.g
      imageData.data[index + 2] = tinted.b
      imageData.data[index + 3] = tinted.a
      continue
    }

    imageData.data[index] = layerColor.r
    imageData.data[index + 1] = layerColor.g
    imageData.data[index + 2] = layerColor.b

    const opacityMultiplier = layer.kind === 'fixed' ? layer.opacity ?? 1 : 1
    const scaledAlpha = clampByte(sourceAlpha * opacityMultiplier)
    imageData.data[index + 3] = applyAlphaMask(scaledAlpha, layerColor.a)
  }

  context.putImageData(imageData, 0, 0)
  return {
    canvas,
    analysisColor: getAverageOpaqueColor(imageData)
  }
}

const cloneCanvas = (
  source: HTMLCanvasElement,
  createCanvas: RenderDeps['createCanvas'],
  label: string
): HTMLCanvasElement => {
  const canvas = createCanvas()
  canvas.width = source.width
  canvas.height = source.height

  const context = getCanvasContext(canvas, label)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0)

  return canvas
}

const loadTemplateImages = async (
  template: BeadTemplate,
  loadImage: RenderDeps['loadImage']
): Promise<HTMLImageElement[]> => {
  if (template.layers.length === 0) {
    throw new Error(`Template ${template.templateId} has no layers`)
  }

  const images = await Promise.all(template.layers.map((layer) => loadImage(layer.assetPath)))
  const [firstImage, ...restImages] = images

  for (const image of restImages) {
    if (image.width !== firstImage.width || image.height !== firstImage.height) {
      throw new Error(`Layer size mismatch in template ${template.templateId}`)
    }
  }

  return images
}

const createFinalCanvas = (
  template: BeadTemplate,
  firstImage: HTMLImageElement,
  createCanvas: RenderDeps['createCanvas']
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } => {
  const canvas = createCanvas()
  canvas.width = firstImage.width
  canvas.height = firstImage.height

  const context = getCanvasContext(canvas, `${template.templateId}/final`)
  context.clearRect(0, 0, canvas.width, canvas.height)

  return { canvas, context }
}

export const renderBeadBlob = async (
  template: BeadTemplate,
  targetColor: RGBColor,
  deps: Partial<RenderDeps> = {}
): Promise<Blob> => {
  const { loadImage, createCanvas } = { ...defaultDeps, ...deps }
  const images = await loadTemplateImages(template, loadImage)
  const [firstImage] = images
  const { canvas, context } = createFinalCanvas(template, firstImage, createCanvas)

  template.layers.forEach((layer, index) => {
    const paintedLayer = paintLayerToCanvas(
      template,
      layer,
      images[index],
      targetColor,
      createCanvas
    )

    context.drawImage(paintedLayer.canvas, 0, 0)
  })

  return exportCanvasBlob(canvas, `Failed to export PNG blob for template ${template.templateId}`)
}

export const renderBeadDebugResult = async (
  template: BeadTemplate,
  targetColor: RGBColor,
  options: BeadDebugRenderOptions = {},
  deps: Partial<RenderDeps> = {}
): Promise<BeadDebugRenderResult> => {
  const { loadImage, createCanvas } = { ...defaultDeps, ...deps }
  const images = await loadTemplateImages(template, loadImage)
  const [firstImage] = images
  const { canvas: finalCanvas, context: finalContext } = createFinalCanvas(
    template,
    firstImage,
    createCanvas
  )
  const hiddenLayerIds = new Set(options.hiddenLayerIds ?? [])
  const layers: BeadDebugLayerResult[] = []

  for (const [index, layer] of template.layers.entries()) {
    const image = images[index]
    const originalCanvas = createCanvas()
    originalCanvas.width = image.width
    originalCanvas.height = image.height
    getCanvasContext(originalCanvas, `${template.templateId}/${layer.id}/original`).drawImage(image, 0, 0)

    const paintedLayer = paintLayerToCanvas(template, layer, image, targetColor, createCanvas)
    const tintedCanvas = paintedLayer.canvas
    const visible = !hiddenLayerIds.has(layer.id)

    if (visible) {
      finalContext.drawImage(tintedCanvas, 0, 0)
    }

    const cumulativeCanvas = cloneCanvas(
      finalCanvas,
      createCanvas,
      `${template.templateId}/${layer.id}/cumulative`
    )

    layers.push({
      layerId: layer.id,
      assetPath: layer.assetPath,
      kind: layer.kind,
      order: index,
      baseColor: 'baseColor' in layer ? layer.baseColor : undefined,
      opacity: layer.kind === 'fixed' ? layer.opacity : undefined,
      usesGrayscaleTint: layer.kind === 'tinted-grayscale',
      resolvedColor: resolveLayerColor(template, layer, targetColor),
      analysisColor: paintedLayer.analysisColor,
      visible,
      originalBlob: await exportCanvasBlob(
        originalCanvas,
        `Failed to export PNG blob for template ${template.templateId} (${layer.id}/original)`
      ),
      tintedBlob: await exportCanvasBlob(
        tintedCanvas,
        `Failed to export PNG blob for template ${template.templateId} (${layer.id}/tinted)`
      ),
      compositeBlob: await exportCanvasBlob(
        cumulativeCanvas,
        `Failed to export PNG blob for template ${template.templateId} (${layer.id}/cumulative)`
      )
    })
  }

  const suspects = analyzeDebugSuspects(
    targetColor,
    layers.map((layer) => ({
      layerId: layer.layerId,
      kind: layer.kind,
      resolvedColor: layer.resolvedColor,
      analysisColor: layer.analysisColor,
      usesGrayscaleTint: layer.usesGrayscaleTint,
      visible: layer.visible
    }))
  )

  return {
    templateId: template.templateId,
    stateCode: template.stateCode,
    targetColor,
    finalBlob: await exportCanvasBlob(
      finalCanvas,
      `Failed to export PNG blob for template ${template.templateId} (final)`
    ),
    suspects,
    layers
  }
}
