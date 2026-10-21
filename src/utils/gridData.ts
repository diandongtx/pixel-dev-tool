import type { GridData, RGBColor } from '../types/grid'

export const cloneColors = (colors: RGBColor[]): RGBColor[] => colors.map((color) => ({ ...color }))

export const cloneColorIndices = (colorIndices: number[][]): number[][] => colorIndices.map((row) => [...row])

export const cloneGridData = (data: GridData): GridData => ({
  width: data.width,
  height: data.height,
  colorIndices: cloneColorIndices(data.colorIndices),
  colors: cloneColors(data.colors),
  fileName: data.fileName
})

export const buildGridOutputJson = (data: GridData): string => {
  const gridLines = data.colorIndices.map((row) => `        [${row.join(', ')}]`)
  const colorLines = data.colors.map((color) => (
    `        {"r": ${color.r}, "g": ${color.g}, "b": ${color.b}, "a": ${color.a}}`
  ))

  return [
    '{',
    `    "width": ${data.width},`,
    `    "height": ${data.height},`,
    '    "grid": [',
    ...gridLines.map((line, index) => index < gridLines.length - 1 ? `${line},` : line),
    '    ],',
    '    "colors": [',
    ...colorLines.map((line, index) => index < colorLines.length - 1 ? `${line},` : line),
    '    ]',
    '}'
  ].join('\n')
}
