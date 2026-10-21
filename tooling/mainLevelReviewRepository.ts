import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'
import type {
  MainLevelReviewGenerateRequest,
  MainLevelReviewGenerateResponse
} from '../src/types/mainLevelReview'
import {
  buildMainLevelReviewRecords,
  renderMainLevelReviewHtml
} from './mainLevelReviewDocument'

export interface MainLevelReviewPreviewFile {
  bytes: Buffer
  contentType: 'text/html; charset=utf-8' | 'image/png'
}

export interface MainLevelReviewRepository {
  generate: (request: MainLevelReviewGenerateRequest) => Promise<MainLevelReviewGenerateResponse>
  readPreviewFile: (relativePath: string) => Promise<MainLevelReviewPreviewFile | null>
}

interface Options {
  projectRoot?: string
  now?: () => Date
  renamePath?: typeof rename
  renameRetryDelay?: (milliseconds: number) => Promise<void>
}

const RENAME_RETRY_ATTEMPTS = 5
const RENAME_RETRY_BASE_DELAY_MS = 20

const waitForRenameRetry = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const isMissingFileError = (error: unknown): boolean => Boolean(
  error
  && typeof error === 'object'
  && 'code' in error
  && (error as { code?: unknown }).code === 'ENOENT'
)

const isWindowsRenameContentionError = (error: unknown): boolean => Boolean(
  error
  && typeof error === 'object'
  && 'code' in error
  && ['EPERM', 'EACCES'].includes(String((error as { code?: unknown }).code))
)

const exists = async (target: string): Promise<boolean> => {
  try {
    await stat(target)
    return true
  } catch (error: unknown) {
    if (isMissingFileError(error)) return false
    throw error
  }
}

const removeBestEffort = async (target: string): Promise<void> => {
  try {
    await rm(target, { recursive: true, force: true })
  } catch {
    // Cleanup must not replace the generation or rollback error.
  }
}

const assertInside = (parent: string, child: string): string => {
  const relative = path.relative(parent, child)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return child
  }
  throw new Error('阅览资源路径越界')
}

const assertSafePreviewPath = (relativePath: string): void => {
  const hasControlCharacter = [...relativePath].some((character) => character.charCodeAt(0) < 32)
  const hasDotSegment = relativePath.split('/').some((segment) => segment === '.' || segment === '..')
  const hasEncodedOctet = /%[0-9a-f]{2}/i.test(relativePath)
  const hasBackslash = relativePath.includes('\\')
  const isAbsolute = path.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
    || path.posix.isAbsolute(relativePath)
  const hasNestedBeadPath = relativePath.startsWith('assets/beads/')
    && relativePath.slice('assets/beads/'.length).includes('/')

  if (
    hasControlCharacter
    || hasDotSegment
    || hasEncodedOctet
    || hasBackslash
    || isAbsolute
    || hasNestedBeadPath
  ) {
    throw new Error('阅览资源路径越界')
  }
}

