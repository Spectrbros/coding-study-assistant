import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const DEV_ORIGIN = 'http://localhost:5173'
const DEV_WS_ORIGIN = 'ws://localhost:5173'

const DEV_CSP = [
  "default-src 'none'",
  `script-src 'self' 'unsafe-inline' ${DEV_ORIGIN}`,
  `style-src 'self' 'unsafe-inline' ${DEV_ORIGIN}`,
  `img-src 'self' data: blob: ${DEV_ORIGIN}`,
  `font-src 'self' data: ${DEV_ORIGIN}`,
  `connect-src 'self' ${DEV_ORIGIN} ${DEV_WS_ORIGIN}`,
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ')

// Для production сетевые запросы из renderer'а запрещены полностью:
// DeepSeek API вызывается только из main-процесса.
const PROD_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ')

function cspMetaPlugin(policy: string, apply: 'serve' | 'build'): Plugin {
  return {
    name: `csp-meta-${apply}`,
    apply,
    transformIndexHtml(html: string) {
      const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`
      return html.replace('<!-- CSP -->', meta)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    plugins: [react(), cspMetaPlugin(DEV_CSP, 'serve'), cspMetaPlugin(PROD_CSP, 'build')],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer')
      }
    },
    server: {
      port: 5173,
      strictPort: true
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    }
  }
})

