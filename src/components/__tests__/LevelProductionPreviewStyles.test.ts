// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(resolve(__dirname, '../../App.css'), 'utf8')

const readCssBlock = (selector: string): string => {
  const match = appCss.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))
  return match?.[1] ?? ''
}

describe('level production preview styles', () => {
  it('keeps the two map previews in one row on desktop and scrolls each preview internally', () => {
    const pairBlock = readCssBlock('.level-production-preview-pair')
    const mapPreviewBlock = readCssBlock('.level-production-map-preview')

    expect(pairBlock).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));')
    expect(mapPreviewBlock).toContain('width: 100%;')
    expect(mapPreviewBlock).toContain('overflow: auto;')
  })

  it('renders preview cells as responsive squares instead of fixed 28px blocks', () => {
    const cellBlock = readCssBlock('.level-production-preview-cell')

    expect(cellBlock).toContain('width: 100%;')
    expect(cellBlock).toContain('aspect-ratio: 1 / 1;')
    expect(cellBlock).toContain('height: auto;')
  })
})
