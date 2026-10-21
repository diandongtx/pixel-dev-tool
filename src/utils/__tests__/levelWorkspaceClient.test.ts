import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GridData } from '../../types/grid'
import type { LevelConfigItem } from '../../types/levelConfig'
import type { PixelPaletteFile } from '../../types/pixelPalette'
import type { PixelConfigItem } from '../../types/pixelConfig'
import { countPixelConfigBeads } from '../pixelConfigBeadCount'
import {
  deleteLevelDraft,
  deleteLevelWorkspaceThumbnail,
  generateMainLevelReview,
  getLevelWorkspaceSummary,
  readLevelDraft,
  readLevelWorkspaceLevelConfig,
  readLevelWorkspacePixelPalettes,
  readLevelWorkspaceThumbnails,
  readLevelWorkspacePixelConfig,
  readLevelWorkspaceThumbnailStatus,
  saveLevelDraft,
  saveLevelWorkspaceLevelConfig,
  saveLevelWorkspacePixelPalettes,
  saveLevelWorkspacePixelConfig,
  saveLevelWorkspaceThumbnail
} from '../levelWorkspaceClient'

const mapGrid: GridData = {
  width: 1,
  height: 1,
  colorIndices: [[0]],
  colors: [{ r: 1, g: 2, b: 3, a: 255 }],
  fileName: 'flower'
}

const legacyPixelConfig = {
  id: 1000,
  name: 'flower',
  gridWidthHeight: [1, 1] as [number, number],
  pixelWidthHeight: [1, 1] as [number, number],
  localPixelResource: ['bakery0'],
  pixelMatrix: [[0]],
  initPixel: [[0]]
} satisfies Omit<PixelConfigItem, 'beadCount'>

const pixelConfig: PixelConfigItem = {
  ...legacyPixelConfig,
  beadCount: countPixelConfigBeads(legacyPixelConfig.pixelMatrix)
}

const pixelPalettes: PixelPaletteFile = {
  version: 1,
  items: [
    {
      pixelImageId: 1000,
      name: 'flower',
      colors: [{ r: 1, g: 2, b: 3, a: 255 }],
      updatedAt: '2026-05-19T00:00:00.000Z'
    }
  ]
}

