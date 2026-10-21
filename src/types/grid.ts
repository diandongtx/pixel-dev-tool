export interface RGBColor {
  r: number
  g: number
  b: number
  a: number
}

export interface GridData {
  width: number
  height: number
  colorIndices: number[][]
  colors: RGBColor[]
  fileName: string
}
