import type { GridData } from '../types/grid'
import type { LevelConfigFile, LevelConfigItem, ManagedLevelConfigItem } from '../types/levelConfig'
import type {
  MainLevelReviewGenerateRequest,
  MainLevelReviewGenerateResponse
} from '../types/mainLevelReview'
import type { PixelPaletteFile } from '../types/pixelPalette'
import type { PixelConfigFile, PixelConfigItem } from '../types/pixelConfig'
import type { ThemeConfigFile } from '../types/themeConfig'
import { normalizeDailyLevelConfigItems, normalizeLevelConfigItems, normalizePixelConfigItems } from './configIO'

export interface LevelWorkspacePaths {
  rootDir: string
  draftsDir: string
  configDir: string
  thumbnailDir: string
  pixelConfigPath: string
  themeConfigPath: string
}

export interface LevelWorkspaceSummary {
  drafts: string[]
  pixelConfigCount: number
  mainLevelCount: number
  paths: LevelWorkspacePaths
}

export interface LevelDraftRecord {
  name: string
  map?: GridData
  point?: GridData
  pixelConfig?: PixelConfigItem
  levelConfig?: LevelConfigItem
  updatedAt?: string
}

export interface LevelWorkspaceThumbnailRecord {
  name: string
  path: string
  dataUrl: string
}

export type LevelDraftPayload = Omit<LevelDraftRecord, 'name' | 'updatedAt'> & {
  updatedAt?: string
}

interface JsonRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
}

const API_PREFIX = '/api/level-workspace'

const readResponseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

const requestJson = async <T>(url: string, options: JsonRequestOptions = {}): Promise<T> => {
  const init =
    options.body === undefined
      ? options.method
        ? { method: options.method }
        : undefined
      : {
          method: options.method ?? 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options.body)
        }

  const response = init === undefined ? await fetch(url) : await fetch(url, init)
  const json = await readResponseJson(response)

  if (!response.ok) {
    const message =
      json && typeof json === 'object' && 'error' in json && typeof json.error === 'string'
        ? json.error
        : `workspace request failed: ${response.status}`
    throw new Error(message)
  }

  return json as T
}

const routeName = (name: string): string => encodeURIComponent(name)

export const getLevelWorkspaceSummary = (): Promise<LevelWorkspaceSummary> =>
  requestJson<LevelWorkspaceSummary>(`${API_PREFIX}/summary`)

export const readLevelDraft = (name: string): Promise<LevelDraftRecord> =>
  requestJson<LevelDraftRecord>(`${API_PREFIX}/drafts/${routeName(name)}`)

export const saveLevelDraft = (
  name: string,
  draft: LevelDraftPayload
): Promise<LevelDraftRecord> =>
  requestJson<LevelDraftRecord>(`${API_PREFIX}/drafts/${routeName(name)}`, {
    method: 'POST',
    body: draft
  })

export const deleteLevelDraft = (name: string): Promise<{ ok: true }> =>
  requestJson<{ ok: true }>(`${API_PREFIX}/drafts/${routeName(name)}`, {
    method: 'DELETE'
  })

export const readLevelWorkspacePixelConfig = async (): Promise<PixelConfigFile> => {
  const raw = await requestJson<unknown>(`${API_PREFIX}/pixelconfig`)
  // 读取时归一化：旧数据自动补齐 v0.5 新字段默认值，保证内存中即为新结构，保存路径无需再校验。
  return normalizePixelConfigItems(raw)
}

export const saveLevelWorkspacePixelConfig = (
  items: PixelConfigFile
): Promise<{ ok: true; count: number }> =>
  requestJson<{ ok: true; count: number }>(`${API_PREFIX}/pixelconfig`, {
    method: 'POST',
    body: items
  })

export const readLevelWorkspaceThemeConfig = (): Promise<ThemeConfigFile> =>
  requestJson<ThemeConfigFile>(`${API_PREFIX}/themeconfig`)

export const saveLevelWorkspaceThemeConfig = (
  items: ThemeConfigFile
): Promise<{ ok: true; count: number }> =>
  requestJson<{ ok: true; count: number }>(`${API_PREFIX}/themeconfig`, {
    method: 'POST',
    body: items
  })

export const readLevelWorkspacePixelPalettes = (): Promise<PixelPaletteFile> =>
  requestJson<PixelPaletteFile>(`${API_PREFIX}/pixelpalettes`)

export const saveLevelWorkspacePixelPalettes = (
  palettes: PixelPaletteFile
): Promise<{ ok: true; count: number }> =>
  requestJson<{ ok: true; count: number }>(`${API_PREFIX}/pixelpalettes`, {
    method: 'POST',
    body: palettes
  })

export function readLevelWorkspaceLevelConfig(type: 1): Promise<LevelConfigFile>
export function readLevelWorkspaceLevelConfig(type: number): Promise<ManagedLevelConfigItem[]>
export async function readLevelWorkspaceLevelConfig(type: number): Promise<ManagedLevelConfigItem[]> {
  const raw = await requestJson<unknown>(`${API_PREFIX}/levelconfig/${type}`)
  // 读取时归一化：levelconfig 结构本身未变，主要保证难度落在 1-5、字段稳定。
  return type === 2 ? normalizeDailyLevelConfigItems(raw) : normalizeLevelConfigItems(raw)
}

export const saveLevelWorkspaceLevelConfig = (
  type: number,
  items: ManagedLevelConfigItem[]
): Promise<{ ok: true; count: number; type: number }> =>
  requestJson<{ ok: true; count: number; type: number }>(`${API_PREFIX}/levelconfig/${type}`, {
    method: 'POST',
    body: items
  })

export const saveLevelWorkspaceThumbnail = (
  name: string,
  dataUrl: string
): Promise<{ ok: true; path: string }> =>
  requestJson<{ ok: true; path: string }>(`${API_PREFIX}/thumbnails/${routeName(name)}`, {
    method: 'POST',
    body: { dataUrl }
  })

export const readLevelWorkspaceThumbnails = (): Promise<LevelWorkspaceThumbnailRecord[]> =>
  requestJson<LevelWorkspaceThumbnailRecord[]>(`${API_PREFIX}/thumbnails`)

export const readLevelWorkspaceThumbnailStatus = (name: string): Promise<{ exists: boolean }> =>
  requestJson<{ exists: boolean }>(`${API_PREFIX}/thumbnails/${routeName(name)}`)

export const deleteLevelWorkspaceThumbnail = (name: string): Promise<{ ok: true }> =>
  requestJson<{ ok: true }>(`${API_PREFIX}/thumbnails/${routeName(name)}`, {
    method: 'DELETE'
  })

export const generateMainLevelReview = (
  payload: MainLevelReviewGenerateRequest
): Promise<MainLevelReviewGenerateResponse> =>
  requestJson<MainLevelReviewGenerateResponse>(`${API_PREFIX}/main-level-review`, {
    method: 'POST',
    body: payload
  })
