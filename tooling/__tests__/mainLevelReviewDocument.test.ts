// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { LevelConfigItem } from '../../src/types/levelConfig'
import type { PixelConfigItem } from '../../src/types/pixelConfig'
import type { MainLevelReviewGenerateRequest } from '../../src/types/mainLevelReview'
import {
  buildMainLevelReviewRecords,
  renderMainLevelReviewHtml,
  type MainLevelReviewRecord
} from '../mainLevelReviewDocument'

const makeLevel = (overrides: Partial<LevelConfigItem> = {}): LevelConfigItem => ({
  id: 1,
  thumbnail: 'flower',
  type: 1,
  difficulty: 2,
  pixelImageId: 1000,
  widthHeight: [2, 2],
  storageMaxSlots: 4,
  storageCols: 4,
  storageInitialSlots: 2,
  adUnlockIncrement: 1,
  initialTimeLimit: 120,
  adTimeIncrement: 30,
  reviveCount: 1,
  propConfigs: [{ type: 'hammer', count: 1 }],
  ...overrides
})

const makePixel = (overrides: Partial<PixelConfigItem> = {}): PixelConfigItem => ({
  id: 1000,
  name: 'flower',
  gridWidthHeight: [2, 2],
  pixelWidthHeight: [20, 20],
  localPixelResource: ['red', 'green'],
  pixelMatrix: [[0, 1], [-1, 0]],
  initPixel: [[0, 1], [-1, 0]],
  beadCount: 3,
  theme: 'plant',
  quality: 4,
  imageType: 2,
  albumId: 'spring',
  difficulty: 3,
  ...overrides
})

const makeRecord = (
  levelOverrides: Partial<LevelConfigItem> = {},
  recordOverrides: Partial<MainLevelReviewRecord> = {}
): MainLevelReviewRecord => ({
  level: makeLevel(levelOverrides),
  pixel: {
    name: 'flower',
    theme: 'plant',
    quality: 4,
    imageType: 2,
    albumId: 'spring',
    difficulty: 3
  },
  initPixel: [[0, 1], [-1, 0]],
  localPixelResource: ['red', 'green'],
  colorCount: 2,
  beadCount: 3,
  diagnostics: [],
  ...recordOverrides
})

