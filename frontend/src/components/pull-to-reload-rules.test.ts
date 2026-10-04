// Verifies when a touch pull at the top of the app scroll region is ready to reload.
import assert from 'node:assert/strict'
import test from 'node:test'
import { pullToReloadState, shouldPreventPull } from './pull-to-reload-rules.ts'

test('arms only after a downward pull at the top of the scroll region', () => {
  assert.equal(
    pullToReloadState({
      startY: 100,
      currentY: 171,
      scrollTop: 0,
      threshold: 72,
    }),
    'pulling',
  )
  assert.equal(
    pullToReloadState({
      startY: 100,
      currentY: 172,
      scrollTop: 0,
      threshold: 72,
    }),
    'ready',
  )
  assert.equal(
    pullToReloadState({
      startY: 100,
      currentY: 220,
      scrollTop: 1,
      threshold: 72,
    }),
    'idle',
  )
  assert.equal(
    pullToReloadState({
      startY: 200,
      currentY: 100,
      scrollTop: 0,
      threshold: 72,
    }),
    'idle',
  )
})

test('prevents native panning only for a downward pull that started at the top', () => {
  assert.equal(
    shouldPreventPull({
      startY: 100,
      currentY: 110,
      startScrollTop: 0,
      scrollTop: 0,
    }),
    true,
  )
  assert.equal(
    shouldPreventPull({
      startY: 100,
      currentY: 110,
      startScrollTop: 1,
      scrollTop: 0,
    }),
    false,
  )
  assert.equal(
    shouldPreventPull({
      startY: 100,
      currentY: 110,
      startScrollTop: 0,
      scrollTop: 1,
    }),
    false,
  )
  assert.equal(
    shouldPreventPull({
      startY: 100,
      currentY: 90,
      startScrollTop: 0,
      scrollTop: 0,
    }),
    false,
  )
  assert.equal(
    pullToReloadState({
      startY: 100,
      currentY: 172,
      startScrollTop: 1,
      scrollTop: 0,
      threshold: 72,
    }),
    'idle',
  )
})
