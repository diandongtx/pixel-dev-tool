import type { RGBColor } from '../types/grid'

interface BeadLayerTemplateBase {
  id: string
  assetPath: string
}

export interface DirectBeadLayerTemplate extends BeadLayerTemplateBase {
  kind: 'direct'
  baseColor: RGBColor
}

export interface FixedBeadLayerTemplate extends BeadLayerTemplateBase {
  kind: 'fixed'
  baseColor: RGBColor
  opacity?: number
}

export interface TintedGrayscaleBeadLayerTemplate extends BeadLayerTemplateBase {
  kind: 'tinted-grayscale'
}

export type BeadLayerTemplate =
  | DirectBeadLayerTemplate
  | FixedBeadLayerTemplate
  | TintedGrayscaleBeadLayerTemplate

export interface BeadTemplate {
  templateId: string
  stateCode: 2 | 3 | 4
  referenceColor: RGBColor
  layers: BeadLayerTemplate[]
}

export type BeadDebugSuspectReason =
  | 'fixed-hue-mismatch'
  | 'dark-grayscale'
  | 'resolved-hue-mismatch'

export interface BeadDebugSuspectHint {
  layerId: string
  reason: BeadDebugSuspectReason
  message: string
}

export interface BeadDebugLayerResult {
  layerId: string
  assetPath: string
  kind: BeadLayerTemplate['kind']
  order: number
  baseColor?: RGBColor
  opacity?: number
  usesGrayscaleTint: boolean
  resolvedColor: RGBColor
  analysisColor?: RGBColor
  visible: boolean
  originalBlob: Blob
  tintedBlob: Blob
  compositeBlob: Blob
}

export interface BeadDebugRenderResult {
  templateId: string
  stateCode: BeadTemplate['stateCode']
  targetColor: RGBColor
  finalBlob: Blob
  suspects: BeadDebugSuspectHint[]
  layers: BeadDebugLayerResult[]
}

export interface BeadDebugRenderOptions {
  hiddenLayerIds?: string[]
}
