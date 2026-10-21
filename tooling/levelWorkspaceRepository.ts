import { t } from '../src/i18n'
import { Buffer } from 'node:buffer'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { GridData } from '../src/types/grid'
import type { LevelConfigItem, ManagedLevelConfigItem } from '../src/types/levelConfig'
import { buildLevelConfigFilename } from '../src/utils/levelConfigFilename'
import type { PixelPaletteFile } from '../src/types/pixelPalette'
import type { PixelConfigFile, PixelConfigItem } from '../src/types/pixelConfig'
import type { ThemeConfigFile } from '../src/types/themeConfig'
import { countPixelConfigBeads, isValidPixelConfigBeadCount } from '../src/utils/pixelConfigBeadCount'
import { DEFAULT_THEME_CONFIG } from '../src/utils/themeConfig'

export interface LevelDraftRecord {
  name: string
  map?: GridData
  point?: GridData
  pixelConfig?: PixelConfigItem
  levelConfig?: LevelConfigItem
  updatedAt?: string
}

export interface LevelWorkspacePaths {
  rootDir: string
  draftsDir: string
  configDir: string
  thumbnailDir: string
  pixelConfigPath: string
  themeConfigPath: string
}

export interface LevelWorkspaceThumbnailRecord {
  name: string
  path: string
  dataUrl: string
}

export interface LevelWorkspaceRepositoryOptions {
  projectRoot: string
  workspaceRoot?: string
  thumbnailRoot?: string
}

export interface LevelWorkspaceRepository {
  paths: LevelWorkspacePaths
  ensureWorkspace: () => Promise<void>
  listDrafts: () => Promise<string[]>
  saveDraft: (draft: LevelDraftRecord) => Promise<LevelDraftRecord>
  readDraft: (name: string) => Promise<LevelDraftRecord | null>
  deleteDraft: (name: string) => Promise<void>
  readPixelConfig: () => Promise<PixelConfigFile>
  writePixelConfig: (items: PixelConfigFile) => Promise<void>
  readThemeConfig: () => Promise<ThemeConfigFile>
  writeThemeConfig: (items: ThemeConfigFile) => Promise<void>
  readPixelPalettes: () => Promise<PixelPaletteFile>
  writePixelPalettes: (items: PixelPaletteFile) => Promise<void>
  readLevelConfig: (type: number) => Promise<ManagedLevelConfigItem[]>
  writeLevelConfig: (type: number, items: ManagedLevelConfigItem[]) => Promise<void>
  listThumbnails: () => Promise<LevelWorkspaceThumbnailRecord[]>
  hasThumbnail: (name: string) => Promise<boolean>
  saveThumbnail: (name: string, bytes: Uint8Array) => Promise<string>
  deleteThumbnail: (name: string) => Promise<void>
}

const DEFAULT_WORKSPACE_ROOT = 'data/level-workspace'
const DEFAULT_THUMBNAIL_ROOT = 'resource/thumbnail'
const INVALID_FILE_NAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
const MAX_CONFIG_BACKUPS = 50
let backupSequence = 0

const stringifyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
const stringifyCompactJson = (value: unknown): string => `${JSON.stringify(value)}\n`

const migratePixelConfigBeadCounts = (
  items: PixelConfigFile
): { items: PixelConfigFile; migratedCount: number } => {
  let migratedCount = 0
  const migratedItems = items.map((item) => {
    if (isValidPixelConfigBeadCount(item.beadCount)) return item

    migratedCount += 1
    return { ...item, beadCount: countPixelConfigBeads(item.pixelMatrix) }
  })

  return { items: migratedItems, migratedCount }
}

const normalizeName = (name: string): string => {
  const normalized = name.trim()
  const hasInvalidCharacter = [...normalized].some(
    (char) => INVALID_FILE_NAME_CHARS.has(char) || char.charCodeAt(0) < 32
  )

  if (!normalized || normalized === '.' || normalized === '..' || hasInvalidCharacter) {
    throw new Error(t("名称不能包含路径或非法字符"))
  }

  return normalized
}

const assertInside = (parent: string, child: string): string => {
  const relative = path.relative(parent, child)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return child
  }

  throw new Error(t("路径越界"))
}

const readJsonOrDefault = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return fallback
    }

    throw error
  }
}

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath)
    return true
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return false
    }

    throw error
  }
}

