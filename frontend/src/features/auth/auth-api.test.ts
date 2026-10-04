// Verifies session adaptation distinguishes expected authentication failures from retryable transport failures.
import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, isTransportFailure } from '../../api/client.ts'
import { getSession, logout } from './auth-api.ts'

test('returns null for a structured unauthenticated session response', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 'not_authenticated',
        message: 'Authentication credentials were not provided.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch

  try {
    assert.equal(await getSession(), null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('treats a missing logout session as confirmed and still throws other failures', async () => {
  const originalFetch = globalThis.fetch

  const respond = (status: number, code: string) => {
    globalThis.fetch = (async (path: string) => {
      if (String(path) === '/api/config/public/')
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      return new Response(JSON.stringify({ code, message: code }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
  }

  try {
    respond(401, 'not_authenticated')
    await logout()
    respond(403, 'not_authenticated')
    await logout()
    respond(401, 'request_failed')
    await logout()

    respond(500, 'server_error')
    await assert.rejects(
      logout(),
      (error: unknown) => error instanceof ApiError && error.status === 500,
    )

    respond(403, 'permission_denied')
    await assert.rejects(
      logout(),
      (error: unknown) =>
        error instanceof ApiError && error.code === 'permission_denied',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('leaves server and network session failures available for retry', async () => {
  const originalFetch = globalThis.fetch

  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          code: 'server_error',
          message: 'Something went wrong.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch
    await assert.rejects(
      getSession(),
      (error: unknown) => error instanceof ApiError && error.status === 500,
    )

    globalThis.fetch = (async () => {
      throw new TypeError('Network unavailable')
    }) as typeof fetch
    await assert.rejects(getSession(), {
      name: 'TypeError',
      message: 'Network unavailable',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test(
  'getSession aborts when timeoutMs elapses',
  { timeout: 1000 },
  async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async (_input, init) =>
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(
            init.signal?.reason ??
              new DOMException('Timed out', 'TimeoutError'),
          ),
        )
      })) as typeof fetch
    try {
      await assert.rejects(
        () => getSession({ timeoutMs: 20 }),
        (error: unknown) => isTransportFailure(error),
      )
    } finally {
      globalThis.fetch = original
    }
  },
)
