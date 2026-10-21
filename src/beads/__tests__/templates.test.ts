import { describe, expect, it } from 'vitest'
import { beadTemplates, getBeadTemplateByState } from '../templates'

const beadAssetFiles = import.meta.glob('/public/beads/**/*.png', { eager: true })

describe('beadTemplates', () => {
  it('defines the three bead states with stable metadata and files', () => {
    expect(beadTemplates.map((template) => template.stateCode)).toEqual([2, 3, 4])

    const bean0_2 = getBeadTemplateByState(2)
    expect(bean0_2?.layers.map((layer) => layer.id)).toEqual(['base', 'mid', 'top_gray'])
    expect(bean0_2?.layers.map((layer) => layer.assetPath)).toEqual([
      '/beads/bean0_2/base.png',
      '/beads/bean0_2/mid.png',
      '/beads/bean0_2/top_gray.png'
    ])
    expect(bean0_2?.layers.map((layer) => layer.kind)).toEqual([
      'direct',
      'fixed',
      'tinted-grayscale'
    ])
    expect(bean0_2?.layers[0]).toEqual({
      id: 'base',
      assetPath: '/beads/bean0_2/base.png',
      kind: 'direct',
      baseColor: { r: 171, g: 31, b: 30, a: 255 }
    })
    expect(bean0_2?.layers[1]).toEqual({
      id: 'mid',
      assetPath: '/beads/bean0_2/mid.png',
      kind: 'fixed',
      baseColor: { r: 255, g: 255, b: 255, a: 255 },
      opacity: 0.2
    })
    expect(bean0_2?.layers[2]).toEqual({
      id: 'top_gray',
      assetPath: '/beads/bean0_2/top_gray.png',
      kind: 'tinted-grayscale'
    })

    const bean0_3 = getBeadTemplateByState(3)
    expect(bean0_3?.layers.map((layer) => layer.id)).toEqual([
      'base_color',
      'base_outline',
      'top_up',
      'top_down',
      'top_left',
      'top_right'
    ])
    expect(bean0_3?.layers.map((layer) => layer.assetPath)).toEqual([
      '/beads/bean0_3/base_color.png',
      '/beads/bean0_3/base_outline.png',
      '/beads/bean0_3/top_up.png',
      '/beads/bean0_3/top_down.png',
      '/beads/bean0_3/top_left.png',
      '/beads/bean0_3/top_right.png'
    ])
    expect(bean0_3?.layers.map((layer) => layer.kind)).toEqual([
      'direct',
      'fixed',
      'direct',
      'direct',
      'direct',
      'direct'
    ])
    expect(bean0_3?.layers[0]).toEqual({
      id: 'base_color',
      assetPath: '/beads/bean0_3/base_color.png',
      kind: 'direct',
      baseColor: { r: 153, g: 13, b: 12, a: 255 }
    })
    expect(bean0_3?.layers[1]).toEqual({
      id: 'base_outline',
      assetPath: '/beads/bean0_3/base_outline.png',
      kind: 'fixed',
      baseColor: { r: 139, g: 23, b: 24, a: 255 }
    })
    expect(bean0_3?.layers[2]).toEqual({
      id: 'top_up',
      assetPath: '/beads/bean0_3/top_up.png',
      kind: 'direct',
      baseColor: { r: 219, g: 57, b: 55, a: 255 }
    })

    const bean0_4 = getBeadTemplateByState(4)
    expect(bean0_4?.layers.map((layer) => layer.id)).toEqual([
      'base-1',
      'mid-down',
      'mid-left',
      'mid-right',
      'mid-up',
      'top-frame'
    ])
    expect(bean0_4?.layers.map((layer) => layer.assetPath)).toEqual([
      '/beads/bean0_4/base-1.png',
      '/beads/bean0_4/mid-down.png',
      '/beads/bean0_4/mid-left.png',
      '/beads/bean0_4/mid-right.png',
      '/beads/bean0_4/mid-up.png',
      '/beads/bean0_4/top-frame.png'
    ])
    expect(bean0_4?.layers.map((layer) => layer.kind)).toEqual([
      'direct',
      'direct',
      'direct',
      'direct',
      'direct',
      'fixed'
    ])
    expect(bean0_4?.layers[0]).toEqual({
      id: 'base-1',
      assetPath: '/beads/bean0_4/base-1.png',
      kind: 'direct',
      baseColor: { r: 129, g: 13, b: 13, a: 255 }
    })
    expect(bean0_4?.layers[5]).toEqual({
      id: 'top-frame',
      assetPath: '/beads/bean0_4/top-frame.png',
      kind: 'fixed',
      baseColor: { r: 110, g: 8, b: 6, a: 255 }
    })

    for (const template of beadTemplates) {
      const ids = template.layers.map((layer) => layer.id)
      expect(new Set(ids).size).toBe(ids.length)

      for (const layer of template.layers) {
        expect(
          Object.keys(beadAssetFiles).some((path) => path.endsWith(layer.assetPath))
        ).toBe(true)
      }
    }
  })
})
