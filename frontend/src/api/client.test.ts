// Verifies API transport applies CSRF, error contracts, and transport-failure classification before feature code sees a response.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ApiClient,
  ApiError,
  isNotAuthenticated,
  isTransportFailure,
} from './client.ts'

test('preflights unsafe writes, sends the CSRF token with credentials, and accepts 204 responses', async () => {
  const originalFetch = globalThis.fetch
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  )
  const calls: Array<{ path: string; init: RequestInit | undefined }> = []

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { cookie: 'stm_csrftoken=safe%20token' },
  })
  globalThis.fetch = (async (
    path: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ path: String(path), init })
    return new Response(null, {
      status: path === '/api/config/public/' ? 200 : 204,
    })
  }) as typeof fetch

  try {
    const result = await new ApiClient().request<void>('/groups/group-id/', {
      method: 'DELETE',
    })

    assert.equal(result, undefined)
    assert.deepEqual(
      calls.map(({ path, init }) => ({ path, credentials: init?.credentials })),
      [
        { path: '/api/config/public/', credentials: 'include' },
        { path: '/api/groups/group-id/', credentials: 'include' },
      ],
    )
    assert.equal(
      new Headers(calls[1].init?.headers).get('X-CSRFToken'),
      'safe token',
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalDocument)
      Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('maps backend error payloads to ApiError', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 'invalid_amount',
        message: 'Amount must be positive.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch

  try {
    await assert.rejects(
      new ApiClient().request('groups/'),
      (error: unknown) =>
        error instanceof ApiError &&
        error.code === 'invalid_amount' &&
        error.message === 'Amount must be positive.' &&
        error.status === 400,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('abandons an unsafe request when its auth epoch changes during CSRF preflight', async () => {
  const originalFetch = globalThis.fetch
  let resolvePreflight: ((response: Response) => void) | undefined
  const calls: string[] = []
  let current = true
  globalThis.fetch = ((path: string | URL | Request) => {
    calls.push(String(path))
    if (String(path) === '/api/config/public/')
      return new Promise<Response>((resolve) => {
        resolvePreflight = resolve
      })
    return Promise.resolve(new Response(null, { status: 204 }))
  }) as typeof fetch

  try {
    const request = new ApiClient().request<void>(
      'groups/group-id/',
      { method: 'DELETE' },
      () => current,
    )
    current = false
    resolvePreflight?.(new Response(null, { status: 200 }))

    await assert.rejects(request, /auth epoch/i)
    assert.deepEqual(calls, ['/api/config/public/'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('treats fetch TypeError as transport failure', () => {
  assert.equal(isTransportFailure(new TypeError('Failed to fetch')), true)
})

test('treats abort and timeout DOMExceptions as transport failure', () => {
  assert.equal(
    isTransportFailure(new DOMException('Aborted', 'AbortError')),
    true,
  )
  assert.equal(
    isTransportFailure(new DOMException('Timed out', 'TimeoutError')),
    true,
  )
})

test('rejects ordinary errors as transport failure', () => {
  assert.equal(isTransportFailure(new Error('nope')), false)
  assert.equal(isTransportFailure(new SyntaxError('bad json')), false)
})

test('recognizes only a missing session as not authenticated', () => {
  assert.equal(
    isNotAuthenticated(new ApiError(401, 'not_authenticated', 'Sign in.')),
    true,
  )
  assert.equal(
    isNotAuthenticated(new ApiError(403, 'not_authenticated', 'Sign in.')),
    true,
  )
  assert.equal(
    isNotAuthenticated(new ApiError(403, 'csrf_failed', 'CSRF failed.')),
    false,
  )
  assert.equal(
    isNotAuthenticated(new ApiError(500, 'server_error', 'Boom.')),
    false,
  )
  assert.equal(isNotAuthenticated(new TypeError('Failed to fetch')), false)
})
