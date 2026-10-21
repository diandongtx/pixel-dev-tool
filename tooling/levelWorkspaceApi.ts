import { Buffer } from 'node:buffer'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { MainLevelReviewGenerateRequest } from '../src/types/mainLevelReview'
import type { ManagedLevelConfigItem } from '../src/types/levelConfig'
import type { PixelConfigFile } from '../src/types/pixelConfig'
import type { ThemeConfigFile } from '../src/types/themeConfig'
import {
  createLevelWorkspaceRepository,
  type LevelDraftRecord,
  type LevelWorkspaceRepository
} from './levelWorkspaceRepository'
import {
  createMainLevelReviewRepository,
  type MainLevelReviewRepository
} from './mainLevelReviewRepository'

type NextFunction = () => void

const API_PREFIX = '/api/level-workspace'
const REVIEW_PREVIEW_PREFIX = `${API_PREFIX}/main-level-review-preview/`

const sendJson = (response: ServerResponse, statusCode: number, value: unknown): void => {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(`${JSON.stringify(value, null, 2)}\n`)
}

const sendBytes = (
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  bytes: Uint8Array
): void => {
  response.statusCode = statusCode
  response.setHeader('Content-Type', contentType)
  response.setHeader('Cache-Control', 'no-store')
  response.end(bytes)
}

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const text = await readBody(request)
  return (text ? JSON.parse(text) : {}) as T
}

const decodeThumbnailDataUrl = (dataUrl: string): Uint8Array => {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/)
  if (!match) {
    throw new Error('thumbnail 必须是 PNG data URL')
  }

  return Buffer.from(match[1], 'base64')
}

