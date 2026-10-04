// Verifies session-boot timing, server-session classification, and when the login page may offer a cached identity.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SESSION_BOOT_TIMEOUT_MS,
  blocksAccountSwitch,
  continueAsLabel,
  serverSessionOutcome,
} from './auth-boot-rules.ts'

test('session boot waits three seconds before aborting the network', () => {
  assert.equal(SESSION_BOOT_TIMEOUT_MS, 3000)
})

test('classifies the background session check against the cached account', () => {
  assert.equal(serverSessionOutcome({ id: 'a' }, null), 'expired')
  assert.equal(serverSessionOutcome(null, null), 'none')
  assert.equal(serverSessionOutcome({ id: 'a' }, { id: 'a' }), 'same')
  assert.equal(serverSessionOutcome({ id: 'a' }, { id: 'b' }), 'switch')
  assert.equal(serverSessionOutcome(null, { id: 'b' }), 'switch')
})

test('blocks a different account only while changes are pending', () => {
  assert.equal(
    blocksAccountSwitch('alex@example.com', 2, 'blair@example.com'),
    true,
  )
  assert.equal(
    blocksAccountSwitch('alex@example.com', 2, ' Alex@Example.com '),
    false,
  )
  assert.equal(
    blocksAccountSwitch('alex@example.com', 0, 'blair@example.com'),
    false,
  )
  assert.equal(blocksAccountSwitch(undefined, 2, 'blair@example.com'), false)
})

test('continue label prefers first name', () => {
  assert.equal(
    continueAsLabel({ first_name: 'Alex', display_name: 'Alex Example' }),
    'Continue as Alex',
  )
  assert.equal(
    continueAsLabel({ first_name: '', display_name: 'Alex Example' }),
    'Continue as Alex Example',
  )
})
