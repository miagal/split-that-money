// Verifies that the production PWA emits the launch assets required for an offline app shell.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const frontendDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)))
const distDirectory = resolve(frontendDirectory, 'dist')

/**
 * Reads a generated launch asset from the production build.
 *
 * @param relativePath - The path below Vite's output directory.
 * @returns The UTF-8 contents of the requested asset.
 */
function readDistAsset(relativePath: string) {
  return readFile(resolve(distDirectory, relativePath), 'utf8')
}

test('keeps the production PWA policy in the source configuration', async () => {
  const viteConfigSource = await readFile(
    resolve(frontendDirectory, 'vite.config.ts'),
    'utf8',
  )
  assert.match(viteConfigSource, /VitePWA\(/)
  assert.match(viteConfigSource, /strategies:\s*'injectManifest'/)
  assert.match(viteConfigSource, /registerType: 'autoUpdate'/)
  assert.match(viteConfigSource, /globPatterns/)
})

test('bypasses navigation handling only for the root certificate download', async () => {
  const swSource = await readFile(
    resolve(frontendDirectory, 'src/sw.ts'),
    'utf8',
  )
  const match = swSource.match(/denylist:\s*\[([^\]]+)\]/)
  assert.ok(match, 'expected a denylist array in sw.ts')
  const denylist: RegExp[] = Function(`"use strict"; return [${match[1]}]`)()

  for (const path of ['/caddy-root.crt', '/caddy-root.crt?download=1']) {
    assert.equal(
      denylist.some((pattern) => pattern.test(path)),
      true,
      path,
    )
  }
  for (const path of [
    '/',
    '/offline_setup',
    '/offline_setup?from=menu',
    '/groups/123',
    '/caddy-root.crt/extra',
    '/caddy-root.crt.bak',
    '/nested/caddy-root.crt',
  ]) {
    assert.equal(
      denylist.some((pattern) => pattern.test(path)),
      false,
      path,
    )
  }
})

test('registers network-first navigation before precache in the worker source', async () => {
  const swSource = await readFile(
    resolve(frontendDirectory, 'src/sw.ts'),
    'utf8',
  )
  const navigationAt = swSource.indexOf('new NavigationRoute')
  const precacheAt = swSource.indexOf('precacheAndRoute(self')
  assert.ok(navigationAt >= 0, 'expected new NavigationRoute')
  assert.ok(precacheAt >= 0, 'expected precacheAndRoute(self')
  assert.ok(
    navigationAt < precacheAt,
    'navigation route must be registered before precacheAndRoute',
  )
  assert.match(swSource, /matchPrecache\(['"]index\.html['"]\)/)
  assert.match(swSource, /shouldFallbackToPrecache/)
})

test(
  'keeps the production PWA shell and its referenced launch assets in the build',
  {
    skip: process.env.VERIFY_PWA_BUILD_OUTPUT !== '1',
  },
  async () => {
    const indexHtml = await readDistAsset('index.html')
    assert.match(
      indexHtml,
      /<meta name="apple-mobile-web-app-capable" content="yes"\s*\/?\s*>/,
    )
    assert.match(
      indexHtml,
      /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"\s*\/?\s*>/,
    )
    const launchAssets = [
      'manifest.webmanifest',
      'sw.js',
      'icon.svg',
      'apple-touch-icon.png',
      ...[...indexHtml.matchAll(/(?:src|href)="\/([^"?]+)"/g)].map(
        (match) => match[1],
      ),
    ]

    for (const asset of launchAssets) await readDistAsset(asset)
  },
)
