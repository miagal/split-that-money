// Pure rules for HTML navigation: live-shell URL flag, and when a live fetch falls back to precache.

/** Query flag that asks the worker to fetch HTML from Caddy instead of precache. */
export const LIVE_SHELL_PARAM = 'stm-live-shell'

/** Default milliseconds a live-shell fetch waits for Caddy before using precache. */
export const NAVIGATION_NETWORK_TIMEOUT_MS = 3000

/**
 * Reports whether this document navigation should go network-first.
 *
 * @param url - The navigation request URL.
 * @returns True when `stm-live-shell=1` is present.
 */
export function isLiveShellNavigation(url: URL): boolean {
  return url.searchParams.get(LIVE_SHELL_PARAM) === '1'
}

/**
 * Returns path + search + hash with the live-shell flag set.
 *
 * @param href - Absolute or path-only URL.
 * @returns The same location with `stm-live-shell=1`.
 */
export function withLiveShellFlag(href: string): string {
  const url = new URL(href, 'https://stm.invalid')
  url.searchParams.set(LIVE_SHELL_PARAM, '1')
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Returns path + search + hash with the live-shell flag removed.
 *
 * @param href - Absolute or path-only URL.
 * @returns The same location without `stm-live-shell`.
 */
export function withoutLiveShellFlag(href: string): string {
  const url = new URL(href, 'https://stm.invalid')
  url.searchParams.delete(LIVE_SHELL_PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Converts the server's live-shell timeout to milliseconds.
 *
 * @param seconds - `SHELL_NETWORK_TIMEOUT_SECONDS` from the last fetched public config.
 * @returns The configured timeout, or the default for missing or invalid values.
 */
export function navigationTimeoutMs(seconds: unknown): number {
  return typeof seconds === 'number' && seconds > 0
    ? seconds * 1000
    : NAVIGATION_NETWORK_TIMEOUT_MS
}

/**
 * Reports whether a live-shell fetch should serve precached index.html instead of the network response.
 *
 * @param timedOut - True when the live-shell fetch aborted after NAVIGATION_NETWORK_TIMEOUT_MS.
 * @param networkError - True when fetch threw for a non-timeout reason.
 * @param responseOk - True when fetch returned an OK HTTP response.
 */
export function shouldFallbackToPrecache({
  timedOut,
  networkError,
  responseOk,
}: {
  timedOut: boolean
  networkError: boolean
  responseOk: boolean
}): boolean {
  return timedOut || networkError || !responseOk
}