export const createMainLevelReviewRepository = ({
  projectRoot = process.cwd(),
  now = () => new Date(),
  renamePath = rename,
  renameRetryDelay = waitForRenameRetry
}: Options = {}): MainLevelReviewRepository => {
  const root = path.resolve(projectRoot)
  const outputParent = assertInside(root, path.join(root, 'output'))
  const outputDir = assertInside(outputParent, path.join(outputParent, 'main-level-review'))
  const sourceBeads = assertInside(root, path.join(root, 'resource', 'grid'))
  let generationOperation: Promise<void> = Promise.resolve()

  const renameLeafWithRetry = async (from: string, to: string): Promise<void> => {
    for (let attempt = 1; attempt <= RENAME_RETRY_ATTEMPTS; attempt += 1) {
      try {
        await renamePath(from, to)
        return
      } catch (error: unknown) {
        if (!isWindowsRenameContentionError(error) || attempt === RENAME_RETRY_ATTEMPTS) throw error
        await renameRetryDelay(attempt * RENAME_RETRY_BASE_DELAY_MS)
      }
    }
  }

  const promoteLeaves = async (
    temporaryDir: string,
    rollbackDir: string,
    token: string
  ): Promise<void> => {
    const liveIndex = path.join(outputDir, 'index.html')
    const liveAssets = path.join(outputDir, 'assets')
    const liveBeads = path.join(liveAssets, 'beads')
    const stagedIndex = path.join(temporaryDir, 'index.html')
    const stagedBeads = path.join(temporaryDir, 'assets', 'beads')
    const indexBackup = path.join(outputDir, `index.html.rollback-${token}`)
    const beadsBackup = path.join(liveAssets, `beads.rollback-${token}`)
    const previousRoot = await exists(rollbackDir)
      ? rollbackDir
      : await exists(outputDir) ? outputDir : null
    let previousIndex: string | null = null
    let previousBeads: string | null = null
    let promotedIndex = false
    let promotedBeads = false

    try {
      await mkdir(liveAssets, { recursive: true })
      if (previousRoot === outputDir) {
        if (await exists(liveIndex)) {
          await renameLeafWithRetry(liveIndex, indexBackup)
          previousIndex = indexBackup
        }
        if (await exists(liveBeads)) {
          await renameLeafWithRetry(liveBeads, beadsBackup)
          previousBeads = beadsBackup
        }
      } else if (previousRoot) {
        const rollbackIndex = path.join(previousRoot, 'index.html')
        const rollbackBeads = path.join(previousRoot, 'assets', 'beads')
        previousIndex = await exists(rollbackIndex) ? rollbackIndex : null
        previousBeads = await exists(rollbackBeads) ? rollbackBeads : null
      }

      await renameLeafWithRetry(stagedIndex, liveIndex)
      promotedIndex = true
      await renameLeafWithRetry(stagedBeads, liveBeads)
      promotedBeads = true

      await removeBestEffort(indexBackup)
      await removeBestEffort(beadsBackup)
      await removeBestEffort(rollbackDir)
    } catch (fallbackError: unknown) {
      if (promotedBeads) await removeBestEffort(liveBeads)
      if (promotedIndex) await removeBestEffort(liveIndex)

      const restorationErrors: unknown[] = []
      await mkdir(liveAssets, { recursive: true })
      if (previousBeads && await exists(previousBeads)) {
        try {
          await renameLeafWithRetry(previousBeads, liveBeads)
        } catch (error: unknown) {
          restorationErrors.push(error)
        }
      }
      if (previousIndex && await exists(previousIndex)) {
        try {
          await renameLeafWithRetry(previousIndex, liveIndex)
        } catch (error: unknown) {
          restorationErrors.push(error)
        }
      }

      if (restorationErrors.length > 0) {
        throw new AggregateError(
          [fallbackError, ...restorationErrors],
          'Windows 阅览目录替换失败，且上一版目录恢复失败'
        )
      }

      await removeBestEffort(indexBackup)
      await removeBestEffort(beadsBackup)
      await removeBestEffort(rollbackDir)
      if (!previousRoot) await removeBestEffort(outputDir)
      throw fallbackError
    }
  }

  const generateNow = async (
    request: MainLevelReviewGenerateRequest
  ): Promise<MainLevelReviewGenerateResponse> => {
    if (!request || !Array.isArray(request.levels)) {
      throw new Error('关卡配置 levels 必须是数组')
    }
    if (!Array.isArray(request.pixelConfigs)) {
      throw new Error('像素图配置 pixelConfigs 必须是数组')
    }

    const sourceStat = await stat(sourceBeads).catch(() => null)
    if (!sourceStat?.isDirectory()) {
      throw new Error('豆子资源目录不可用：resource/grid')
    }

    const sourceEntries = await readdir(sourceBeads, { withFileTypes: true })
    const availableFiles = new Set(
      sourceEntries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
        .map((entry) => entry.name)
    )
    const built = buildMainLevelReviewRecords(request, availableFiles)
    const html = renderMainLevelReviewHtml(built.records, now().toISOString())
    const token = randomUUID()
    const temporaryDir = assertInside(
      outputParent,
      path.join(outputParent, `main-level-review.tmp-${token}`)
    )
    const rollbackDir = assertInside(
      outputParent,
      path.join(outputParent, `main-level-review.rollback-${token}`)
    )
    let previousMoved = false

    await mkdir(outputParent, { recursive: true })
    await removeBestEffort(temporaryDir)
    await removeBestEffort(rollbackDir)

    try {
      await mkdir(path.join(temporaryDir, 'assets'), { recursive: true })
      await writeFile(path.join(temporaryDir, 'index.html'), html, 'utf8')
      await cp(sourceBeads, path.join(temporaryDir, 'assets', 'beads'), { recursive: true })

      try {
        if (await exists(outputDir)) {
          await renamePath(outputDir, rollbackDir)
          previousMoved = true
        }
        await renamePath(temporaryDir, outputDir)
      } catch (rootRenameError: unknown) {
        if (isWindowsRenameContentionError(rootRenameError)) {
          await promoteLeaves(temporaryDir, rollbackDir, token)
          previousMoved = false
        } else {
          if (previousMoved && !await exists(outputDir)) {
            try {
              await renamePath(rollbackDir, outputDir)
              previousMoved = false
            } catch (rollbackError: unknown) {
              throw new AggregateError(
                [rootRenameError, rollbackError],
                '阅览目录替换失败，且上一版目录恢复失败'
              )
            }
          }
          throw rootRenameError
        }
      }

      await removeBestEffort(rollbackDir)
      return {
        ok: true,
        levelCount: built.records.length,
        outputPath: 'output/main-level-review/index.html',
        previewUrl: '/api/level-workspace/main-level-review-preview/index.html',
        warnings: built.warnings
      }
    } finally {
      await removeBestEffort(temporaryDir)
    }
  }

  const generate = (
    request: MainLevelReviewGenerateRequest
  ): Promise<MainLevelReviewGenerateResponse> => {
    const nextOperation = generationOperation.then(
      () => generateNow(request),
      () => generateNow(request)
    )
    generationOperation = nextOperation.then(
      () => undefined,
      () => undefined
    )
    return nextOperation
  }

  const readPreviewFile = async (
    relativePath: string
  ): Promise<MainLevelReviewPreviewFile | null> => {
    assertSafePreviewPath(relativePath)
    const isHtml = relativePath === 'index.html'
    const isPng = /^assets\/beads\/[^/\\]+\.png$/i.test(relativePath)
    if (!isHtml && !isPng) return null

    const filePath = assertInside(outputDir, path.resolve(outputDir, relativePath))
    try {
      const fileStat = await lstat(filePath)
      if (!fileStat.isFile()) return null
      return {
        bytes: await readFile(filePath),
        contentType: isHtml ? 'text/html; charset=utf-8' : 'image/png'
      }
    } catch (error: unknown) {
      if (isMissingFileError(error)) return null
      throw error
    }
  }

  return { generate, readPreviewFile }
}