describe('buildMainLevelReviewRecords', () => {
  it('sorts levels, reduces pixel metadata, counts colors, and retains missing associations', () => {
    const matchedLevel = makeLevel({ id: 20 })
    const missingLevel = makeLevel({ id: 10, pixelImageId: 999 })
    const pixel = makePixel()
    const request: MainLevelReviewGenerateRequest = {
      levels: [matchedLevel, missingLevel],
      pixelConfigs: [pixel]
    }

    const result = buildMainLevelReviewRecords(
      request,
      ['red_2.png', 'red_3.png', 'green_2.png', 'green_3.png']
    )

    expect(result.records.map((record) => record.level.id)).toEqual([10, 20])
    expect(result.records[0]).toMatchObject({
      pixel: null,
      initPixel: null,
      localPixelResource: [],
      colorCount: null,
      beadCount: null,
      diagnostics: ['No image configuration for pixelImageId 999']
    })
    expect(result.records[1]).toMatchObject({
      pixel: {
        name: 'flower',
        theme: 'plant',
        quality: 4,
        imageType: 2,
        albumId: 'spring',
        difficulty: 3
      },
      initPixel: [[0, 1], [-1, 0]],
      localPixelResource: ['red', 'green'],
      colorCount: 2,
      beadCount: 3,
      diagnostics: []
    })
    expect(result.warnings).toEqual([
      'Level 10: No image configuration for pixelImageId 999'
    ])

    expect(result.records[1].level).not.toBe(matchedLevel)
    expect(result.records[1].level.widthHeight).not.toBe(matchedLevel.widthHeight)
    expect(result.records[1].level.propConfigs).not.toBe(matchedLevel.propConfigs)
    expect(result.records[1].initPixel).not.toBe(pixel.initPixel)
    expect(result.records[1].initPixel?.[0]).not.toBe(pixel.initPixel[0])
    expect(result.records[1].localPixelResource).not.toBe(pixel.localPixelResource)
  })

  it('falls back to non-negative initPixel cells when beadCount is invalid', () => {
    const request = {
      levels: [makeLevel()],
      pixelConfigs: [makePixel({ beadCount: Number.NaN, initPixel: [[0, -1, 2], [2, 2, -1]] })]
    } as MainLevelReviewGenerateRequest

    const result = buildMainLevelReviewRecords(
      request,
      ['red_2.png', 'red_3.png', 'green_2.png', 'green_3.png']
    )

    expect(result.records[0]).toMatchObject({ colorCount: 2, beadCount: 4 })
  })

  it('warns about missing mappings and bead layers in color-index then state order', () => {
    const request: MainLevelReviewGenerateRequest = {
      levels: [makeLevel({ id: 7 })],
      pixelConfigs: [makePixel({ localPixelResource: ['red'], initPixel: [[2, 0, 1, 2]] })]
    }

    const result = buildMainLevelReviewRecords(request, ['red_3.png'])

    expect(result.records[0].diagnostics).toEqual([
      'Color index 0 is missing red_2.png',
      'Color index 1 has no resource name mapping',
      'Color index 2 has no resource name mapping'
    ])
    expect(result.warnings).toEqual([
      'Level 7: Color index 0 is missing red_2.png',
      'Level 7: Color index 1 has no resource name mapping',
      'Level 7: Color index 2 has no resource name mapping'
    ])
  })

  it('orders global warnings by ascending level ID regardless of request order', () => {
    const request: MainLevelReviewGenerateRequest = {
      levels: [
        makeLevel({ id: 20, pixelImageId: 998 }),
        makeLevel({ id: 10, pixelImageId: 999 })
      ],
      pixelConfigs: []
    }

    const result = buildMainLevelReviewRecords(request, [])

    expect(result.warnings).toEqual([
      'Level 10: No image configuration for pixelImageId 999',
      'Level 20: No image configuration for pixelImageId 998'
    ])
  })

  it('rejects non-array request collections with clear Chinese errors', () => {
    expect(() => buildMainLevelReviewRecords(
      { levels: null, pixelConfigs: [] } as unknown as MainLevelReviewGenerateRequest,
      []
    )).toThrow('Level configuration levels must be an array')

    expect(() => buildMainLevelReviewRecords(
      { levels: [], pixelConfigs: {} } as unknown as MainLevelReviewGenerateRequest,
      []
    )).toThrow('Image configuration pixelConfigs must be an array')
  })

  it.each([
    [],
    [[0], []],
    [[0, 1], [1]],
    [[0, 1.5]],
    [[0, Number.NaN]]
  ])('retains metadata but nulls matrix and counts for invalid initPixel %#', (initPixel) => {
    const request: MainLevelReviewGenerateRequest = {
      levels: [makeLevel({ id: 8 })],
      pixelConfigs: [makePixel({ initPixel })]
    }

    const result = buildMainLevelReviewRecords(request, [])

    expect(result.records[0]).toMatchObject({
      pixel: { name: 'flower' },
      initPixel: null,
      localPixelResource: ['red', 'green'],
      colorCount: null,
      beadCount: null,
      diagnostics: ['Preview matrix initPixel is unavailable']
    })
    expect(result.warnings).toEqual(['Level 8: Preview matrix initPixel is unavailable'])
  })
})

