// Verifies route decisions independently of React rendering and browser navigation.
import assert from 'node:assert/strict'
import test from 'node:test'
import { groupTabPaths } from '../features/groups/group-view-rules.ts'
import { canAccessAdmin, nextPathForSession } from './router-rules.ts'

test('redirects an unauthenticated protected route to login', () => {
  assert.equal(nextPathForSession(null, '/groups'), '/login')
})

test('allows offline setup without a session', () => {
  assert.equal(nextPathForSession(null, '/offline_setup'), '/offline_setup')
})

test('redirects an authenticated login route to groups', () => {
  assert.equal(nextPathForSession({ id: 'u' }, '/login'), '/groups')
})

test('allows the admin route only for staff or superusers', () => {
  assert.equal(canAccessAdmin(null), false)
  assert.equal(canAccessAdmin({ is_staff: false, is_superuser: false }), false)
  assert.equal(canAccessAdmin({ is_staff: true, is_superuser: false }), true)
  assert.equal(canAccessAdmin({ is_staff: false, is_superuser: true }), true)
})

test('People route is absent from the configured group child paths', () => {
  assert.deepEqual(groupTabPaths(), [
    'overview',
    'expenses',
    'balances',
    'insights',
    'settings',
  ])
})
