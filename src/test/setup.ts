// Existing regression tests exercise the preserved Chinese interface.
if (typeof window !== 'undefined') window.history.replaceState(null, '', '/?lang=zh-CN')
import { vi } from 'vitest'

const url = globalThis.URL
if (typeof url.createObjectURL !== 'function') {
  Object.defineProperty(url, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:vitest-mock')
  })
}

if (typeof url.revokeObjectURL !== 'function') {
  Object.defineProperty(url, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn()
  })
}