const createBackupStamp = (): string => {
  const now = new Date()
  backupSequence = (backupSequence + 1) % 10000
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')

  return [
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    pad(now.getMilliseconds(), 3),
    pad(backupSequence, 4)
  ].join('_')
}

export const createLevelWorkspaceRepository = ({
  projectRoot,
  workspaceRoot = DEFAULT_WORKSPACE_ROOT,
  thumbnailRoot = DEFAULT_THUMBNAIL_ROOT
}: LevelWorkspaceRepositoryOptions): LevelWorkspaceRepository => {
  const resolvedProjectRoot = path.resolve(projectRoot)
  const rootDir = assertInside(resolvedProjectRoot, path.resolve(resolvedProjectRoot, workspaceRoot))
  const draftsDir = path.join(rootDir, 'drafts')
  const configDir = path.join(rootDir, 'config')
  const backupDir = path.join(configDir, 'backups')
  const thumbnailDir = assertInside(resolvedProjectRoot, path.resolve(resolvedProjectRoot, thumbnailRoot))
  const pixelConfigPath = path.join(configDir, 'pixelconfig.json')
  const themeConfigPath = path.join(configDir, 'themeconfig.json')
  const pixelPalettePath = path.join(configDir, 'pixelpalettes.json')
  const paths: LevelWorkspacePaths = {
    rootDir,
    draftsDir,
    configDir,
    thumbnailDir,
    pixelConfigPath,
    themeConfigPath
  }
  let pixelConfigOperation: Promise<void> = Promise.resolve()

  const queuePixelConfigOperation = <T>(operation: () => Promise<T>): Promise<T> => {
    const nextOperation = pixelConfigOperation.then(operation, operation)
    pixelConfigOperation = nextOperation.then(
      () => undefined,
      () => undefined
    )
    return nextOperation
  }

  const ensureWorkspace = async (): Promise<void> => {
    await Promise.all([
      mkdir(draftsDir, { recursive: true }),
      mkdir(configDir, { recursive: true }),
      mkdir(thumbnailDir, { recursive: true })
    ])
  }

  const getDraftDir = (name: string): string => {
    const draftName = normalizeName(name)
    return assertInside(draftsDir, path.join(draftsDir, draftName))
  }

  const getLevelConfigPath = (type: number): string => {
    if (!Number.isInteger(type) || type <= 0) {
      throw new Error(t("levelconfig 类型必须是正整数"))
    }

    return path.join(configDir, buildLevelConfigFilename(type))
  }

  const getLegacyLevelConfigPath = (type: number): string | null => (
    type === 1 ? path.join(configDir, 'levelconfig_1.json') : null
  )

  const getLevelConfigBackupPrefix = (type: number): string =>
    buildLevelConfigFilename(type).replace(/\.json$/, '')

  const readLevelConfig = async (type: number): Promise<ManagedLevelConfigItem[]> => {
    const filePath = getLevelConfigPath(type)
    if (await fileExists(filePath)) {
      return readJsonOrDefault<ManagedLevelConfigItem[]>(filePath, [])
    }

    const legacyFilePath = getLegacyLevelConfigPath(type)
    if (legacyFilePath && await fileExists(legacyFilePath)) {
      return readJsonOrDefault<ManagedLevelConfigItem[]>(legacyFilePath, [])
    }

    return []
  }

  const getThumbnailPath = (name: string): string => {
    const thumbnailName = normalizeName(name)
    return assertInside(thumbnailDir, path.join(thumbnailDir, `${thumbnailName}.png`))
  }

  const pruneConfigBackups = async (backupPrefix: string): Promise<void> => {
    const entries = await readdir(backupDir, { withFileTypes: true })
    const backupFiles = entries
      .filter((entry) =>
        entry.isFile() &&
        entry.name.startsWith(`${backupPrefix}_`) &&
        entry.name.toLowerCase().endsWith('.json')
      )
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))

    const extraCount = backupFiles.length - MAX_CONFIG_BACKUPS
    if (extraCount <= 0) return

    await Promise.all(
      backupFiles.slice(0, extraCount).map((fileName) =>
        rm(assertInside(backupDir, path.join(backupDir, fileName)), { force: true })
      )
    )
  }

  const backupExistingConfig = async (filePath: string, backupPrefix: string): Promise<void> => {
    if (!await fileExists(filePath)) return

    await mkdir(backupDir, { recursive: true })
    const backupPath = assertInside(
      backupDir,
      path.join(backupDir, `${backupPrefix}_${createBackupStamp()}.json`)
    )
    await copyFile(filePath, backupPath)
    await pruneConfigBackups(backupPrefix)
  }

  const writeJson = async (
    filePath: string,
    value: unknown,
    backupPrefix?: string,
    stringify = stringifyJson
  ): Promise<void> => {
    await ensureWorkspace()
    if (backupPrefix) {
      await backupExistingConfig(filePath, backupPrefix)
    }
    await writeFile(filePath, stringify(value), 'utf8')
  }

  const readPixelConfig = (): Promise<PixelConfigFile> => queuePixelConfigOperation(async () => {
    const pixelConfig = await readJsonOrDefault<PixelConfigFile>(pixelConfigPath, [])
    const { items, migratedCount } = migratePixelConfigBeadCounts(pixelConfig)
    if (migratedCount > 0) {
      await writeJson(pixelConfigPath, items, 'pixelconfig', stringifyCompactJson)
    }
    return items
  })

  const writePixelConfig = (items: PixelConfigFile): Promise<void> =>
    queuePixelConfigOperation(() => writeJson(pixelConfigPath, items, 'pixelconfig', stringifyCompactJson))

  return {
    paths,
    ensureWorkspace,
    listDrafts: async () => {
      await ensureWorkspace()
      const entries = await readdir(draftsDir, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right))
    },
    saveDraft: async (draft) => {
      const name = normalizeName(draft.name)
      const draftDir = getDraftDir(name)
      await ensureWorkspace()
      await mkdir(draftDir, { recursive: true })

      const nextDraft: LevelDraftRecord = {
        ...draft,
        name,
        updatedAt: draft.updatedAt ?? new Date().toISOString()
      }

      if (nextDraft.map) {
        await writeFile(path.join(draftDir, `${name}_map.json`), stringifyJson(nextDraft.map), 'utf8')
      }
      if (nextDraft.point) {
        await writeFile(path.join(draftDir, `${name}_point.json`), stringifyJson(nextDraft.point), 'utf8')
      }

      await writeFile(path.join(draftDir, 'draft.json'), stringifyJson(nextDraft), 'utf8')
      return nextDraft
    },
    readDraft: async (name) => {
      const draftDir = getDraftDir(name)
      return readJsonOrDefault<LevelDraftRecord | null>(path.join(draftDir, 'draft.json'), null)
    },
    deleteDraft: async (name) => {
      await rm(getDraftDir(name), { recursive: true, force: true })
    },
    readPixelConfig,
    writePixelConfig,
    readThemeConfig: () => readJsonOrDefault<ThemeConfigFile>(themeConfigPath, DEFAULT_THEME_CONFIG),
    writeThemeConfig: (items) => writeJson(themeConfigPath, items, 'themeconfig'),
    readPixelPalettes: () => readJsonOrDefault<PixelPaletteFile>(pixelPalettePath, { version: 1, items: [] }),
    writePixelPalettes: (items) => writeJson(pixelPalettePath, items, 'pixelpalettes'),
    readLevelConfig,
    writeLevelConfig: (type, items) => writeJson(
      getLevelConfigPath(type),
      items,
      getLevelConfigBackupPrefix(type)
    ),
    listThumbnails: async () => {
      await ensureWorkspace()
      const entries = await readdir(thumbnailDir, { withFileTypes: true })
      const pngEntries = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
        .sort((left, right) => left.name.localeCompare(right.name))

      return Promise.all(pngEntries.map(async (entry) => {
        const thumbnailPath = assertInside(thumbnailDir, path.join(thumbnailDir, entry.name))
        const bytes = await readFile(thumbnailPath)

        return {
          name: entry.name.replace(/\.png$/i, ''),
          path: thumbnailPath,
          dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
        }
      }))
    },
    hasThumbnail: async (name) => fileExists(getThumbnailPath(name)),
    saveThumbnail: async (name, bytes) => {
      await ensureWorkspace()
      const thumbnailPath = getThumbnailPath(name)
      await writeFile(thumbnailPath, bytes)
      return thumbnailPath
    },
    deleteThumbnail: async (name) => {
      await rm(getThumbnailPath(name), { force: true })
    }
  }
}
