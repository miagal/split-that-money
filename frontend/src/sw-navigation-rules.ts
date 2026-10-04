// Pure rules for service-worker HTML navigation: when to abandon the network and use precache.

/** Default milliseconds to wait for Caddy before falling back to the precached app shell. */
export const NAVIGATION_NETWORK_TIMEOUT_MS = 3000

/**
 * Converts the server's public shell timeout to milliseconds.
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
 * Reports whether a navigation should serve precached index.html instead of a network response.
 *
 * @param timedOut - True when the navigation fetch aborted after NAVIGATION_NETWORK_TIMEOUT_MS.
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