export const createLevelWorkspaceApiHandler = (
  repository: LevelWorkspaceRepository,
  reviewRepository: MainLevelReviewRepository
) =>
  async (request: IncomingMessage, response: ServerResponse, next: NextFunction): Promise<void> => {
    const requestUrl = request.url ?? ''
    const rawPathname = requestUrl.split('?', 1)[0]

    if (!rawPathname.startsWith(API_PREFIX)) {
      next()
      return
    }

    try {
      if (request.method === 'GET' && rawPathname.startsWith(REVIEW_PREVIEW_PREFIX)) {
        const relativePath = decodeURIComponent(rawPathname.slice(REVIEW_PREVIEW_PREFIX.length))
        const file = await reviewRepository.readPreviewFile(relativePath)
        if (!file) {
          sendJson(response, 404, { error: 'review preview file not found' })
          return
        }

        sendBytes(response, 200, file.contentType, file.bytes)
        return
      }

      const pathname = decodeURIComponent(rawPathname)

      if (request.method === 'POST' && pathname === `${API_PREFIX}/main-level-review`) {
        const body = await readJsonBody<MainLevelReviewGenerateRequest>(request)
        sendJson(response, 200, await reviewRepository.generate(body))
        return
      }

      if (request.method === 'GET' && pathname === `${API_PREFIX}/summary`) {
        await repository.ensureWorkspace()
        const [drafts, pixelConfig, mainLevels] = await Promise.all([
          repository.listDrafts(),
          repository.readPixelConfig(),
          repository.readLevelConfig(1)
        ])

        sendJson(response, 200, {
          drafts,
          pixelConfigCount: pixelConfig.length,
          mainLevelCount: mainLevels.length,
          paths: repository.paths
        })
        return
      }

      const draftMatch = pathname.match(/^\/api\/level-workspace\/drafts\/([^/]+)$/)
      if (request.method === 'GET' && draftMatch) {
        const draft = await repository.readDraft(draftMatch[1])
        if (!draft) {
          sendJson(response, 404, { error: 'draft not found' })
          return
        }

        sendJson(response, 200, draft)
        return
      }

      if (request.method === 'POST' && draftMatch) {
        const body = await readJsonBody<Omit<LevelDraftRecord, 'name'> & { name?: string }>(request)
        const draft = await repository.saveDraft({
          ...body,
          name: draftMatch[1]
        })
        sendJson(response, 200, draft)
        return
      }

      if (request.method === 'DELETE' && draftMatch) {
        await repository.deleteDraft(draftMatch[1])
        sendJson(response, 200, { ok: true })
        return
      }

      if (request.method === 'GET' && pathname === `${API_PREFIX}/pixelconfig`) {
        sendJson(response, 200, await repository.readPixelConfig())
        return
      }

      if (request.method === 'POST' && pathname === `${API_PREFIX}/pixelconfig`) {
        const body = await readJsonBody<PixelConfigFile>(request)
        await repository.writePixelConfig(body)
        sendJson(response, 200, { ok: true, count: body.length })
        return
      }

      if (request.method === 'GET' && pathname === `${API_PREFIX}/themeconfig`) {
        sendJson(response, 200, await repository.readThemeConfig())
        return
      }

      if (request.method === 'POST' && pathname === `${API_PREFIX}/themeconfig`) {
        const body = await readJsonBody<ThemeConfigFile>(request)
        await repository.writeThemeConfig(body)
        sendJson(response, 200, { ok: true, count: body.length })
        return
      }

      if (request.method === 'GET' && pathname === `${API_PREFIX}/pixelpalettes`) {
        sendJson(response, 200, await repository.readPixelPalettes())
        return
      }

      if (request.method === 'POST' && pathname === `${API_PREFIX}/pixelpalettes`) {
        const body = await readJsonBody<Awaited<ReturnType<typeof repository.readPixelPalettes>>>(request)
        await repository.writePixelPalettes(body)
        sendJson(response, 200, { ok: true, count: body.items.length })
        return
      }

      const levelConfigMatch = pathname.match(/^\/api\/level-workspace\/levelconfig\/(\d+)$/)
      if (request.method === 'GET' && levelConfigMatch) {
        sendJson(response, 200, await repository.readLevelConfig(Number(levelConfigMatch[1])))
        return
      }

      if (request.method === 'POST' && levelConfigMatch) {
        const levelType = Number(levelConfigMatch[1])
        const body = await readJsonBody<ManagedLevelConfigItem[]>(request)
        await repository.writeLevelConfig(levelType, body)
        sendJson(response, 200, { ok: true, count: body.length, type: levelType })
        return
      }

      const thumbnailMatch = pathname.match(/^\/api\/level-workspace\/thumbnails\/([^/]+)$/)
      if (request.method === 'GET' && pathname === `${API_PREFIX}/thumbnails`) {
        sendJson(response, 200, await repository.listThumbnails())
        return
      }

      if (request.method === 'GET' && thumbnailMatch) {
        sendJson(response, 200, { exists: await repository.hasThumbnail(thumbnailMatch[1]) })
        return
      }

      if (request.method === 'DELETE' && thumbnailMatch) {
        await repository.deleteThumbnail(thumbnailMatch[1])
        sendJson(response, 200, { ok: true })
        return
      }

      if (request.method === 'POST' && thumbnailMatch) {
        const body = await readJsonBody<{ dataUrl: string }>(request)
        const savedPath = await repository.saveThumbnail(
          thumbnailMatch[1],
          decodeThumbnailDataUrl(body.dataUrl)
        )
        sendJson(response, 200, { ok: true, path: savedPath })
        return
      }

      sendJson(response, 404, { error: 'unknown workspace route' })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error'
      sendJson(response, 400, { error: message })
    }
  }

export const levelWorkspaceApiPlugin = (projectRoot: string): Plugin => ({
  name: 'pixeldevtool-level-workspace-api',
  configureServer(server) {
    const repository = createLevelWorkspaceRepository({ projectRoot })
    const reviewRepository = createMainLevelReviewRepository({ projectRoot })
    server.middlewares.use(createLevelWorkspaceApiHandler(repository, reviewRepository))
  }
})
