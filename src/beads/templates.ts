import type { BeadTemplate } from './types'

const referenceColor = { r: 219, g: 57, b: 55, a: 255 } as const

export const beadTemplates = [
  {
    templateId: 'bean0_2',
    stateCode: 2,
    referenceColor,
    layers: [
      {
        id: 'base',
        assetPath: '/beads/bean0_2/base.png',
        kind: 'direct',
        baseColor: { r: 171, g: 31, b: 30, a: 255 }
      },
      {
        id: 'mid',
        assetPath: '/beads/bean0_2/mid.png',
        kind: 'fixed',
        baseColor: { r: 255, g: 255, b: 255, a: 255 },
        opacity: 0.2
      },
      {
        id: 'top_gray',
        assetPath: '/beads/bean0_2/top_gray.png',
        kind: 'tinted-grayscale'
      }
    ]
  },
  {
    templateId: 'bean0_3',
    stateCode: 3,
    referenceColor,
    layers: [
      {
        id: 'base_color',
        assetPath: '/beads/bean0_3/base_color.png',
        kind: 'direct',
        baseColor: { r: 153, g: 13, b: 12, a: 255 }
      },
      {
        id: 'base_outline',
        assetPath: '/beads/bean0_3/base_outline.png',
        kind: 'fixed',
        baseColor: { r: 139, g: 23, b: 24, a: 255 }
      },
      {
        id: 'top_up',
        assetPath: '/beads/bean0_3/top_up.png',
        kind: 'direct',
        baseColor: { r: 219, g: 57, b: 55, a: 255 }
      },
      {
        id: 'top_down',
        assetPath: '/beads/bean0_3/top_down.png',
        kind: 'direct',
        baseColor: { r: 153, g: 13, b: 12, a: 255 }
      },
      {
        id: 'top_left',
        assetPath: '/beads/bean0_3/top_left.png',
        kind: 'direct',
        baseColor: { r: 171, g: 31, b: 30, a: 255 }
      },
      {
        id: 'top_right',
        assetPath: '/beads/bean0_3/top_right.png',
        kind: 'direct',
        baseColor: { r: 171, g: 31, b: 30, a: 255 }
      }
    ]
  },
  {
    templateId: 'bean0_4',
    stateCode: 4,
    referenceColor,
    layers: [
      {
        id: 'base-1',
        assetPath: '/beads/bean0_4/base-1.png',
        kind: 'direct',
        baseColor: { r: 129, g: 13, b: 13, a: 255 }
      },
      {
        id: 'mid-down',
        assetPath: '/beads/bean0_4/mid-down.png',
        kind: 'direct',
        baseColor: { r: 153, g: 13, b: 12, a: 255 }
      },
      {
        id: 'mid-left',
        assetPath: '/beads/bean0_4/mid-left.png',
        kind: 'direct',
        baseColor: { r: 171, g: 31, b: 30, a: 255 }
      },
      {
        id: 'mid-right',
        assetPath: '/beads/bean0_4/mid-right.png',
        kind: 'direct',
        baseColor: { r: 171, g: 31, b: 30, a: 255 }
      },
      {
        id: 'mid-up',
        assetPath: '/beads/bean0_4/mid-up.png',
        kind: 'direct',
        baseColor: { r: 219, g: 57, b: 55, a: 255 }
      },
      {
        id: 'top-frame',
        assetPath: '/beads/bean0_4/top-frame.png',
        kind: 'fixed',
        baseColor: { r: 110, g: 8, b: 6, a: 255 }
      }
    ]
  }
] satisfies BeadTemplate[]

export const getBeadTemplateByState = (stateCode: 2 | 3 | 4): BeadTemplate | undefined =>
  beadTemplates.find((template) => template.stateCode === stateCode)