const levelConfig: LevelConfigItem = {
  id: 1,
  thumbnail: 'flower',
  type: 1,
  difficulty: 1,
  pixelImageId: 1000,
  widthHeight: [1, 1],
  storageMaxSlots: 4,
  storageCols: 4,
  storageInitialSlots: 2,
  adUnlockIncrement: 1,
  initialTimeLimit: 120,
  adTimeIncrement: 30,
  reviveCount: 1,
  propConfigs: []
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

describe('level workspace client', () => {
  it('loads daily date IDs and preserves their type and extra fields through saving', async () => {
    const daily = { ...levelConfig, id: '2026-05-01', type: 1, highDifficulty: false, threeStarSeconds: 90, twoStarSeconds: 110 }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([daily]))
      .mockResolvedValueOnce(jsonResponse({ ok: true, count: 1, type: 2 }))
    vi.stubGlobal('fetch', fetchMock)
    const items = await readLevelWorkspaceLevelConfig(2)
    expect(items).toEqual([daily])
    await saveLevelWorkspaceLevelConfig(2, items)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/level-workspace/levelconfig/2')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/level-workspace/levelconfig/2', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([daily])
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the workspace summary through the local API', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        drafts: ['flower'],
        pixelConfigCount: 1,
        mainLevelCount: 2,
        paths: {
          rootDir: 'data/level-workspace',
          draftsDir: 'data/level-workspace/drafts',
          configDir: 'data/level-workspace/config',
          thumbnailDir: 'resource/thumbnail',
          pixelConfigPath: 'data/level-workspace/config/pixelconfig.json'
        }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getLevelWorkspaceSummary()).resolves.toMatchObject({
      drafts: ['flower'],
      pixelConfigCount: 1,
      mainLevelCount: 2
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/level-workspace/summary')
  })

  it('saves drafts through the workspace API', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ name: 'flower', map: mapGrid }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(saveLevelDraft('flower', { map: mapGrid, pixelConfig })).resolves.toMatchObject({
      name: 'flower',
      map: mapGrid
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/level-workspace/drafts/flower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map: mapGrid, pixelConfig })
    })
  })

  it('reads and deletes drafts through the workspace API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ name: 'flower', map: mapGrid }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(readLevelDraft('flower')).resolves.toMatchObject({ name: 'flower', map: mapGrid })
    await expect(deleteLevelDraft('flower')).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/level-workspace/drafts/flower')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/level-workspace/drafts/flower', {
      method: 'DELETE'
    })
  })

  it('reads and saves total configs through the workspace API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([legacyPixelConfig]))
      .mockResolvedValueOnce(jsonResponse({ ok: true, count: 1 }))
      .mockResolvedValueOnce(jsonResponse(pixelPalettes))
      .mockResolvedValueOnce(jsonResponse({ ok: true, count: 1 }))
      .mockResolvedValueOnce(jsonResponse([levelConfig]))
      .mockResolvedValueOnce(jsonResponse({ ok: true, count: 1, type: 1 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(readLevelWorkspacePixelConfig()).resolves.toEqual([
      {
        ...legacyPixelConfig,
        beadCount: countPixelConfigBeads(legacyPixelConfig.pixelMatrix),
        difficulty: 1,
        quality: 1,
        imageType: 1,
        albumId: null
      }
    ])
    await expect(saveLevelWorkspacePixelConfig([pixelConfig])).resolves.toEqual({ ok: true, count: 1 })
    await expect(readLevelWorkspacePixelPalettes()).resolves.toEqual(pixelPalettes)
    await expect(saveLevelWorkspacePixelPalettes(pixelPalettes)).resolves.toEqual({ ok: true, count: 1 })
    await expect(readLevelWorkspaceLevelConfig(1)).resolves.toEqual([levelConfig])
    await expect(saveLevelWorkspaceLevelConfig(1, [levelConfig])).resolves.toEqual({
      ok: true,
      count: 1,
      type: 1
    })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/level-workspace/pixelconfig')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/level-workspace/pixelconfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([pixelConfig])
    })
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/level-workspace/pixelpalettes')
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/level-workspace/pixelpalettes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pixelPalettes)
    })
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/level-workspace/levelconfig/1')
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/level-workspace/levelconfig/1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([levelConfig])
    })
  })

  it('encodes draft and thumbnail names in route segments', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, path: 'resource/thumbnail/a b.png' }))
    vi.stubGlobal('fetch', fetchMock)

    await saveLevelWorkspaceThumbnail('a b', 'data:image/png;base64,iVBORw0KGgo=')

    expect(fetchMock).toHaveBeenCalledWith('/api/level-workspace/thumbnails/a%20b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' })
    })
  })

  it('deletes thumbnails through the workspace API', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteLevelWorkspaceThumbnail('flower')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/level-workspace/thumbnails/flower', {
      method: 'DELETE'
    })
  })

  it('reads thumbnails through the workspace API', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([
      {
        name: 'flower',
        path: 'resource/thumbnail/flower.png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgo='
      }
    ]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(readLevelWorkspaceThumbnails()).resolves.toEqual([
      {
        name: 'flower',
        path: 'resource/thumbnail/flower.png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgo='
      }
    ])
    expect(fetchMock).toHaveBeenCalledWith('/api/level-workspace/thumbnails')
  })

  it('reads a thumbnail existence status through the workspace API', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ exists: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(readLevelWorkspaceThumbnailStatus('flower')).resolves.toEqual({ exists: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/level-workspace/thumbnails/flower')
  })

  it('throws API error messages for non-success responses', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'draft not found' }, 404))
    vi.stubGlobal('fetch', fetchMock)

    await expect(saveLevelDraft('missing', { map: mapGrid })).rejects.toThrow('draft not found')
  })

  it('submits the current level and pixel snapshot for review generation', async () => {
    const response = {
      ok: true as const,
      levelCount: 1,
      outputPath: 'output/main-level-review/index.html' as const,
      previewUrl: '/api/level-workspace/main-level-review-preview/index.html' as const,
      warnings: []
    }
    const fetchMock = vi.fn(async () => jsonResponse(response))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateMainLevelReview({
      levels: [levelConfig],
      pixelConfigs: [pixelConfig]
    })).resolves.toEqual(response)
    expect(fetchMock).toHaveBeenCalledWith('/api/level-workspace/main-level-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ levels: [levelConfig], pixelConfigs: [pixelConfig] })
    })
  })
})
