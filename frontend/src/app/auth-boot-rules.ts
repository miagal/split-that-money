// Pure session-boot rules for network bounds, server-session classification, and cached-account labels.
import type { UserDto } from '../api/contracts.ts'

/** Milliseconds to wait for auth/me during session boot before treating the network as failed. */
export const SESSION_BOOT_TIMEOUT_MS = 3000

/**
 * Classifies the background server check against the account already shown from cache.
 *
 * @param cached - The account already shown from the local cache, if any.
 * @param server - The user returned by the current-user request, or null when that session is gone.
 * @returns `expired` keeps the cached account, `switch` replaces it, `same` refreshes it, `none` shows login.
 */
export function serverSessionOutcome(
  cached: Pick<UserDto, 'id'> | null,
  server: Pick<UserDto, 'id'> | null,
): 'expired' | 'same' | 'switch' | 'none' {
  if (!server) return cached ? 'expired' : 'none'
  return cached?.id === server.id ? 'same' : 'switch'
}

/**
 * Prevents signing in as another account while the cached account still has unsynced changes.
 *
 * @param cachedEmail - Email of the account already stored on this device.
 * @param pendingChanges - Unsynced changes that a switch would discard.
 * @param email - Email the person is trying to sign in with.
 * @returns True only when the emails differ and pending changes would be lost.
 */
export function blocksAccountSwitch(
  cachedEmail: string | undefined,
  pendingChanges: number,
  email: string,
): boolean {
  return (
    Boolean(cachedEmail) &&
    pendingChanges > 0 &&
    cachedEmail!.trim().toLowerCase() !== email.trim().toLowerCase()
  )
}

/**
 * Labels the continue action with the person's first name when one is stored.
 *
 * @param user - The cached identity shown on the resume card.
 * @returns The primary button label.
 */
export function continueAsLabel(
  user: Pick<UserDto, 'first_name' | 'display_name'>,
): string {
  return `Continue as ${user.first_name.trim() || user.display_name}`
}
