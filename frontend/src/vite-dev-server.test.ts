// Verifies Vite server options for plain LAN HTTP vs HTTPS reverse-proxy domain mode.
import assert from 'node:assert/strict'
import test from 'node:test'
import { viteDevServerOptions } from './vite-dev-server.ts'

test('keeps plain LAN HTTP defaults when no domain is set', () => {
  assert.deepEqual(viteDevServerOptions(undefined), {
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
    },
  })
})

test('enables wss HMR and the subdomain host behind a TLS reverse proxy', () => {
  assert.deepEqual(viteDevServerOptions('stm-dev.example.com'), {
    host: true,
    allowedHosts: ['stm-dev.example.com'],
    hmr: {
      host: 'stm-dev.example.com',
      protocol: 'wss',
      clientPort: 443,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
    },
  })
})

test('trims blank domain values back to the LAN defaults', () => {
  assert.equal('hmr' in viteDevServerOptions('  '), false)
})
