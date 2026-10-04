// Verifies the account-menu interaction decisions independently of browser rendering.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  syncPresentation,
  shouldCloseAccountMenu,
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
    label: 'Changes waiting to sync',
    tone: 'warning',
    icon: 'upload',
  })
  assert.deepEqual(syncPresentation('Server not reachable'), {
    label: 'Server not reachable',
    tone: 'muted',
    icon: 'cloud-off',
  })
  assert.deepEqual(syncPresentation('Needs attention'), {
    label: 'Needs attention',
    tone: 'danger',
    icon: 'warning',
  })
})
