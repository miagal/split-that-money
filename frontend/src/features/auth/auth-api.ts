// Adapts session and public-config endpoints to the authentication feature's small contract.
import { ApiClient, ApiError, isNotAuthenticated } from '../../api/client.ts'
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

/**
 * Reads public feature flags from the backend's real configuration endpoint.
 *
 * @returns The server-controlled public configuration.
 */
export function getPublicConfig(): Promise<PublicConfigDto> {
  return client.request<PublicConfigDto>('config/public/')
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
