import { describe, expect, it, vi } from 'vitest'
import type { GridData } from '../../types/grid'
import {
  downloadBeadAssetsForGrid,
  buildBeadAssetFilename,
  buildBeadGridColorsFilename,
  type BeadRenderTemplate
} from '../download'
import {
  buildBeadAssetFilename as buildBeadAssetFilenameFromBarrel,
  buildBeadGridColorsFilename as buildBeadGridColorsFilenameFromBarrel
} from '../index'
import { beadTemplates } from '../templates'

const gridData: GridData = {
  width: 2,
  height: 1,
  colorIndices: [[0, 1]],
  colors: [
    { r: 219, g: 57, b: 55, a: 255 },
    { r: 40, g: 161, b: 115, a: 255 }
  ],
  fileName: 'flower'
}

describe('buildBeadAssetFilename', () => {
  it('uses the uploaded image name and state code', () => {
    expect(buildBeadAssetFilename('flower', 0, 2)).toBe('flower0_2.png')
  })
})

describe('buildBeadGridColorsFilename', () => {
  it('uses the uploaded image name with the grid colors suffix', () => {
    expect(buildBeadGridColorsFilename('flower')).toBe('flower_grid_colors.json')
  })
})

describe('beads barrel exports', () => {
  it('re-exports both filename helpers', () => {
    expect(buildBeadAssetFilenameFromBarrel).toBe(buildBeadAssetFilename)
    expect(buildBeadGridColorsFilenameFromBarrel).toBe(buildBeadGridColorsFilename)
  })
})

describe('downloadBeadAssetsForGrid', () => {
  it('downloads json first and then pngs in state order for each color', async () => {
    const triggerDownload = vi.fn()
    const renderTemplate = vi.fn(
      (
        template: (typeof beadTemplates)[number],
        color: GridData['colors'][number]
      ) =>
      Promise.resolve(
        new Blob([`${template.templateId}:${color.r},${color.g},${color.b}`])
      )
    )
    const wait = vi.fn(async () => {})

    await downloadBeadAssetsForGrid(gridData, {
      triggerDownload,
      renderTemplate: renderTemplate as BeadRenderTemplate,
      wait
    })

    expect(renderTemplate.mock.calls).toEqual([
      [beadTemplates[0], gridData.colors[0]],
      [beadTemplates[1], gridData.colors[0]],
      [beadTemplates[2], gridData.colors[0]],
      [beadTemplates[0], gridData.colors[1]],
      [beadTemplates[1], gridData.colors[1]],
      [beadTemplates[2], gridData.colors[1]]
    ])
    expect(wait.mock.calls).toEqual([[80], [80], [80], [80], [80], [80]])
    expect(triggerDownload.mock.calls.map((call) => call[1])).toEqual([
      buildBeadGridColorsFilename('flower'),
      'flower0_2.png',
      'flower0_3.png',
      'flower0_4.png',
      'flower1_2.png',
      'flower1_3.png',
      'flower1_4.png'
    ])
  })

  it('keeps the json filename on gridData.fileName while allowing a separate png base name override', async () => {
    const triggerDownload = vi.fn()
    const renderTemplate = vi.fn(
      (
        template: (typeof beadTemplates)[number],
        color: GridData['colors'][number]
      ) =>
        Promise.resolve(
          new Blob([`${template.templateId}:${color.r},${color.g},${color.b}`])
        )
    )
    const wait = vi.fn(async () => {})

    await downloadBeadAssetsForGrid(
      { ...gridData, colors: gridData.colors.slice(0, 1), fileName: 'flower_subject' },
      {
        triggerDownload,
        renderTemplate: renderTemplate as BeadRenderTemplate,
        wait,
        assetBaseName: 'flower'
      }
    )

    expect(triggerDownload.mock.calls.map((call) => call[1])).toEqual([
      buildBeadGridColorsFilename('flower_subject'),
      'flower0_2.png',
      'flower0_3.png',
      'flower0_4.png'
    ])
  })

  it('includes color index, state, and template context when a bead export fails', async () => {
    const triggerDownload = vi.fn()
    const renderTemplate = vi.fn(
      async (template: (typeof beadTemplates)[number]) => {
        if (template.stateCode === 3) {
          throw new Error('broken render')
        }

        return new Blob([template.templateId])
      }
    )
    const wait = vi.fn(async () => {})

    await expect(downloadBeadAssetsForGrid(gridData, {
      triggerDownload,
      renderTemplate: renderTemplate as BeadRenderTemplate,
      wait
    })).rejects.toThrow('color index 0, state 3 (bean0_3)')
  })

  it('uses the browser download helper and defers URL cleanup', async () => {
    vi.useFakeTimers()
    const createObjectURL = vi.mocked(URL.createObjectURL)
    const revokeObjectURL = vi.mocked(URL.revokeObjectURL)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const renderTemplate = vi.fn(async () => new Blob(['png']))

    try {
      await downloadBeadAssetsForGrid({ ...gridData, colors: gridData.colors.slice(0, 1) }, {
        renderTemplate: renderTemplate as BeadRenderTemplate,
        wait: async () => {}
      })

      expect(createObjectURL).toHaveBeenCalledTimes(4)
      expect(click).toHaveBeenCalledTimes(4)
      expect(revokeObjectURL).not.toHaveBeenCalled()

      await vi.runAllTimersAsync()

      expect(revokeObjectURL).toHaveBeenCalledTimes(4)
    } finally {
      click.mockRestore()
      vi.useRealTimers()
    }
  })

  it('downloads only json when there are no colors', async () => {
    const triggerDownload = vi.fn()
    const renderTemplate = vi.fn()
    const wait = vi.fn()

    await downloadBeadAssetsForGrid({ ...gridData, colors: [] }, {
      triggerDownload,
      renderTemplate: renderTemplate as BeadRenderTemplate,
      wait
    })

    expect(triggerDownload.mock.calls.map((call) => call[1])).toEqual([
      buildBeadGridColorsFilename('flower')
    ])
    expect(renderTemplate).not.toHaveBeenCalled()
    expect(wait).not.toHaveBeenCalled()
  })
})
