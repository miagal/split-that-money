import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LIVE_SHELL_PARAM,
  NAVIGATION_NETWORK_TIMEOUT_MS,
  isLiveShellNavigation,
  navigationTimeoutMs,
  shouldFallbackToPrecache,
  withLiveShellFlag,
  withoutLiveShellFlag,
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

test('treats stm-live-shell=1 as a live-shell navigation', () => {
  assert.equal(LIVE_SHELL_PARAM, 'stm-live-shell')
  assert.equal(
    isLiveShellNavigation(new URL('https://example.test/groups?stm-live-shell=1')),
    true,
  )
  assert.equal(
    isLiveShellNavigation(new URL('https://example.test/groups')),
    false,
  )
  assert.equal(
    isLiveShellNavigation(new URL('https://example.test/groups?stm-live-shell=0')),
    false,
  )
})

test('adds and removes the live-shell flag without dropping other query params or hash', () => {
  assert.equal(
    withLiveShellFlag('https://example.test/groups?tab=1#top'),
    '/groups?tab=1&stm-live-shell=1#top',
  )
  assert.equal(
    withoutLiveShellFlag('/groups?tab=1&stm-live-shell=1#top'),
    '/groups?tab=1#top',
  )
  assert.equal(withoutLiveShellFlag('/groups'), '/groups')
})
