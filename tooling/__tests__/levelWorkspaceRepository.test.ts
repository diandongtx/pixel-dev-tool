// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GridData } from '../../src/types/grid'
import type { LevelConfigItem } from '../../src/types/levelConfig'
import type { PixelConfigItem } from '../../src/types/pixelConfig'
import { countPixelConfigBeads } from '../../src/utils/pixelConfigBeadCount'
import { createLevelWorkspaceRepository } from '../levelWorkspaceRepository'

const mapGrid: GridData = {
  width: 1,
  height: 1,
  colorIndices: [[0]],
  colors: [{ r: 240, g: 240, b: 230, a: 255 }],
  fileName: 'flower'
}

const pixelConfig: PixelConfigItem = {
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
      colors: [{ r: 240, g: 240, b: 230, a: 255 }],
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

describe('level workspace repository', () => {
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

  const createRepository = async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'pixeldevtool-workspace-'))
    return createLevelWorkspaceRepository({ projectRoot })
  }

  it('initializes workspace directories and returns empty config files when missing', async () => {
    const repository = await createRepository()

    await repository.ensureWorkspace()

    await expect(stat(repository.paths.draftsDir).then((item) => item.isDirectory())).resolves.toBe(true)
    await expect(stat(repository.paths.configDir).then((item) => item.isDirectory())).resolves.toBe(true)
    await expect(stat(repository.paths.thumbnailDir).then((item) => item.isDirectory())).resolves.toBe(true)
    await expect(repository.readPixelConfig()).resolves.toEqual([])
    await expect(repository.readThemeConfig()).resolves.toEqual([
      { theme: 'animal', themeName: '动物', sortOrder: 1 },
      { theme: 'plant', themeName: '植物', sortOrder: 2 },
      { theme: 'character', themeName: '人物', sortOrder: 3 },
      { theme: 'fruit-veggie', themeName: '果蔬', sortOrder: 4 },
      { theme: 'object', themeName: '物品', sortOrder: 5 },
      { theme: 'food', themeName: '食物', sortOrder: 6 },
      { theme: 'scenery', themeName: '风景', sortOrder: 7 },
      { theme: 'insect', themeName: '昆虫', sortOrder: 8 },
      { theme: 'dessert', themeName: '甜品', sortOrder: 9 },
      { theme: 'vehicle', themeName: '交通工具', sortOrder: 10 },
      { theme: 'other', themeName: '其它', sortOrder: 11 }
    ])
    await expect(repository.readPixelPalettes()).resolves.toEqual({ version: 1, items: [] })
    await expect(repository.readLevelConfig(1)).resolves.toEqual([])
  })

  it('saves and reads map and point data inside a named draft folder', async () => {
    const repository = await createRepository()

    await repository.saveDraft({
      name: 'flower',
      map: mapGrid,
      point: mapGrid,
      pixelConfig,
      levelConfig
    })

    await expect(repository.listDrafts()).resolves.toEqual(['flower'])
    await expect(repository.readDraft('flower')).resolves.toMatchObject({
      name: 'flower',
      map: mapGrid,
      point: mapGrid,
      pixelConfig,
      levelConfig
    })

    const draftMapText = await readFile(
      path.join(repository.paths.draftsDir, 'flower', 'flower_map.json'),
      'utf8'
    )
    expect(JSON.parse(draftMapText)).toMatchObject({ fileName: 'flower', width: 1, height: 1 })
  })

  it('deletes saved drafts by name', async () => {
    const repository = await createRepository()

    await repository.saveDraft({ name: 'flower', map: mapGrid })

    await expect(repository.listDrafts()).resolves.toEqual(['flower'])

    await repository.deleteDraft('flower')

    await expect(repository.listDrafts()).resolves.toEqual([])
    await expect(repository.readDraft('flower')).resolves.toBeNull()
  })

  it('saves total configs and transparent thumbnail assets in stable locations', async () => {
    const repository = await createRepository()
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47])

    await repository.writePixelConfig([pixelConfig])
    await repository.writePixelPalettes(pixelPalettes)
    await repository.writeLevelConfig(1, [levelConfig])
    const thumbnailPath = await repository.saveThumbnail('flower', pngBytes)

    await expect(repository.readPixelConfig()).resolves.toEqual([pixelConfig])
    await expect(repository.readPixelPalettes()).resolves.toEqual(pixelPalettes)
    await expect(repository.readLevelConfig(1)).resolves.toEqual([levelConfig])
    await expect(readFile(path.join(repository.paths.configDir, 'pixelconfig.json'), 'utf8'))
      .resolves.toBe(`${JSON.stringify([pixelConfig])}\n`)
    await expect(readFile(path.join(repository.paths.configDir, 'pixelpalettes.json'), 'utf8'))
      .resolves.toBe(`${JSON.stringify(pixelPalettes, null, 2)}\n`)
    await expect(readFile(path.join(repository.paths.configDir, 'levelconfig.json'), 'utf8'))
      .resolves.toBe(`${JSON.stringify([levelConfig], null, 2)}\n`)
    await expect(readFile(path.join(repository.paths.configDir, 'levelconfig_1.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(thumbnailPath)).resolves.toEqual(Buffer.from(pngBytes))
    expect(thumbnailPath).toBe(path.join(repository.paths.thumbnailDir, 'flower.png'))
  })

  it('migrates legacy pixelconfig bead counts once and persists the result', async () => {
    const repository = await createRepository()
    const legacyPixelConfig = {
      ...pixelConfig,
      pixelMatrix: [[0, -1, 2]]
    }
    delete legacyPixelConfig.beadCount

    await repository.ensureWorkspace()
    await writeFile(repository.paths.pixelConfigPath, `${JSON.stringify([legacyPixelConfig])}\n`, 'utf8')

    const migratedPixelConfig = [{ ...legacyPixelConfig, beadCount: 2 }]
    await expect(repository.readPixelConfig()).resolves.toEqual(migratedPixelConfig)
    await expect(readFile(repository.paths.pixelConfigPath, 'utf8'))
      .resolves.toBe(`${JSON.stringify(migratedPixelConfig)}\n`)
    expect((await readdir(path.join(repository.paths.configDir, 'backups')))
      .filter((file) => file.startsWith('pixelconfig_')))
      .toHaveLength(1)

    await expect(repository.readPixelConfig()).resolves.toEqual(migratedPixelConfig)
    expect((await readdir(path.join(repository.paths.configDir, 'backups')))
      .filter((file) => file.startsWith('pixelconfig_')))
      .toHaveLength(1)
  })

  it('serializes concurrent legacy pixelconfig reads into one migration backup', async () => {
    const repository = await createRepository()
    const legacyPixelConfig = {
      ...pixelConfig,
      pixelMatrix: [[0, -1, 2]]
    }
    delete legacyPixelConfig.beadCount

    await repository.ensureWorkspace()
    await writeFile(repository.paths.pixelConfigPath, `${JSON.stringify([legacyPixelConfig])}\n`, 'utf8')

    const migratedPixelConfig = [{ ...legacyPixelConfig, beadCount: 2 }]
    const [firstRead, secondRead] = await Promise.all([
      repository.readPixelConfig(),
      repository.readPixelConfig()
    ])

    expect(firstRead).toEqual(migratedPixelConfig)
    expect(secondRead).toEqual(migratedPixelConfig)
    expect((await readdir(path.join(repository.paths.configDir, 'backups')))
      .filter((file) => file.startsWith('pixelconfig_')))
      .toHaveLength(1)
  })

  it('preserves valid bead counts and future fields while migrating invalid counts', async () => {
    const repository = await createRepository()
    const invalidPixelConfig = {
      ...pixelConfig,
      pixelMatrix: [[0, -1, 2]],
      beadCount: -1,
      futureField: { enabled: true }
    }
    const validPixelConfig = {
      ...pixelConfig,
      id: 1001,
      name: 'flower-v2',
      beadCount: 99,
      futureField: { version: 'v-next' }
    }

    await repository.ensureWorkspace()
    await writeFile(
      repository.paths.pixelConfigPath,
      `${JSON.stringify([invalidPixelConfig, validPixelConfig])}\n`,
      'utf8'
    )

    const migratedPixelConfig = [
      { ...invalidPixelConfig, beadCount: 2 },
      validPixelConfig
    ]
    await expect(repository.readPixelConfig()).resolves.toEqual(migratedPixelConfig)
    await expect(readFile(repository.paths.pixelConfigPath, 'utf8'))
      .resolves.toBe(`${JSON.stringify(migratedPixelConfig)}\n`)
  })

  it('saves themeconfig in the workspace config directory', async () => {
    const repository = await createRepository()
    const themes = [
      { theme: 'animal', themeName: '动物', sortOrder: 1 },
      { theme: 'food', themeName: '食物', sortOrder: 2 }
    ]

    await repository.writeThemeConfig(themes)

    await expect(repository.readThemeConfig()).resolves.toEqual(themes)
    await expect(readFile(path.join(repository.paths.configDir, 'themeconfig.json'), 'utf8'))
      .resolves.toBe(`${JSON.stringify(themes, null, 2)}\n`)
  })

  it('reads legacy levelconfig_1.json when the new main levelconfig file is missing', async () => {
    const repository = await createRepository()

    await repository.ensureWorkspace()
    await writeFile(
      path.join(repository.paths.configDir, 'levelconfig_1.json'),
      `${JSON.stringify([levelConfig], null, 2)}\n`,
      'utf8'
    )

    await expect(repository.readLevelConfig(1)).resolves.toEqual([levelConfig])
  })

  it('reads and saves dated daily levels in dailylevelconfig.json with separate backups', async () => {
    const repository = await createRepository()
    await repository.ensureWorkspace()
    const daily = { ...levelConfig, id: '2026-05-01', type: 1, highDifficulty: false, threeStarSeconds: 90 }
    const filePath = path.join(repository.paths.configDir, 'dailylevelconfig.json')
    await writeFile(filePath, JSON.stringify([daily]), 'utf8')
    await repository.writeLevelConfig(1, [levelConfig])

    await expect(repository.readLevelConfig(2)).resolves.toEqual([daily])
    const updated = { ...daily, initialTimeLimit: 300 }
    await repository.writeLevelConfig(2, [updated])
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual([updated])
    await expect(repository.readLevelConfig(1)).resolves.toEqual([levelConfig])
    await expect(stat(path.join(repository.paths.configDir, 'levelconfig_2.json')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    const backups = await readdir(path.join(repository.paths.configDir, 'backups'))
    const backup = backups.find((file) => file.startsWith('dailylevelconfig_'))!
    expect(JSON.parse(await readFile(path.join(repository.paths.configDir, 'backups', backup), 'utf8'))).toEqual([daily])
  })

  it('backs up existing pixelconfig and levelconfig files before overwriting them', async () => {
    const repository = await createRepository()
    const nextPixelConfig = { ...pixelConfig, id: 1001, name: 'flower-v2' }
    const nextLevelConfig = { ...levelConfig, id: 2, pixelImageId: 1001, thumbnail: 'flower-v2' }

    await repository.writePixelConfig([pixelConfig])
    await repository.writeLevelConfig(1, [levelConfig])
    await repository.writePixelConfig([nextPixelConfig])
    await repository.writeLevelConfig(1, [nextLevelConfig])

    const backupDir = path.join(repository.paths.configDir, 'backups')
    const backupFiles = await readdir(backupDir)
    const pixelBackup = backupFiles.find((file) => file.startsWith('pixelconfig_'))
    const levelBackup = backupFiles.find((file) => file.startsWith('levelconfig_'))

    expect(pixelBackup).toMatch(/pixelconfig_\d{8}_\d{6}_\d{3}_\d{4}\.json/)
    expect(levelBackup).toMatch(/levelconfig_\d{8}_\d{6}_\d{3}_\d{4}\.json/)
    await expect(readFile(path.join(backupDir, pixelBackup!), 'utf8')).resolves.toBe(`${JSON.stringify([pixelConfig])}\n`)
    await expect(readFile(path.join(backupDir, levelBackup!), 'utf8')).resolves.toBe(`${JSON.stringify([levelConfig], null, 2)}\n`)
  })

  it('keeps only the latest 50 backups per config file', async () => {
    const repository = await createRepository()

    await repository.writePixelConfig([pixelConfig])
    for (let index = 0; index < 55; index += 1) {
      await repository.writePixelConfig([{ ...pixelConfig, id: 1000 + index }])
    }

    const backupFiles = await readdir(path.join(repository.paths.configDir, 'backups'))
    const pixelBackups = backupFiles.filter((file) => file.startsWith('pixelconfig_'))

    expect(pixelBackups).toHaveLength(50)
  })

  it('deletes saved thumbnail assets by name', async () => {
    const repository = await createRepository()
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47])

    const thumbnailPath = await repository.saveThumbnail('flower', pngBytes)

    await expect(readFile(thumbnailPath)).resolves.toEqual(Buffer.from(pngBytes))

    await repository.deleteThumbnail('flower')

    await expect(readFile(thumbnailPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects unsafe draft and asset names', async () => {
    const repository = await createRepository()

    await expect(repository.saveDraft({ name: '../bad', map: mapGrid })).rejects.toThrow('名称不能包含路径或非法字符')
    await expect(repository.saveThumbnail('bad/name', Uint8Array.from([]))).rejects.toThrow('名称不能包含路径或非法字符')
  })
})
