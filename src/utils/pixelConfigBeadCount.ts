export const isValidPixelConfigBeadCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

export const countPixelConfigBeads = (pixelMatrix: number[][]): number => {
  let beadCount = 0
  for (const row of pixelMatrix) {
    for (const cell of row) {
      if (cell >= 0) beadCount += 1
    }
  }
  return beadCount
}
