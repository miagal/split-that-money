// Verifies when the PWA should ask its service worker to check for an update.
import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldCheckForPwaUpdate } from './pwa-update-rules.ts'

test('checks only while the app is online and visible', () => {
  assert.equal(
    shouldCheckForPwaUpdate({ online: true, visibilityState: 'visible' }),
    true,
  )
  assert.equal(
    shouldCheckForPwaUpdate({ online: false, visibilityState: 'visible' }),
    false,
  )
  assert.equal(
    shouldCheckForPwaUpdate({ online: true, visibilityState: 'hidden' }),
    false,
  )
})
