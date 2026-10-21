// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { english } from '../en'

it('covers literal translation keys and prevents new untranslated UI text', () => {
  const missing: string[] = []
  const unwrapped: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!['__tests__', 'i18n', 'test'].includes(entry.name)) walk(filename)
        continue
      }
      if (!/\.tsx?$/.test(filename) || /\.test\./.test(filename)) continue
      const file = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
          const key = node.arguments[0]
          if (key && ts.isStringLiteral(key) && !(key.text in english)) missing.push(`${filename}: ${key.text}`)
        }
        if ((ts.isStringLiteral(node) || ts.isJsxText(node) || ts.isNoSubstitutionTemplateLiteral(node))
          && /[\u4e00-\u9fff]/.test(node.text)) {
          const parent = node.parent
          const isKey = ts.isCallExpression(parent) && ts.isIdentifier(parent.expression)
            && parent.expression.text === 't' && parent.arguments[0] === node
          const languageControl = ['Language / 语言', '中文'].includes(node.text.trim())
          const builtinData = filename.endsWith(path.join('utils', 'themeConfig.ts'))
          if (!isKey && !languageControl && !builtinData) unwrapped.push(`${filename}: ${node.text.trim()}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(file)
    }
  }
  walk('src')
  expect(missing).toEqual([])
  expect(unwrapped).toEqual([])
})
