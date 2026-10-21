import { describe, expect, it } from 'vitest'
import {
  type BeadResourceAsset,
  buildBeadResourceCatalog,
  groupBeadResourceFiles,
  parseBeadResourceFilename
} from '../beadResourceCatalog'
import type { ImageDataLike } from '../imageColorSampling'

const createFile = (name: string): File => new File(['png'], name, { type: 'image/png' })

const imageDataWithColor = (color: [number, number, number, number]): ImageDataLike => {
  const data = new Uint8ClampedArray(84 * 84 * 4)
  for (let index = 0; index < 84 * 84; index += 1) {
    data.set(color, index * 4)
  }
  return { width: 84, height: 84, data }
}

describe('parseBeadResourceFilename', () => {
  it('extracts resourceName and stateCode from valid bead resource png names', () => {
    expect(parseBeadResourceFilename('bakery0_4.png')).toEqual({
      resourceName: 'bakery0',
      stateCode: 4
    })
    expect(parseBeadResourceFilename('banana_b12_3.png')).toEqual({
      resourceName: 'banana_b12',
      stateCode: 3
    })
  })

  it('rejects names without a final 2/3/4 state suffix', () => {
    expect(parseBeadResourceFilename('bakery0.png')).toBeNull()
    expect(parseBeadResourceFilename('bakery0_1.png')).toBeNull()
    expect(parseBeadResourceFilename('bakery0_4.jpg')).toBeNull()
  })
})

describe('groupBeadResourceFiles', () => {
  it('groups state files by resourceName', () => {
    const groups = groupBeadResourceFiles([
      createFile('bakery0_2.png'),
      createFile('bakery0_3.png'),
      createFile('bakery0_4.png'),
      createFile('banana_b0_4.png')
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      resourceName: 'bakery0',
      stateFiles: {
        2: expect.objectContaining({ name: 'bakery0_2.png' }),
        3: expect.objectContaining({ name: 'bakery0_3.png' }),
        4: expect.objectContaining({ name: 'bakery0_4.png' })
      }
    })
    expect(groups[1]).toMatchObject({
      resourceName: 'banana_b0',
      stateFiles: {
        4: expect.objectContaining({ name: 'banana_b0_4.png' })
      }
    })
  })

  it('ignores invalid and non-png files', () => {
    const groups = groupBeadResourceFiles([
      createFile('readme.txt'),
      createFile('bad_5.png'),
      createFile('valid0_2.png')
    ])

    expect(groups.map((group) => group.resourceName)).toEqual(['valid0'])
  })
})

describe('buildBeadResourceCatalog', () => {
  it('prefers state 4 side-region color as the compare color', async () => {
    const files = [
      createFile('bakery0_2.png'),
      createFile('bakery0_3.png'),
      createFile('bakery0_4.png')
    ]
    const loadImageData = async (file: BeadResourceAsset) =>
      imageDataWithColor(file.name.endsWith('_4.png') ? [241, 240, 231, 255] : [10, 20, 30, 255])

    const catalog = await buildBeadResourceCatalog(files, loadImageData)

    expect(catalog).toEqual([
      {
        resourceName: 'bakery0',
        compareColor: { r: 241, g: 240, b: 231, a: 255 },
        stateFiles: {
          2: expect.objectContaining({ name: 'bakery0_2.png' }),
          3: expect.objectContaining({ name: 'bakery0_3.png' }),
          4: expect.objectContaining({ name: 'bakery0_4.png' })
        },
        compareSource: {
          stateCode: 4,
          samplingRule: 'state4-side-regions'
        }
      }
    ])
  })

  it('falls back to state 3 when state 4 is missing', async () => {
    const catalog = await buildBeadResourceCatalog([
      createFile('banana_b0_2.png'),
      createFile('banana_b0_3.png')
    ], async () => imageDataWithColor([149, 91, 38, 255]))

    expect(catalog[0]?.compareSource).toEqual({
      stateCode: 3,
      samplingRule: 'state3-side-regions'
    })
    expect(catalog[0]?.compareColor).toEqual({ r: 149, g: 91, b: 38, a: 255 })
  })

  it('uses whole-image dominant color when only state 2 exists', async () => {
    const catalog = await buildBeadResourceCatalog([
      createFile('apple0_2.png')
    ], async () => imageDataWithColor([210, 30, 40, 255]))

    expect(catalog[0]?.compareSource).toEqual({
      stateCode: 2,
      samplingRule: 'fallback-dominant-color'
    })
    expect(catalog[0]?.compareColor).toEqual({ r: 210, g: 30, b: 40, a: 255 })
  })
})
