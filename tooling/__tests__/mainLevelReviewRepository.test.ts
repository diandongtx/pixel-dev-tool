// @vitest-environment node
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MainLevelReviewGenerateRequest } from '../../src/types/mainLevelReview'
import { createMainLevelReviewRepository } from '../mainLevelReviewRepository'

const request: MainLevelReviewGenerateRequest = {
  levels: [{
    id: 1,
    thumbnail: 'fox',
    type: 1,
    difficulty: 1,
    pixelImageId: 1001,
    widthHeight: [1, 1],
    storageMaxSlots: 4,
    storageCols: 12,
    storageInitialSlots: 12,
    adUnlockIncrement: 12,
    initialTimeLimit: 300,
    adTimeIncrement: 180,
    reviveCount: 5,
    propConfigs: []
  }],
  pixelConfigs: [{
    id: 1001,
    name: 'fox',
    gridWidthHeight: [1, 1],
    pixelWidthHeight: [1, 1],
    localPixelResource: ['blue'],
    pixelMatrix: [[0]],
    initPixel: [[0]],
    beadCount: 1
  }]
}

describe('main level review repository', () => {
  let root: string | null = null

  afterEach(async () => {
    vi.restoreAllMocks()
    if (root) {
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100
      })
    }
    root = null
  })

  const setupSource = async (): Promise<string> => {
    root = await mkdtemp(path.join(tmpdir(), 'main-level-review-'))
    const sourceDir = path.join(root, 'resource', 'grid')
    await mkdir(path.join(sourceDir, 'archive'), { recursive: true })
    await writeFile(path.join(sourceDir, 'blue_2.png'), Buffer.from([1, 2]))
    await writeFile(path.join(sourceDir, 'blue_3.png'), Buffer.from([3, 4]))
    await writeFile(path.join(sourceDir, 'blue bead_2.png'), Buffer.from([5, 6]))
    await writeFile(path.join(sourceDir, 'unused_4.png'), Buffer.from([7]))
    await writeFile(path.join(sourceDir, 'notes.txt'), 'keep me')
    await writeFile(path.join(sourceDir, 'archive', 'nested-only_2.png'), Buffer.from([8]))
    await writeFile(path.join(sourceDir, 'archive', 'nested-only_3.png'), Buffer.from([9]))
    return root
  }

  const setup = async () => {
    const projectRoot = await setupSource()
    return createMainLevelReviewRepository({
      projectRoot,
      now: () => new Date('2026-07-16T02:00:00.000Z')
    })
  }

  it('writes UTF-8 HTML and copies the complete source bead directory', async () => {
    const repository = await setup()

    const result = await repository.generate(request)

    expect(result).toEqual({
      ok: true,
      levelCount: 1,
      outputPath: 'output/main-level-review/index.html',
      previewUrl: '/api/level-workspace/main-level-review-preview/index.html',
      warnings: []
    })
    await expect(readFile(path.join(root!, 'output', 'main-level-review', 'index.html'), 'utf8'))
      .resolves.toContain('主线关卡阅览')
    await expect(readFile(path.join(
      root!,
      'output',
      'main-level-review',
      'assets',
      'beads',
      'unused_4.png'
    ))).resolves.toEqual(Buffer.from([7]))
    await expect(readFile(path.join(
      root!,
      'output',
      'main-level-review',
      'assets',
      'beads',
      'archive',
      'nested-only_2.png'
    ))).resolves.toEqual(Buffer.from([8]))
    await expect(readFile(path.join(
      root!,
      'output',
      'main-level-review',
      'assets',
      'beads',
      'notes.txt'
    ), 'utf8')).resolves.toBe('keep me')
  })

  it('uses the current working directory by default and lists only top-level PNG files', async () => {
    await setupSource()
    vi.spyOn(process, 'cwd').mockReturnValue(root!)
    const repository = createMainLevelReviewRepository({
      now: () => new Date('2026-07-16T02:00:00.000Z')
    })
    const nestedOnlyRequest: MainLevelReviewGenerateRequest = {
      levels: request.levels,
      pixelConfigs: [{
        ...request.pixelConfigs[0],
        localPixelResource: ['nested-only']
      }]
    }

    const result = await repository.generate(nestedOnlyRequest)

    expect(result.warnings).toEqual([
      '关卡 1：颜色索引 0 缺少 nested-only_2.png',
      '关卡 1：颜色索引 0 缺少 nested-only_3.png'
    ])
    await expect(readFile(path.join(
      root!,
      'output',
      'main-level-review',
      'assets',
      'beads',
      'archive',
      'nested-only_2.png'
    ))).resolves.toEqual(Buffer.from([8]))
  })

  it('replaces stale assets on update', async () => {
    const repository = await setup()
    await repository.generate(request)
    await writeFile(
      path.join(root!, 'output', 'main-level-review', 'assets', 'beads', 'stale.png'),
      'old'
    )

    await repository.generate(request)

    await expect(readFile(
      path.join(root!, 'output', 'main-level-review', 'assets', 'beads', 'stale.png')
    )).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps the previous export when the source resource directory is missing', async () => {
    const repository = await setup()
    await repository.generate(request)
    const previous = await readFile(
      path.join(root!, 'output', 'main-level-review', 'index.html'),
      'utf8'
    )
    await rm(path.join(root!, 'resource', 'grid'), { recursive: true })

    await expect(repository.generate(request)).rejects.toThrow('豆子资源目录不可用')
    await expect(readFile(
      path.join(root!, 'output', 'main-level-review', 'index.html'),
      'utf8'
    )).resolves.toBe(previous)
  })

  it('validates the request before accessing the source resource directory', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'main-level-review-'))
    const repository = createMainLevelReviewRepository({ projectRoot: root })

    await expect(repository.generate({
      levels: null,
      pixelConfigs: []
    } as unknown as MainLevelReviewGenerateRequest)).rejects.toThrow(
      '关卡配置 levels 必须是数组'
    )
  })

  it('restores the previous export when temporary-directory promotion fails', async () => {
    await setupSource()
    let failNextPromotion = false
    const repository = createMainLevelReviewRepository({
      projectRoot: root!,
      renamePath: async (from, to) => {
        if (failNextPromotion && from.includes('.tmp-') && to.endsWith('main-level-review')) {
          failNextPromotion = false
          throw new Error('simulated replace failure')
        }
        await rename(from, to)
      }
    })

    await repository.generate(request)
    const previous = await readFile(
      path.join(root!, 'output', 'main-level-review', 'index.html'),
      'utf8'
    )
    failNextPromotion = true

    await expect(repository.generate({ ...request, levels: [] }))
      .rejects.toThrow('simulated replace failure')
    await expect(readFile(
      path.join(root!, 'output', 'main-level-review', 'index.html'),
      'utf8'
    )).resolves.toBe(previous)
    await expect(readFile(
      path.join(root!, 'output', 'main-level-review', 'assets', 'beads', 'blue_2.png')
    )).resolves.toEqual(Buffer.from([1, 2]))

    const outputEntries = await readdir(path.join(root!, 'output'))
    expect(outputEntries).toEqual(['main-level-review'])

    const recoveryResult = await repository.generate({
      ...request,
      levels: [{ ...request.levels[0], id: 99 }]
    })
    expect(recoveryResult).toMatchObject({ ok: true, levelCount: 1 })
    await expect(readFile(
      path.join(root!, 'output', 'main-level-review', 'index.html'),
      'utf8'
    )).resolves.toContain('"id":99')
  })

  it('falls back to leaf promotion for Windows root rename errors on create and update', async () => {
    await setupSource()
    const outputParent = path.join(root!, 'output')
    let rootRenameErrorCode: 'EPERM' | 'EACCES' = 'EPERM'
    const repository = createMainLevelReviewRepository({
      projectRoot: root!,
      renamePath: async (from, to) => {
        const isWholeRootMove = path.dirname(from) === outputParent
          && path.dirname(to) === outputParent
        if (isWholeRootMove) {
          throw Object.assign(new Error(`simulated ${rootRenameErrorCode}`), {
            code: rootRenameErrorCode
          })
        }
        await rename(from, to)
      }
    })

    await expect(repository.generate(request)).resolves.toMatchObject({
      ok: true,
      levelCount: 1
    })
    const outputDir = path.join(outputParent, 'main-level-review')
    expect((await readdir(outputDir)).sort()).toEqual(['assets', 'index.html'])
    expect(await readdir(path.join(outputDir, 'assets'))).toEqual(['beads'])
    await writeFile(path.join(outputDir, 'assets', 'beads', 'stale.png'), 'stale')

    rootRenameErrorCode = 'EACCES'
    const updatedRequest: MainLevelReviewGenerateRequest = {
      ...request,
      levels: [{ ...request.levels[0], id: 22 }]
    }
    await expect(repository.generate(updatedRequest)).resolves.toMatchObject({
      ok: true,
      levelCount: 1
    })

    await expect(readFile(path.join(outputDir, 'index.html'), 'utf8'))
      .resolves.toContain('"id":22')
    await expect(readFile(path.join(outputDir, 'assets', 'beads', 'blue_2.png')))
      .resolves.toEqual(Buffer.from([1, 2]))
    await expect(readFile(path.join(outputDir, 'assets', 'beads', 'stale.png')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readdir(outputParent)).toEqual(['main-level-review'])
    expect((await readdir(outputDir)).sort()).toEqual(['assets', 'index.html'])
    expect(await readdir(path.join(outputDir, 'assets'))).toEqual(['beads'])
  })

  it('retries transient Windows errors while promoting fallback leaves', async () => {
    await setupSource()
    const outputParent = path.join(root!, 'output')
    const outputDir = path.join(outputParent, 'main-level-review')
    const retryDelays: number[] = []
    let stagedBeadsAttempts = 0
    const repository = createMainLevelReviewRepository({
      projectRoot: root!,
      renameRetryDelay: async (milliseconds) => {
        retryDelays.push(milliseconds)
      },
      renamePath: async (from, to) => {
        const isWholeRootMove = path.dirname(from) === outputParent
          && path.dirname(to) === outputParent
        if (isWholeRootMove) {
          throw Object.assign(new Error('simulated root EPERM'), { code: 'EPERM' })
        }
        const isStagedBeadsPromotion = from.includes('.tmp-')
          && path.basename(from) === 'beads'
          && to === path.join(outputDir, 'assets', 'beads')
        if (isStagedBeadsPromotion) {
          stagedBeadsAttempts += 1
          if (stagedBeadsAttempts <= 2) {
            const code = stagedBeadsAttempts === 1 ? 'EPERM' : 'EACCES'
            throw Object.assign(new Error(`transient leaf ${code}`), { code })
          }
        }
        await rename(from, to)
      }
    })

    await expect(repository.generate(request)).resolves.toMatchObject({
      ok: true,
      levelCount: 1
    })
    expect(stagedBeadsAttempts).toBe(3)
    expect(retryDelays).toEqual([20, 40])
    await expect(readFile(path.join(outputDir, 'assets', 'beads', 'blue_2.png')))
      .resolves.toEqual(Buffer.from([1, 2]))
  })

  it('stops retrying persistent leaf EPERM and restores the previous export', async () => {
    const initialRepository = await setup()
    await initialRepository.generate(request)
    const outputParent = path.join(root!, 'output')
    const outputDir = path.join(outputParent, 'main-level-review')
    const previousHtml = await readFile(path.join(outputDir, 'index.html'), 'utf8')
    await writeFile(path.join(outputDir, 'assets', 'beads', 'previous-only.png'), 'previous')
    const retryDelays: number[] = []
    let stagedBeadsAttempts = 0
    const repository = createMainLevelReviewRepository({
      projectRoot: root!,
      renameRetryDelay: async (milliseconds) => {
        retryDelays.push(milliseconds)
      },
      renamePath: async (from, to) => {
        const isWholeRootMove = path.dirname(from) === outputParent
          && path.dirname(to) === outputParent
        if (isWholeRootMove) {
          throw Object.assign(new Error('simulated root EPERM'), { code: 'EPERM' })
        }
        const isStagedBeadsPromotion = from.includes('.tmp-')
          && path.basename(from) === 'beads'
          && to === path.join(outputDir, 'assets', 'beads')
        if (isStagedBeadsPromotion) {
          stagedBeadsAttempts += 1
          throw Object.assign(new Error('persistent leaf EPERM'), { code: 'EPERM' })
        }
        await rename(from, to)
      }
    })

    await expect(repository.generate({
      ...request,
      levels: [{ ...request.levels[0], id: 99 }]
    })).rejects.toThrow('persistent leaf EPERM')

    expect(stagedBeadsAttempts).toBe(5)
    expect(retryDelays).toEqual([20, 40, 60, 80])
    await expect(readFile(path.join(outputDir, 'index.html'), 'utf8')).resolves.toBe(previousHtml)
    await expect(readFile(path.join(outputDir, 'assets', 'beads', 'previous-only.png'), 'utf8'))
      .resolves.toBe('previous')
    expect((await readdir(outputDir)).sort()).toEqual(['assets', 'index.html'])
    expect(await readdir(path.join(outputDir, 'assets'))).toEqual(['beads'])
  })

  it('restores the complete previous export when Windows leaf fallback fails', async () => {
    const initialRepository = await setup()
    await initialRepository.generate(request)
    const outputParent = path.join(root!, 'output')
    const outputDir = path.join(outputParent, 'main-level-review')
    const previousHtml = await readFile(path.join(outputDir, 'index.html'), 'utf8')
    await writeFile(path.join(outputDir, 'assets', 'beads', 'previous-only.png'), 'previous')
    const repository = createMainLevelReviewRepository({
      projectRoot: root!,
      renamePath: async (from, to) => {
        const isWholeRootMove = path.dirname(from) === outputParent
          && path.dirname(to) === outputParent
        if (isWholeRootMove) {
          throw Object.assign(new Error('simulated EPERM'), { code: 'EPERM' })
        }
        const isStagedBeadsPromotion = from.includes('.tmp-')
          && path.basename(from) === 'beads'
          && to === path.join(outputDir, 'assets', 'beads')
        if (isStagedBeadsPromotion) throw new Error('simulated leaf promotion failure')
        await rename(from, to)
      }
    })

    await expect(repository.generate({
      ...request,
      levels: [{ ...request.levels[0], id: 99 }]
    })).rejects.toThrow('simulated leaf promotion failure')

    await expect(readFile(path.join(outputDir, 'index.html'), 'utf8')).resolves.toBe(previousHtml)
    await expect(readFile(path.join(outputDir, 'assets', 'beads', 'blue_2.png')))
      .resolves.toEqual(Buffer.from([1, 2]))
    await expect(readFile(path.join(outputDir, 'assets', 'beads', 'previous-only.png'), 'utf8'))
      .resolves.toBe('previous')
    expect(await readdir(outputParent)).toEqual(['main-level-review'])
    expect((await readdir(outputDir)).sort()).toEqual(['assets', 'index.html'])
    expect(await readdir(path.join(outputDir, 'assets'))).toEqual(['beads'])
  })

  it('serializes concurrent generations and publishes each complete result in call order', async () => {
    await setupSource()
    const publishedHtml: string[] = []
    let activePromotions = 0
    let maximumActivePromotions = 0
    let promotionCount = 0
    let signalSecondPromotion = () => undefined
    const generatedDates = [
      new Date('2026-07-16T03:00:00.000Z'),
      new Date('2026-07-16T03:00:01.000Z')
    ]
    let generatedDateIndex = 0
    const repository = createMainLevelReviewRepository({
      projectRoot: root!,
      now: () => generatedDates[generatedDateIndex++]!,
      renamePath: async (from, to) => {
        const isPromotion = from.includes('.tmp-') && to.endsWith('main-level-review')
        if (!isPromotion) {
          await rename(from, to)
          return
        }

        promotionCount += 1
        activePromotions += 1
        maximumActivePromotions = Math.max(maximumActivePromotions, activePromotions)
        if (promotionCount === 1) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 200)
            signalSecondPromotion = () => {
              clearTimeout(timeout)
              resolve()
            }
          })
        } else {
          signalSecondPromotion()
        }

        try {
          await rename(from, to)
          publishedHtml.push(await readFile(path.join(to, 'index.html'), 'utf8'))
        } finally {
          activePromotions -= 1
        }
      }
    })
    const laterRequest: MainLevelReviewGenerateRequest = {
      levels: [
        { ...request.levels[0], id: 2 },
        { ...request.levels[0], id: 3 }
      ],
      pixelConfigs: request.pixelConfigs
    }

    const results = await Promise.allSettled([
      repository.generate(request),
      repository.generate(laterRequest)
    ])

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(results[0]).toMatchObject({ value: { ok: true, levelCount: 1 } })
    expect(results[1]).toMatchObject({ value: { ok: true, levelCount: 2 } })
    expect(maximumActivePromotions).toBe(1)
    expect(publishedHtml).toHaveLength(2)
    expect(publishedHtml[0]).toContain('2026-07-16T03:00:00.000Z')
    expect(publishedHtml[0]).toContain('"id":1')
    expect(publishedHtml[1]).toContain('2026-07-16T03:00:01.000Z')
    expect(publishedHtml[1]).toContain('"id":2')
    expect(publishedHtml[1]).toContain('"id":3')
    await expect(readFile(
      path.join(root!, 'output', 'main-level-review', 'index.html'),
      'utf8'
    )).resolves.toBe(publishedHtml[1])
  })

  it('reads only the generated HTML and top-level PNG bead files', async () => {
    const repository = await setup()
    await repository.generate(request)

    await expect(repository.readPreviewFile('index.html')).resolves.toMatchObject({
      bytes: expect.any(Buffer),
      contentType: 'text/html; charset=utf-8'
    })
    await expect(repository.readPreviewFile('assets/beads/blue_2.png')).resolves.toEqual({
      bytes: Buffer.from([1, 2]),
      contentType: 'image/png'
    })
    await expect(repository.readPreviewFile('assets/beads/blue bead_2.png')).resolves.toEqual({
      bytes: Buffer.from([5, 6]),
      contentType: 'image/png'
    })
    await expect(repository.readPreviewFile('assets/beads/unknown.png')).resolves.toBeNull()
    await expect(repository.readPreviewFile('assets/beads/notes.txt')).resolves.toBeNull()
  })

  it.each([
    '../outside.png',
    '/absolute.png',
    'C:/absolute.png',
    'assets\\beads\\blue_2.png',
    'assets/beads/../blue_2.png',
    'assets/beads/archive/nested-only_2.png',
    'assets/beads/%2e%2e%2foutside.png',
    'assets/beads/blue%2fhidden.png',
    'assets/beads/blue\0.png'
  ])('rejects unsafe preview path %s', async (unsafePath) => {
    const repository = await setup()
    await repository.generate(request)

    await expect(repository.readPreviewFile(unsafePath)).rejects.toThrow('阅览资源路径越界')
  })
})
