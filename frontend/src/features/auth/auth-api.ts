// Adapts session and public-config endpoints to the authentication feature's small contract.
import {
  ApiClient,
  ApiError,
  isNotAuthenticated,
  isServerUnreachable,
} from '../../api/client.ts'
import type {
  LoginDto,
  PublicConfigDto,
  RegisterDto,
  UserDto,
} from '../../api/contracts.ts'

const client = new ApiClient()

/**
 * Reads the active browser session, translating an expected missing session into null.
 *
 * Pass `timeoutMs` when the caller must not wait forever. Login and public config stay unbounded.
 *
 * @param options - Optional abort bound. When `timeoutMs` is set, `auth/me` stops after that many milliseconds.
 * @returns The signed-in user or null when no Django session exists.
 * @throws {ApiError} When the current-user request fails for a reason other than missing authentication.
 * @throws {DOMException} When `timeoutMs` elapses before the session response arrives.
 */
export async function getSession(options?: {
  timeoutMs?: number
}): Promise<UserDto | null> {
  try {
    const init: RequestInit =
      options?.timeoutMs != null
        ? { signal: AbortSignal.timeout(options.timeoutMs) }
        : {}
    return await client.request<UserDto>('auth/me/', init)
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    )
      return null
    throw error
  }
}

/**
 * Starts a Django session with email-and-password credentials.
 *
 * @param credentials - The email and password accepted by the backend login endpoint.
 * @returns The newly authenticated user.
 */
export function login(credentials: LoginDto): Promise<UserDto> {
  return client.request<UserDto>('auth/login/', jsonPost(credentials))
}

/**
 * Creates a self-registered account when the server feature flag allows it.
 *
 * @param registration - The public account fields accepted by the backend register endpoint.
 * @returns The newly created user, who must still sign in separately.
 */
export function register(registration: RegisterDto): Promise<UserDto> {
  return client.request<UserDto>('auth/register/', jsonPost(registration))
}

/**
 * Ends the active Django session.
 *
 * HTTP 401, and HTTP 403 for a missing session, resolve as a confirmed logout.
 * CSRF is also HTTP 403 and still rejects, as do HTTP 500 and every other error.
 *
 * @param options - Optional abort bound. When `timeoutMs` is set, `auth/logout` stops after that many milliseconds.
 * @returns A promise resolved after the backend confirms logout, including when the session is already gone.
 * @throws {ApiError} When logout fails for a reason other than a missing session.
 * @throws {DOMException} When `timeoutMs` elapses before the logout response arrives.
 */
export async function logout(options?: { timeoutMs?: number }): Promise<void> {
  try {
    const init: RequestInit =
      options?.timeoutMs != null
        ? { method: 'POST', signal: AbortSignal.timeout(options.timeoutMs) }
        : { method: 'POST' }
    await client.request<void>('auth/logout/', init)
  } catch (error) {
    if (isNotAuthenticated(error)) return
    throw error
  }
}

const PUBLIC_CONFIG_KEY = 'split-that-money-public-config'

/**
 * Reads the last stored public config without waiting for the network.
 *
 * @returns The stored copy, or null when storage is missing or unreadable.
 */
export function readStoredPublicConfig(): PublicConfigDto | null {
  try {
    const stored = localStorage.getItem(PUBLIC_CONFIG_KEY)
    if (!stored) return null
    return JSON.parse(stored) as PublicConfigDto
  } catch {
    return null
  }
}

let publicConfigInFlight: Promise<PublicConfigDto> | null = null

/**
 * Reads public feature flags, falling back to the last stored copy while the server is unreachable.
 *
 * Concurrent callers share one request so cache writes and live updates stay in lockstep.
 *
 * @returns The server-controlled public configuration.
 * @throws {ApiError} When the server answers with a real error, or is unreachable with no stored copy.
 */
export function getPublicConfig(): Promise<PublicConfigDto> {
  publicConfigInFlight ??= loadPublicConfig().finally(() => {
    publicConfigInFlight = null
  })
  return publicConfigInFlight
}

/** Fetches public config once and stores it when the server answers. */
async function loadPublicConfig(): Promise<PublicConfigDto> {
  try {
    const config = await client.request<PublicConfigDto>('config/public/')
    try {
      localStorage.setItem(PUBLIC_CONFIG_KEY, JSON.stringify(config))
    } catch {
      // Without storage the next unreachable start simply has no fallback.
    }
    return config
  } catch (error) {
    if (isServerUnreachable(error)) {
      const stored = readStoredPublicConfig()
      if (stored) return stored
    }
    throw error
  }
}

/**
 * Serializes an auth request with the JSON headers Django REST Framework expects.
 *
 * @param body - A supported authentication request payload.
 * @returns Fetch options for the shared API client.
 */
function jsonPost(body: LoginDto | RegisterDto): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
