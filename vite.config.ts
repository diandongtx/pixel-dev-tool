import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { levelWorkspaceApiPlugin } from './tooling/levelWorkspaceApi'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), levelWorkspaceApiPlugin(process.cwd())],
  server: {
    // Use IPv4 loopback: localhost can resolve to an unavailable IPv6 interface on Windows.
    host: '127.0.0.1',
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [...configDefaults.exclude, 'auto-pipeline/**', '.worktrees/**'],
  }
})
