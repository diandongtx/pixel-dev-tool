import { describe, expect, it } from 'vitest'
import type { GridData } from '../../types/grid'
import { extractSubjectGridData } from '../subjectGrid'

describe('extractSubjectGridData', () => {
  it('preserves original sparse color indices when extracting the subject', () => {
    const colors = Array.from({ length: 10 }, (_, index) => ({
      r: index * 10,
      g: index * 10 + 1,
      b: index * 10 + 2,
      a: 255
    }))
    const source: GridData = {
      width: 5,
      height: 5,
      colorIndices: [
        [0, 0, 0, 0, 0],
        [0, 1, 3, 4, 0],
        [0, 5, 7, 8, 0],
        [0, 9, 1, 3, 0],
        [0, 0, 0, 0, 0]
      ],
      colors,
      fileName: 'flower'
    }

    const subject = extractSubjectGridData(source)

    expect(subject.colorIndices).toEqual([
      [1, 3, 4],
      [5, 7, 8],
      [9, 1, 3]
    ])
    expect(subject.colors).toEqual(colors)
  })

  it('keeps raw basenames ending in _subject distinct by appending another subject suffix', () => {
    const source: GridData = {
      width: 3,
      height: 3,
      colorIndices: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0]
      ],
      colors: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 219, g: 57, b: 55, a: 255 }
      ],
      fileName: 'flower_subject'
    }

    expect(extractSubjectGridData(source).fileName).toBe('flower_subject_subject')
  })

  it('uses an explicit background index when extracting the subject', () => {
    const source: GridData = {
      width: 5,
      height: 5,
      colorIndices: [
        [0, 1, 1, 1, 0],
        [0, 1, 2, 1, 0],
        [0, 1, 2, 1, 0],
        [0, 1, 2, 1, 0],
        [0, 0, 0, 0, 0]
      ],
      colors: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 20, g: 20, b: 20, a: 255 },
        { r: 230, g: 60, b: 60, a: 255 }
      ],
      fileName: 'icon'
    }

    const subject = extractSubjectGridData(source, { backgroundIndex: 1 })

    expect(subject.colorIndices).toEqual([
      [0, -2, -2, -2, 0],
      [0, -2, 2, -2, 0],
      [0, -2, 2, -2, 0],
      [0, -2, 2, -2, 0],
      [0, 0, 0, 0, 0]
    ])
  })

  it('removes every matching background index when explicitly requested', () => {
    const source: GridData = {
      width: 5,
      height: 5,
      colorIndices: [
        [0, 0, 0, 0, 0],
        [0, 2, 2, 2, 0],
        [0, 2, 1, 2, 0],
        [0, 2, 2, 2, 0],
        [0, 0, 0, 0, 0]
      ],
      colors: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 20, g: 20, b: 20, a: 255 },
        { r: 230, g: 60, b: 60, a: 255 }
      ],
      fileName: 'icon'
    }

    const subject = extractSubjectGridData(source, {
      backgroundIndex: 1,
      removeAllMatchingBackground: true
    })

    expect(subject.colorIndices).toEqual([
      [0, 0, 0, 0, 0],
      [0, 2, 2, 2, 0],
      [0, 2, -2, 2, 0],
      [0, 2, 2, 2, 0],
      [0, 0, 0, 0, 0]
    ])
  })
})
