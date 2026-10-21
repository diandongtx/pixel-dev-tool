// Original geometric demo assets. No private images or level data are inputs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const colors = ['E85D75', 'F5BD4F', '51BFA6', '548ED6', '8C6BC8', 'EDF2F7']
const rgb = (hex) => [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
const write = (name, data) => {
  const path = resolve(root, name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}
const json = (name, data) => write(name, `${JSON.stringify(data, null, 2)}\n`)
const crc32 = (bytes) => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
const chunk = (kind, payload) => {
  const body = Buffer.concat([Buffer.from(kind), payload])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(payload.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}
const png = (width, height, pixel) => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgba = pixel(x, y)
      for (let c = 0; c < 4; c += 1) raw[y * (1 + width * 4) + 1 + x * 4 + c] = rgba[c]
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ])
}
const transparent = [0, 0, 0, 0]
for (const hex of colors) {
  for (const state of [2, 3, 4]) {
    write(`resource/grid/${hex}_${state}.png`, png(24, 24, (x, y) => {
      if (x < 2 || x > 21 || y < 2 || y > 21) return transparent
      if (state === 4 && x >= 8 && x <= 15 && y >= 8 && y <= 15) return transparent
      const factor = y <= 4 ? 1.15 : y >= 19 ? 0.75 : x <= 4 || x >= 19 ? 0.9 : 1
      return [...rgb(hex).map((v) => Math.min(255, Math.round(v * factor))), 255]
    }))
  }
}

// Simple independently drawn layers compatible with the debug renderer's API.
const layerSets = {
  bean0_2: ['base', 'mid', 'top_gray'],
  bean0_3: ['base_color', 'base_outline', 'top_up', 'top_down', 'top_left', 'top_right'],
  bean0_4: ['base-1', 'mid-down', 'mid-left', 'mid-right', 'mid-up', 'top-frame']
}
for (const [template, layers] of Object.entries(layerSets)) {
  for (const layer of layers) {
    write(`public/beads/${template}/${layer}.png`, png(24, 24, (x, y) => {
      if (x < 2 || x > 21 || y < 2 || y > 21) return transparent
      const hole = template === 'bean0_4' && x >= 8 && x <= 15 && y >= 8 && y <= 15
      if (hole) return transparent
      const edge = x === 2 || x === 21 || y === 2 || y === 21
      let visible = layer.startsWith('base')
      if (layer === 'base_outline' || layer === 'top-frame') visible = edge
      if (layer.endsWith('up')) visible = y >= 3 && y <= 5
      if (layer.endsWith('down')) visible = y >= 18 && y <= 20
      if (layer.endsWith('left')) visible = x >= 3 && x <= 5
      if (layer.endsWith('right')) visible = x >= 18 && x <= 20
      if (layer === 'mid') visible = y >= 3 && y <= 5
      if (layer === 'top_gray') visible = x >= 6 && x <= 17 && y >= 6 && y <= 17
      if (!visible) return transparent
      if (layer === 'top_gray') return [180, 180, 180, 255]
      if (layer === 'mid') return [255, 255, 255, 255]
      return [219, 57, 55, 255]
    }))
  }
}

const matrix = Array.from({ length: 24 }, (_, y) => Array.from({ length: 24 }, (_, x) => {
  if (x < 2 || x > 21 || y < 2 || y > 21) return -2
  return (Math.floor((x - 2) / 5) + 2 * Math.floor((y - 2) / 5)) % colors.length
}))
const grid = {
  width: 24, height: 24, colorIndices: matrix,
  colors: colors.map((hex) => { const [r, g, b] = rgb(hex); return { r, g, b, a: 255 } }),
  fileName: 'geometric-mosaic'
}
json('examples/geometric-mosaic-map.json', grid)
json('examples/pixelconfig.json', [{
  id: 1, name: grid.fileName, gridWidthHeight: [24, 24], pixelWidthHeight: [240, 240],
  localPixelResource: colors, pixelMatrix: matrix,
  initPixel: matrix.map((row) => [...row].reverse()).reverse(),
  beadCount: 400, theme: 'other', difficulty: 1, quality: 1, imageType: 1
}])
json('examples/levelconfig.json', [{
  id: 1, thumbnail: grid.fileName, type: 1, difficulty: 1, pixelImageId: 1, widthHeight: [24, 24],
  storageMaxSlots: 7, storageCols: 7, storageInitialSlots: 5, adUnlockIncrement: 1,
  initialTimeLimit: 300, adTimeIncrement: 30, reviveCount: 1, propConfigs: []
}])
write('examples/geometric-mosaic.png', png(240, 240, (x, y) => {
  const value = matrix[Math.floor(y / 10)][Math.floor(x / 10)]
  return value < 0 ? transparent : [...rgb(colors[value]), 255]
}))
console.log('Generated geometric samples, six bead colors and debug layers.')
