// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { countPixelConfigBeads } from '../../src/utils/pixelConfigBeadCount'
import { createLevelWorkspaceApiHandler } from '../levelWorkspaceApi'
import { createLevelWorkspaceRepository } from '../levelWorkspaceRepository'
import { createMainLevelReviewRepository } from '../mainLevelReviewRepository'

const mapGrid = {
  width: 1,
  height: 1,
  colorIndices: [[0]],
  colors: [{ r: 1, g: 2, b: 3, a: 255 }],
  fileName: 'flower'
}

const pixelConfig = {
  id: 1000,
  name: 'flower',
  gridWidthHeight: [1, 1],
  pixelWidthHeight: [1, 1],
  localPixelResource: ['bakery0'],
  pixelMatrix: [[0]],
  initPixel: [[0]],
  beadCount: countPixelConfigBeads([[0]])
}

const pixelPalettes = {
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

const levelConfig = {
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

class TestResponse {
  statusCode = 200
  headers = new Map<string, string>()
  body: string | Uint8Array = ''

  setHeader(name: string, value: string) {
    this.headers.set(name, value)
  }

  end(body: string | Uint8Array = '') {
    this.body = body
  }
}

const createRequest = (method: string, url: string, body?: unknown): Readable & {
  method: string
  url: string
} => {
  const requestBody = body === undefined ? '' : JSON.stringify(body)
  const request = Readable.from([requestBody]) as Readable & { method: string; url: string }
  request.method = method
  request.url = url
  return request
}

describe('level workspace API handler', () => {
  let projectRoot: string | null = null

  afterEach(async () => {
    if (projectRoot) {
      await rm(projectRoot, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100
      })
      projectRoot = null
    }
  })

  const createHandler = async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'pixeldevtool-api-'))
    const repository = createLevelWorkspaceRepository({ projectRoot })
    const reviewRepository = createMainLevelReviewRepository({ projectRoot })
    return {
      handler: createLevelWorkspaceApiHandler(repository, reviewRepository),
      repository,
      reviewRepository
    }
  }

  it('returns workspace summary and saves named drafts through JSON routes', async () => {
    const { handler } = await createHandler()
    const firstSummaryResponse = new TestResponse()

    await handler(createRequest('GET', '/api/level-workspace/summary'), firstSummaryResponse, vi.fn())

    expect(firstSummaryResponse.statusCode).toBe(200)
    expect(JSON.parse(String(firstSummaryResponse.body))).toMatchObject({
      drafts: [],
      pixelConfigCount: 0,
      mainLevelCount: 0
    })

    const saveResponse = new TestResponse()
    await handler(
      createRequest('POST', '/api/level-workspace/drafts/flower', {
        map: mapGrid
      }),
      saveResponse,
      vi.fn()
    )

    expect(saveResponse.statusCode).toBe(200)
    expect(JSON.parse(String(saveResponse.body))).toMatchObject({ name: 'flower' })

    const secondSummaryResponse = new TestResponse()
    await handler(createRequest('GET', '/api/level-workspace/summary'), secondSummaryResponse, vi.fn())

    expect(JSON.parse(String(secondSummaryResponse.body)).drafts).toEqual(['flower'])
  })

  it('reads and deletes saved drafts through JSON routes', async () => {
    const { handler } = await createHandler()

    await handler(
      createRequest('POST', '/api/level-workspace/drafts/flower', { map: mapGrid }),
      new TestResponse(),
      vi.fn()
    )

    const readResponse = new TestResponse()
    await handler(createRequest('GET', '/api/level-workspace/drafts/flower'), readResponse, vi.fn())

    expect(readResponse.statusCode).toBe(200)
    expect(JSON.parse(String(readResponse.body))).toMatchObject({ name: 'flower', map: mapGrid })

    const deleteResponse = new TestResponse()
    await handler(createRequest('DELETE', '/api/level-workspace/drafts/flower'), deleteResponse, vi.fn())

    expect(deleteResponse.statusCode).toBe(200)
    expect(JSON.parse(String(deleteResponse.body))).toEqual({ ok: true })

    const missingResponse = new TestResponse()
    await handler(createRequest('GET', '/api/level-workspace/drafts/flower'), missingResponse, vi.fn())

    expect(missingResponse.statusCode).toBe(404)
    expect(JSON.parse(String(missingResponse.body))).toEqual({ error: 'draft not found' })
  })

  it('reads saved total configs through JSON routes', async () => {
    const { handler } = await createHandler()

    await handler(
      createRequest('POST', '/api/level-workspace/pixelconfig', [pixelConfig]),
      new TestResponse(),
      vi.fn()
    )
    await handler(
      createRequest('POST', '/api/level-workspace/pixelpalettes', pixelPalettes),
      new TestResponse(),
      vi.fn()
    )
    await handler(
      createRequest('POST', '/api/level-workspace/levelconfig/1', [levelConfig]),
      new TestResponse(),
      vi.fn()
    )

    const pixelConfigResponse = new TestResponse()
    await handler(createRequest('GET', '/api/level-workspace/pixelconfig'), pixelConfigResponse, vi.fn())

    expect(pixelConfigResponse.statusCode).toBe(200)
    expect(JSON.parse(String(pixelConfigResponse.body))).toEqual([pixelConfig])

    const pixelPaletteResponse = new TestResponse()
    await handler(createRequest('GET', '/api/level-workspace/pixelpalettes'), pixelPaletteResponse, vi.fn())

    expect(pixelPaletteResponse.statusCode).toBe(200)
    expect(JSON.parse(String(pixelPaletteResponse.body))).toEqual(pixelPalettes)

    const levelConfigResponse = new TestResponse()
    await handler(createRequest('GET', '/api/level-workspace/levelconfig/1'), levelConfigResponse, vi.fn())

    expect(levelConfigResponse.statusCode).toBe(200)
    expect(JSON.parse(String(levelConfigResponse.body))).toEqual([levelConfig])
  })

  it('migrates legacy pixelconfig bead counts through the existing GET route', async () => {
    const { handler, repository } = await createHandler()
    const legacyPixelConfig = {
      ...pixelConfig,
      pixelMatrix: [[0, -1, 2]]
    }
    delete legacyPixelConfig.beadCount

    await repository.ensureWorkspace()
    await writeFile(repository.paths.pixelConfigPath, `${JSON.stringify([legacyPixelConfig])}\n`, 'utf8')

    const response = new TestResponse()
    await handler(createRequest('GET', '/api/level-workspace/pixelconfig'), response, vi.fn())

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(String(response.body))).toEqual([{ ...legacyPixelConfig, beadCount: 2 }])
  })

  it('deletes saved thumbnails through JSON routes', async () => {
    const { handler } = await createHandler()

    await handler(
      createRequest('POST', '/api/level-workspace/thumbnails/flower', {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo='
      }),
      new TestResponse(),
      vi.fn()
    )

    const deleteResponse = new TestResponse()
    await handler(createRequest('DELETE', '/api/level-workspace/thumbnails/flower'), deleteResponse, vi.fn())

    expect(deleteResponse.statusCode).toBe(200)
    expect(JSON.parse(String(deleteResponse.body))).toEqual({ ok: true })
  })

  it('lists saved thumbnails through JSON routes', async () => {
    const { handler } = await createHandler()

    await handler(
      createRequest('POST', '/api/level-workspace/thumbnails/flower', {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo='
      }),
      new TestResponse(),
      vi.fn()
    )

    const listResponse = new TestResponse()
    await handler(createRequest('GET', '/api/level-workspace/thumbnails'), listResponse, vi.fn())

    expect(listResponse.statusCode).toBe(200)
    expect(JSON.parse(String(listResponse.body))).toEqual([
      {
        name: 'flower',
        path: expect.stringContaining('flower.png'),
        dataUrl: 'data:image/png;base64,iVBORw0KGgo='
      }
    ])
  })

  it('checks if a named thumbnail exists through JSON routes', async () => {
    const { handler } = await createHandler()

    const missingResponse = new TestResponse()
    await handler(createRequest('GET', '/api/level-workspace/thumbnails/flower'), missingResponse, vi.fn())

    expect(missingResponse.statusCode).toBe(200)
    expect(JSON.parse(String(missingResponse.body))).toEqual({ exists: false })

    await handler(
      createRequest('POST', '/api/level-workspace/thumbnails/flower', {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo='
      }),
      new TestResponse(),
      vi.fn()
    )

    const existingResponse = new TestResponse()
    await handler(createRequest('GET', '/api/level-workspace/thumbnails/flower'), existingResponse, vi.fn())

    expect(existingResponse.statusCode).toBe(200)
    expect(JSON.parse(String(existingResponse.body))).toEqual({ exists: true })
  })

  it('passes non workspace routes to the next middleware', async () => {
    const { handler } = await createHandler()
    const next = vi.fn()

    await handler(createRequest('GET', '/src/App.tsx'), new TestResponse(), next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('generates and serves the offline main level review package without caching', async () => {
    const { handler } = await createHandler()
    await mkdir(path.join(projectRoot!, 'resource', 'grid'), { recursive: true })
    await writeFile(path.join(projectRoot!, 'resource', 'grid', 'bakery0_2.png'), Buffer.from([1]))
    await writeFile(path.join(projectRoot!, 'resource', 'grid', 'bakery0_3.png'), Buffer.from([2]))

    const generateResponse = new TestResponse()
    await handler(
      createRequest('POST', '/api/level-workspace/main-level-review', {
        levels: [levelConfig],
        pixelConfigs: [pixelConfig]
      }),
      generateResponse,
      vi.fn()
    )

    expect(generateResponse.statusCode).toBe(200)
    expect(JSON.parse(String(generateResponse.body))).toMatchObject({
      ok: true,
      levelCount: 1,
      outputPath: 'output/main-level-review/index.html',
      previewUrl: '/api/level-workspace/main-level-review-preview/index.html'
    })

    const htmlResponse = new TestResponse()
    await handler(
      createRequest('GET', '/api/level-workspace/main-level-review-preview/index.html'),
      htmlResponse,
      vi.fn()
    )
    expect(htmlResponse.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(htmlResponse.headers.get('Cache-Control')).toBe('no-store')
    expect(String(htmlResponse.body)).toContain('Main level review')

    const pngResponse = new TestResponse()
    await handler(
      createRequest(
        'GET',
        '/api/level-workspace/main-level-review-preview/assets/beads/bakery0_2.png'
      ),
      pngResponse,
      vi.fn()
    )
    expect(pngResponse.headers.get('Content-Type')).toBe('image/png')
    expect(pngResponse.headers.get('Cache-Control')).toBe('no-store')
    expect(Buffer.from(pngResponse.body as Uint8Array)).toEqual(Buffer.from([1]))
  })

  it.each([
    {},
    { levels: [], pixelConfigs: null }
  ])('rejects invalid generation body %#', async (body) => {
    const { handler } = await createHandler()
    const response = new TestResponse()

    await handler(
      createRequest('POST', '/api/level-workspace/main-level-review', body),
      response,
      vi.fn()
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(String(response.body))).toEqual({ error: expect.any(String) })
  })

  it('returns repository generation errors as API errors', async () => {
    const { handler } = await createHandler()
    const response = new TestResponse()

    await handler(
      createRequest('POST', '/api/level-workspace/main-level-review', {
        levels: [levelConfig],
        pixelConfigs: [pixelConfig]
      }),
      response,
      vi.fn()
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(String(response.body))).toEqual({
      error: 'Bead resource directory is unavailable: resource/grid'
    })
  })

  it.each([
    '/api/level-workspace/main-level-review-preview/index.html',
    '/api/level-workspace/main-level-review-preview/assets/beads/missing.png'
  ])('returns 404 for missing safe preview file %s', async (url) => {
    const { handler } = await createHandler()
    const response = new TestResponse()

    await handler(createRequest('GET', url), response, vi.fn())

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(String(response.body))).toEqual({
      error: 'review preview file not found'
    })
  })

  it.each([
    '/api/level-workspace/main-level-review-preview/%2e%2e%2foutside.png',
    '/api/level-workspace/main-level-review-preview/assets/beads/blue%2fhidden.png',
    '/api/level-workspace/main-level-review-preview/assets/beads/blue%5chidden.png',
    '/api/level-workspace/main-level-review-preview/assets/beads/%E0%A4%A'
  ])('rejects unsafe or malformed encoded preview path %s', async (url) => {
    const { handler } = await createHandler()
    const response = new TestResponse()

    await handler(createRequest('GET', url), response, vi.fn())

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(String(response.body))).toEqual({ error: expect.any(String) })
  })

  it('matches the preview route prefix before decoding encoded separators', async () => {
    const { handler } = await createHandler()
    const response = new TestResponse()

    await handler(
      createRequest(
        'GET',
        '/api/level-workspace/main-level-review-preview%2fassets%2fbeads%2fbakery0_2.png'
      ),
      response,
      vi.fn()
    )

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(String(response.body))).toEqual({ error: 'unknown workspace route' })
  })
})
