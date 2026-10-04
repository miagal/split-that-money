// Owns session boot states, the device sign-out marker, and account-cache persistence.
import type { UserDto } from '../api/contracts.ts'
import type { MoneyStore } from '../features/sync/database.ts'
import { clientUuid } from '../lib/uuid.ts'

export type SessionBootState = {
  session: UserDto | null | undefined
  bootError: boolean
}

const SIGN_OUT_KEY = 'split-that-money-device-sign-out'

/**
 * Persists the explicit device sign-out, the only lock on the cached account.
 *
 * @returns Marker access whose in-memory flag also blocks this document when storage writes fail.
 */
export function createDeviceSignOut() {
  let signedOut = false
  return {
    isSignedOut(): boolean {
      if (signedOut) return true
      try {
        return (
          localStorage.getItem(SIGN_OUT_KEY)?.startsWith('signed-out:') === true
        )
      } catch {
        return true
      }
    },
    mark(): boolean {
      signedOut = true
      try {
        const value = `signed-out:${clientUuid()}`
        localStorage.setItem(SIGN_OUT_KEY, value)
        return localStorage.getItem(SIGN_OUT_KEY) === value
      } catch {
        return false
      }
    },
    clear(): void {
      signedOut = false
      try {
        localStorage.setItem(SIGN_OUT_KEY, 'active')
      } catch {
        // The next start reads the old marker and asks for an online sign-in again.
      }
    },
  }
}

/**
 * Marks session boot as pending while the current-user request is in flight.
 *
 * @returns A loading state that does not trigger an authentication redirect.
 */
export function loadingSessionBoot(): SessionBootState {
  return { session: undefined, bootError: false }
}

/**
 * Records a completed current-user request, including the expected no-session result.
 *
 * @param session - The authenticated user or null returned by the session endpoint.
 * @returns The resolved boot state for route guards.
 */
export function resolvedSessionBoot(session: UserDto | null): SessionBootState {
  return { session, bootError: false }
}

/**
 * Boots a previously server-confirmed user from the local cache.
 *
 * @param session - The server-confirmed user saved by a prior successful session request.
 * @returns A resolved authenticated boot state without treating the cache as a network failure.
 */
export function cachedSessionBoot(session: UserDto): SessionBootState {
  return { session, bootError: false }
}

/**
 * Selects the local account-data update needed after a resolved server session.
 *
 * @param cachedSession - The user associated with the currently persisted local records, if any.
 * @param resolvedSession - The server-confirmed current user, or null when unauthenticated.
 * @returns The storage action that preserves account isolation before caching a new user.
 */
export function sessionCacheAction(
  cachedSession: Pick<UserDto, 'id'> | null,
  resolvedSession: UserDto | null,
): 'clear' | 'store' | 'clear-and-store' {
  if (!resolvedSession) return 'clear'
  return !cachedSession || cachedSession.id !== resolvedSession.id
    ? 'clear-and-store'
    : 'store'
}

/**
 * Persists a resolved session only while its caller's cache epoch remains current.
 *
 * @param store - The existing local-money store that owns all cache records.
 * @param session - The server-confirmed user, or null after confirmed unauthentication.
 * @param isCurrent - Epoch guard that prevents stale asynchronous work from writing local data.
 * @returns Whether this epoch safely owns a persisted session for later transport fallback.
 */
export async function persistSessionCache(
  store: Pick<
    MoneyStore,
    'getCachedSession' | 'setCachedSession' | 'clearAccountData'
  >,
  session: UserDto | null,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (!isCurrent()) return false
  if (!session) {
    await store.clearAccountData()
    return false
  }
  const action = sessionCacheAction(await store.getCachedSession(), session)
  if (!isCurrent()) return false
  if (action === 'clear-and-store') await store.clearAccountData()
  if (!isCurrent()) return false
  await store.setCachedSession(session)
  return isCurrent()
}

/**
 * Records a failed current-user request without treating it as a logout.
 *
 * @returns A retryable error state that preserves the pending session value.
 */
export function failedSessionBoot(): SessionBootState {
  return { session: undefined, bootError: true }
}
