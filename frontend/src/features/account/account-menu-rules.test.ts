// Verifies the account-menu interaction decisions independently of browser rendering.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appUpdateAvailable,
  backendIdentity,
  frontendIdentity,
  shouldCloseAccountMenu,
  syncPendingLabel,
  syncPresentation,
  versionFooterLine,
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

test('defaults missing Vite identity env to containerless local', () => {
  assert.deepEqual(frontendIdentity({}), { version: 'lcl', git: '' })
  assert.deepEqual(frontendIdentity({ VITE_APP_VERSION: '  ', VITE_APP_GIT: '  ' }), {
    version: 'lcl',
    git: '',
  })
  assert.deepEqual(
    frontendIdentity({ VITE_APP_VERSION: 'v1.2.3', VITE_APP_GIT: 'abc1234' }),
    { version: 'v1.2.3', git: 'abc1234' },
  )
})

test('treats missing or empty public APP_VERSION as unknown backend identity', () => {
  assert.equal(backendIdentity(null), null)
  assert.equal(backendIdentity({}), null)
  assert.equal(backendIdentity({ APP_VERSION: '  ', APP_GIT: 'abc1234' }), null)
  assert.deepEqual(backendIdentity({ APP_VERSION: 'v1.2.3', APP_GIT: 'abc1234' }), {
    version: 'v1.2.3',
    git: 'abc1234',
  })
  assert.deepEqual(backendIdentity({ APP_VERSION: 'lcl' }), {
    version: 'lcl',
    git: '',
  })
})

test('shows one label when frontend and backend identity match', () => {
  assert.equal(
    versionFooterLine(
      { version: 'v1.2.3', git: 'abc1234' },
      { version: 'v1.2.3', git: 'abc1234' },
    ),
    'v1.2.3',
  )
  assert.equal(
    versionFooterLine({ version: 'lcl', git: '' }, { version: 'lcl', git: '' }),
    'lcl',
  )
  assert.equal(
    versionFooterLine(
      { version: 'lcl-cntr', git: '' },
      { version: 'lcl-cntr', git: '' },
    ),
    'lcl-cntr',
  )
})

test('shows fe/be labels when version or git differs', () => {
  assert.equal(
    versionFooterLine(
      { version: 'v1.2.3', git: 'abc1234' },
      { version: 'v1.2.4', git: 'abc1234' },
    ),
    'fe: v1.2.3 / be: v1.2.4',
  )
  assert.equal(
    versionFooterLine(
      { version: 'v1.2.3', git: 'aaa1111' },
      { version: 'v1.2.3', git: 'bbb2222' },
    ),
    'fe: v1.2.3 / be: v1.2.3',
  )
  assert.equal(
    versionFooterLine(
      { version: 'lcl', git: '' },
      { version: 'lcl-cntr', git: '' },
    ),
    'fe: lcl / be: lcl-cntr',
  )
})

test('hides the footer when backend identity is unknown', () => {
  assert.equal(
    versionFooterLine({ version: 'v1.2.3', git: 'abc1234' }, null),
    null,
  )
})

test('hides the app update when live backend identity is unknown', () => {
  assert.equal(
    appUpdateAvailable({ version: 'v1.2.3', git: 'abc1234' }, null),
    false,
  )
})

test('hides the app update when live backend identity matches the bundle', () => {
  assert.equal(
    appUpdateAvailable(
      { version: 'v1.2.3', git: 'abc1234' },
      { version: 'v1.2.3', git: 'abc1234' },
    ),
    false,
  )
  assert.equal(
    appUpdateAvailable(
      { version: 'lcl-cntr', git: '' },
      { version: 'lcl-cntr', git: '' },
    ),
    false,
  )
})

test('shows the app update when live version or git differs', () => {
  assert.equal(
    appUpdateAvailable(
      { version: 'v1.2.3', git: 'abc1234' },
      { version: 'v1.2.4', git: 'abc1234' },
    ),
    true,
  )
  assert.equal(
    appUpdateAvailable(
      { version: 'v1.2.3', git: 'aaa1111' },
      { version: 'v1.2.3', git: 'bbb2222' },
    ),
    true,
  )
})

