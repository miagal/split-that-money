import assert from 'node:assert/strict'
import test from 'node:test'
import {
  NAVIGATION_NETWORK_TIMEOUT_MS,
  navigationTimeoutMs,
  shouldFallbackToPrecache,
} from './sw-navigation-rules.ts'

test('uses a three-second navigation network timeout', () => {
  assert.equal(NAVIGATION_NETWORK_TIMEOUT_MS, 3000)
})

test('falls back to precache on timeout, network error, or non-OK response', () => {
  assert.equal(
    shouldFallbackToPrecache({
      timedOut: false,
      networkError: false,
      responseOk: true,
    }),
    false,
  )
  assert.equal(
    shouldFallbackToPrecache({
      timedOut: true,
      networkError: false,
      responseOk: false,
    }),
    true,
  )
  assert.equal(
    shouldFallbackToPrecache({
      timedOut: false,
      networkError: true,
      responseOk: false,
    }),
    true,
  )
  assert.equal(
    shouldFallbackToPrecache({
      timedOut: false,
      networkError: false,
      responseOk: false,
    }),
    true,
  )
})

test('uses configured shell timeout seconds and falls back for invalid values', () => {
  assert.equal(navigationTimeoutMs(5), 5000)
  assert.equal(navigationTimeoutMs(0.5), 500)
  for (const value of [undefined, null, 0, -1, 'x', Number.NaN]) {
    assert.equal(navigationTimeoutMs(value), NAVIGATION_NETWORK_TIMEOUT_MS)
  }
})
