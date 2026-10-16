// Configures the React build and an offline application-shell service worker.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteDevServerOptions } from './src/vite-dev-server.ts'

export default defineConfig({
  server: viteDevServerOptions(process.env.DEV_DOMAIN),
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'autoUpdate',
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Split That Money',
        short_name: 'Split That Money',
        display: 'standalone',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{css,html,js,png,svg}'],
      },
    }),
  ],
})
