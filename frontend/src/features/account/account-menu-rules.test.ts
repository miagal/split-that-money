// Verifies the account-menu interaction decisions independently of browser rendering.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  shouldCloseAccountMenu,
  syncPendingLabel,
  syncPresentation,
} from './account-menu-rules.ts'

test('closes the account menu only for a pointer outside its menu and trigger', () => {
  assert.equal(
    shouldCloseAccountMenu({
      targetInsideMenu: false,
      targetInsideTrigger: false,
    }),
    true,
  )
  assert.equal(
    shouldCloseAccountMenu({
      targetInsideMenu: true,
      targetInsideTrigger: false,
    }),
    false,
  )
  assert.equal(
    shouldCloseAccountMenu({
      targetInsideMenu: false,
      targetInsideTrigger: true,
    }),
    false,
  )
})

test('uses one presentation per sync status', () => {
  assert.deepEqual(syncPresentation('Synced'), {
    label: 'Synced',
    tone: 'success',
    icon: 'check',
  })
  assert.deepEqual(syncPresentation('Syncing'), {
    label: 'Syncing',
    tone: 'warning',
    icon: 'refresh',
  })
  assert.deepEqual(syncPresentation('Changes waiting to sync'), {
    label: 'Waiting',
    tone: 'warning',
    icon: 'upload',
  })
  assert.deepEqual(syncPresentation('Server not reachable'), {
    label: 'Not reachable',
    tone: 'muted',
    icon: 'cloud-off',
  })
  assert.deepEqual(syncPresentation('Needs attention'), {
    label: 'Attention',
    tone: 'danger',
    icon: 'warning',
  })
})

test('hides the extra pending line while changes are already waiting', () => {
  assert.equal(syncPendingLabel('Changes waiting to sync', 2), null)
  assert.equal(syncPendingLabel('Synced', 0), null)
})

test('tells the user attention rows need them, not a normal wait', () => {
  assert.equal(
    syncPendingLabel('Needs attention', 1),
    '1 change needs you to sync',
  )
  assert.equal(
    syncPendingLabel('Needs attention', 2),
    '2 changes need you to sync',
  )
})

test('keeps the waiting copy for other statuses with pending rows', () => {
  assert.equal(
    syncPendingLabel('Server not reachable', 1),
    '1 change waiting to sync',
  )
  assert.equal(
    syncPendingLabel('Server not reachable', 2),
    '2 changes waiting to sync',
  )
})

