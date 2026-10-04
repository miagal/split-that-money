/// <reference lib="webworker" />
// Custom Workbox worker: network-first HTML navigations with precache fallback for offline.
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import {
  navigationTimeoutMs,
  shouldFallbackToPrecache,
} from './sw-navigation-rules.ts'

declare let self: ServiceWorkerGlobalScope

const CONFIG_CACHE = 'public-config'
const CONFIG_URL = '/api/config/public/'

/** Reads the timeout from the last public config this worker stored. */
async function configuredTimeoutMs(): Promise<number> {
  try {
    const cached = await (await caches.open(CONFIG_CACHE)).match(CONFIG_URL)
    return navigationTimeoutMs(
      cached ? (await cached.json()).SHELL_NETWORK_TIMEOUT_SECONDS : undefined,
    )
  } catch {
    return navigationTimeoutMs(undefined)
  }
}

/** Stores the current public config for the next cold start. */
async function refreshConfig(): Promise<void> {
  const response = await fetch(CONFIG_URL, { credentials: 'include' })
  if (response.ok)
    await (await caches.open(CONFIG_CACHE)).put(CONFIG_URL, response)
}

self.skipWaiting()
clientsClaim()

registerRoute(
  new NavigationRoute(
    async ({ request, event }) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(
        () => controller.abort(),
        await configuredTimeoutMs(),
      )
      let timedOut = false
      let networkError = false
      let response: Response | null = null
      try {
        response = await fetch(request, { signal: controller.signal })
      } catch (error) {
        timedOut = controller.signal.aborted
        networkError = !timedOut
        if (!timedOut) console.warn('navigation fetch failed', error)
      } finally {
        clearTimeout(timeoutId)
      }

      if (
        !shouldFallbackToPrecache({
          timedOut,
          networkError,
          responseOk: response?.ok === true,
        })
      ) {
        if (response?.ok)
          event.waitUntil(refreshConfig().catch(() => undefined))
        return response as Response
      }

      const cached = await matchPrecache('index.html')
      if (cached) return cached
      if (response) return response
      return Response.error()
    },
    { denylist: [/^\/caddy-root\.crt(?:\?.*)?$/] },
  ),
)

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