describe('renderMainLevelReviewHtml', () => {
  it('serializes hostile inline-script data safely and provides runtime HTML escaping', () => {
    const injected = '</script><script>globalThis.injected=true</script>'
    const html = renderMainLevelReviewHtml([
      makeRecord({}, {
        pixel: {
          name: injected,
          theme: '&<theme>',
          quality: '\u2028quality',
          imageType: '\u2029image',
          albumId: null,
          difficulty: null
        },
        diagnostics: [`bad ${injected}`]
      })
    ], '2026-07-16T12:00:00<unsafe>&')

    expect(html).toMatch(/^<!doctype html>/i)
    expect(html.match(/<!doctype html>/gi)).toHaveLength(1)
    expect(html).not.toContain(injected)
    expect(html).not.toContain('</script><script>')
    expect(html).toContain('\\u003c/script\\u003e\\u003cscript\\u003e')
    expect(html).toContain('\\u0026')
    expect(html).toContain('\\u2028')
    expect(html).toContain('\\u2029')
    expect(html).toMatch(/(?:function|const)\s+escapeHtml\b/)
    expect(html).toMatch(/escapeHtml\([^)]*diagnostic/)
    expect(html.endsWith('\n')).toBe(true)
  })

  it('uses exactly twelve records per page with top and bottom navigation and a clamped jump', () => {
    const html = renderMainLevelReviewHtml(
      Array.from({ length: 25 }, (_, index) => makeRecord({ id: index + 1 })),
      '2026-07-16T12:00:00Z'
    )

    expect(html).toMatch(/const\s+PAGE_SIZE\s*=\s*12\s*;/)
    expect(html).toContain('id="top-pager"')
    expect(html).toContain('id="bottom-pager"')
    expect(html).toContain('data-action="previous"')
    expect(html).toContain('data-action="next"')
    expect(html).toContain('data-action="page"')
    expect(html).toContain('data-action="jump"')
    expect(html).toContain('data-role="jump-input"')
    expect(html).toMatch(/records\.slice\(start,\s*start\s*\+\s*PAGE_SIZE\)/)
    expect(html).toMatch(/Math\.min\(totalPages,\s*Math\.max\(1,/)
    expect(html).toMatch(/scrollIntoView\(/)
  })

  it('renders local bead layers at 25 and 21 pixels without network-only behavior', () => {
    const html = renderMainLevelReviewHtml([
      makeRecord({}, { localPixelResource: ['red bead', '蓝色/bean'] })
    ], '2026-07-16T12:00:00Z')

    expect(html).toContain('assets/beads/')
    expect(html).toContain('encodeURIComponent(resourceName)')
    expect(html).toContain("'_2.png'")
    expect(html).toContain("'_3.png'")
    expect(html).toMatch(/const\s+baseSize\s*=\s*25\s*;/)
    expect(html).toMatch(/const\s+topSize\s*=\s*21\s*;/)
    expect(html).not.toMatch(/crossOrigin/i)
    expect(html).not.toMatch(/\bfetch\s*\(/)
    expect(html).not.toMatch(/<script[^>]+(?:src|type=["']module["'])/i)
    expect(html).not.toMatch(/<link[^>]+(?:stylesheet|href)/i)
  })

  it('includes review-only layout labels and all secondary fields without duplicate ID controls', () => {
    const html = renderMainLevelReviewHtml([makeRecord()], '2026-07-16T12:00:00Z')

    expect(html).toContain('Main level review')
    expect(html).toContain('Color count')
    expect(html).toContain('Bead count')
    for (const label of [
      'Thumbnail', 'Type', 'Difficulty', 'pixelImageId', 'Dimensions', 'Maximum slots', 'Storage columns',
      'Initial slots', 'Slots unlocked per ad', 'Initial time limit', 'Extra time per ad', 'Revives', 'Item configuration',
      'Image name', 'Theme', 'Quality', 'Image type', 'Album ID', 'Image difficulty'
    ]) {
      expect(html).toContain(label)
    }
    expect(html).toContain('class="level-id"')
    expect(html).not.toContain('data-field="id"')
    expect(html).not.toContain('Level ID')
    expect(html).not.toContain('Save this level')
    expect(html).not.toContain('Delete level')
    expect(html).not.toMatch(/<textarea\b/i)
  })

  it('embeds generated time and record data in the complete deterministic document', () => {
    const html = renderMainLevelReviewHtml([
      makeRecord({ id: 77, thumbnail: 'rare<&>thumb', propConfigs: [] }, {
        diagnostics: ['resource<&>warning']
      })
    ], '2026-07-16T12:34:56.000Z')

    expect(html).toContain('2026-07-16T12:34:56.000Z')
    expect(html).toContain('rare\\u003c\\u0026\\u003ethumb')
    expect(html).toContain('resource\\u003c\\u0026\\u003ewarning')
    expect(html).toMatch(/<html\s+lang="en">/)
    expect(html).toContain('<meta charset="UTF-8">')
    expect(html).toMatch(/<\/html>\n$/)
    const inlineScript = html.match(/<script>([\s\S]*)<\/script>/)?.[1]
    expect(inlineScript).toBeDefined()
    expect(() => new Function(inlineScript as string)).not.toThrow()
  })
})
