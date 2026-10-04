// Encapsulates API transport (including abort and timeout), CSRF setup, and backend error normalization for feature adapters.
import type { ApiErrorPayload } from './contracts.ts'

/** Represents a backend failure without exposing fetch or Response implementation details. */
export class ApiError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly fields?: Record<string, string[]>

  /**
   * Creates an application-level API error.
   *
   * @param status - HTTP status from the failed response.
   * @param code - Stable backend error code, or a local fallback for malformed failures.
   * @param message - User-safe error description from the backend or a generic fallback.
   * @param fields - Optional field-specific messages for inline form feedback.
   */
  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message)
    this.code = code
    this.status = status
    this.fields = fields
    this.name = 'ApiError'
  }

  /**
   * Converts a failed HTTP response into the API error exposed to feature code.
   *
   * @param response - Failed response whose JSON body may contain the backend error contract.
   * @returns A normalized error with only code and message fields.
   */
  static async from(response: Response): Promise<ApiError> {
    const payload = (await response
      .json()
      .catch((): null => null)) as ApiErrorPayload | null
    if (
      payload &&
      typeof payload.code === 'string' &&
      typeof payload.message === 'string'
    ) {
      return new ApiError(
        response.status,
        payload.code,
        payload.message,
        payload.fields,
      )
    }
    return new ApiError(
      response.status,
      'request_failed',
      `Request failed with status ${response.status}.`,
    )
  }
}

/**
 * Identifies the fetch-level failures that may safely use already persisted offline data.
 *
 * Abort and timeout count here so a bounded session-boot request can use the same
 * offline restore path as a dropped connection.
 *
 * @param error - An error emitted while making an API request.
 * @returns True for a fetch TypeError, or for a DOMException named AbortError or TimeoutError.
 */
export function isTransportFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  )
}

/**
 * Identifies a backend answer that says the session is missing or expired.
 *
 * Status alone is not enough: a CSRF failure is also HTTP 403.
 *
 * @param error - An error emitted while making an API request.
 * @returns True for HTTP 401, or HTTP 403 with code `not_authenticated`.
 */
export function isNotAuthenticated(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 401 ||
      (error.status === 403 && error.code === 'not_authenticated'))
  )
}

/** Marks a request that became unsafe to continue after its authenticated account changed. */
export class AuthEpochError extends Error {
  constructor() {
    super('The auth epoch changed while the request was pending.')
    this.name = 'AuthEpochError'
  }
}

/** Issues same-origin API requests with Django's required CSRF cookie and header handling. */
export class ApiClient {
  /**
   * Requests one API resource and returns only its decoded payload to feature adapters.
   *
   * @param path - API path relative to `/api/`.
   * @param init - Standard fetch options for the request.
   * @param isCurrent - Returns whether the caller still owns the authenticated account epoch.
   * @returns The decoded JSON payload, or undefined for an empty 204 response.
   * @throws {ApiError} When the backend returns a non-success response.
   */
  async request<T>(
    path: string,
    init: RequestInit = {},
    isCurrent: () => boolean = () => true,
  ): Promise<T> {
    assertCurrent(isCurrent)
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers)

    if (isUnsafeMethod(method)) {
      await this.ensureCsrfCookie(isCurrent)
      assertCurrent(isCurrent)
      const token = readCookie('stm_csrftoken')
      if (token) headers.set('X-CSRFToken', token)
    }

    assertCurrent(isCurrent)
    const response = await fetch(`/api/${path.replace(/^\/+/, '')}`, {
      ...init,
      credentials: 'include',
      headers,
    })
    assertCurrent(isCurrent)
    if (!response.ok) throw await ApiError.from(response)
    if (response.status === 204) return undefined as T
    const result = (await response.json()) as T
    assertCurrent(isCurrent)
    return result
  }

  /** Obtains Django's CSRF cookie from the public configuration endpoint before a write. */
  private async ensureCsrfCookie(isCurrent: () => boolean): Promise<void> {
    assertCurrent(isCurrent)
    const response = await fetch('/api/config/public/', {
      credentials: 'include',
    })
    assertCurrent(isCurrent)
    if (!response.ok) throw await ApiError.from(response)
  }
}

/** Fails closed before a stale operation can issue or consume an authenticated request. */
function assertCurrent(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new AuthEpochError()
}

/**
 * Returns whether an HTTP method changes server state and therefore needs a CSRF token.
 *
 * @param method - Uppercase HTTP method name.
 * @returns True for Django-protected write methods.
 */
function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)
}

/**
 * Reads a browser cookie by name without making cookie access part of any page contract.
 *
 * @param name - Cookie name to locate.
 * @returns The decoded cookie value, or null outside a browser or when absent.
 */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  const cookie = document.cookie
    .split('; ')
    .find((value) => value.startsWith(prefix))
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null
}
