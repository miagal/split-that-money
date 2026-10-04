// Verifies how sync facts become the one visible sync status and how failures are classified.
import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError } from '../../api/client.ts'
import type { MoneyStore } from './database.ts'
import { EPOCH_CURSOR } from './database.ts'
import {
  canStartInitialGroupSync,
  createSyncStatusController,
  nextCursor,
  SYNC_REQUEST_TIMEOUT_MS,
  syncGroup,
  syncRequestTimeoutMs,
  syncStatus,
} from './sync.ts'

const emptyPull = { expenses: [], settlements: [] }

function fakeStore(overrides: Record<string, unknown> = {}): MoneyStore {
  return {
    getCursor: async () => EPOCH_CURSOR,
    mergeExpenses: async () => undefined,
    mergeSettlements: async () => undefined,
    setCursor: async () => undefined,
    listPending: async () => [],
    pendingCount: async () => 0,
    attentionCount: async () => 0,
    enqueueMutation: async () => 1,
    ...overrides,
  } as never
}

function setBrowserOnline(onLine: boolean): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine },
  })
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('bounds one hung sync request at eight seconds by default', () => {
  assert.equal(SYNC_REQUEST_TIMEOUT_MS, 8_000)
  assert.equal(syncRequestTimeoutMs(undefined), 8_000)
  assert.equal(syncRequestTimeoutMs(12), 12_000)
  assert.equal(syncRequestTimeoutMs(0), 8_000)
})

test('defers initial group hydration until the provider is ready', () => {
  assert.equal(canStartInitialGroupSync('group-1', false), false)
  assert.equal(canStartInitialGroupSync('group-1', true), true)
  assert.equal(canStartInitialGroupSync('', true), false)
})

test('advances the cursor to the greatest received timestamp', () => {
  assert.equal(
    nextCursor('2026-09-19T10:00:00Z', ['2026-09-19T10:01:00Z']),
    '2026-09-19T10:01:00Z',
  )
})

test('derives one visible status with syncing first and synced last', () => {
  const idle = {
    syncing: false,
    unreachable: false,
    localError: false,
    attention: 0,
    pending: 0,
  }
  assert.equal(syncStatus(idle), 'Synced')
  assert.equal(syncStatus({ ...idle, pending: 2 }), 'Changes waiting to sync')
  assert.equal(
    syncStatus({ ...idle, pending: 2, unreachable: true }),
    'Server not reachable',
  )
  assert.equal(
    syncStatus({ ...idle, unreachable: true, attention: 1 }),
    'Needs attention',
  )
  assert.equal(syncStatus({ ...idle, localError: true }), 'Needs attention')
  assert.equal(syncStatus({ ...idle, attention: 1, syncing: true }), 'Syncing')
})

test('shows syncing during a sync and synced after it', async () => {
  setBrowserOnline(true)
  const controller = createSyncStatusController(fakeStore(), {
    request: async () => emptyPull,
  } as never)
  const operation = controller.sync('group-1')
  assert.equal(controller.getSnapshot().status, 'Syncing')
  await operation
  assert.equal(controller.getSnapshot().status, 'Synced')
})

test('a transport failure shows the server as not reachable until a sync succeeds', async () => {
  setBrowserOnline(true)
  let fail = true
  const client = {
    request: async () => {
      if (fail) throw new TypeError('Failed to fetch')
      return emptyPull
    },
  }
  const controller = createSyncStatusController(fakeStore(), client as never)
  await controller.sync('group-1')
  assert.equal(controller.getSnapshot().status, 'Server not reachable')
  fail = false
  await controller.sync('group-1')
  assert.equal(controller.getSnapshot().status, 'Synced')
})

test('a server error also shows the server as not reachable', async () => {
  setBrowserOnline(true)
  const client = {
    request: async () => {
      throw new ApiError(500, 'server_error', 'Boom.')
    },
  }
  const controller = createSyncStatusController(fakeStore(), client as never)
  await controller.sync('group-1')
  assert.equal(controller.getSnapshot().status, 'Server not reachable')
})

test('a missing session reports session expiry instead of a sync problem', async () => {
  setBrowserOnline(true)
  let expired = 0
  const client = {
    request: async () => {
      throw new ApiError(401, 'not_authenticated', 'Sign in.')
    },
  }
  const controller = createSyncStatusController(
    fakeStore(),
    client as never,
    () => true,
    () => {
      expired += 1
    },
  )
  await controller.sync('group-1')
  assert.equal(expired, 1)
  assert.equal(controller.getSnapshot().status, 'Synced')
})

test('a local storage failure needs attention', async () => {
  setBrowserOnline(true)
  const store = fakeStore({
    getCursor: async () => {
      throw new Error('IndexedDB failed')
    },
  })
  const controller = createSyncStatusController(store, {
    request: async () => emptyPull,
  } as never)
  await controller.sync('group-1')
  assert.equal(controller.getSnapshot().status, 'Needs attention')
})

test('conflict or error rows in the outbox need attention', async () => {
  setBrowserOnline(true)
  const store = fakeStore({
    pendingCount: async () => 1,
    attentionCount: async () => 1,
  })
  const controller = createSyncStatusController(store, {
    request: async () => emptyPull,
  } as never)
  await controller.sync('group-1')
  assert.deepEqual(controller.getSnapshot(), {
    status: 'Needs attention',
    pending: 1,
  })
})

test('waiting changes are counted in the snapshot', async () => {
  setBrowserOnline(true)
  const controller = createSyncStatusController(
    fakeStore({ pendingCount: async () => 2 }),
    {} as never,
  )
  await tick()
  assert.deepEqual(controller.getSnapshot(), {
    status: 'Changes waiting to sync',
    pending: 2,
  })
})

test('a browser without network skips the request until it is online again', async () => {
  setBrowserOnline(false)
  let requests = 0
  const client = {
    request: async () => {
      requests += 1
      return emptyPull
    },
  }
  const controller = createSyncStatusController(fakeStore(), client as never)
  controller.registerGroup('group-1')
  await controller.sync('group-1')
  assert.equal(requests, 0)
  assert.equal(controller.getSnapshot().status, 'Server not reachable')
  setBrowserOnline(true)
  await controller.online()
  assert.equal(requests, 2)
  assert.equal(controller.getSnapshot().status, 'Synced')
})

test('a background sync started by enqueue ends as synced', async () => {
  setBrowserOnline(true)
  const controller = createSyncStatusController(fakeStore(), {
    request: async () => emptyPull,
  } as never)
  const states: string[] = []
  controller.subscribe(() => states.push(controller.getSnapshot().status))
  await controller.enqueue({
    kind: 'expense',
    groupId: 'group-1',
    entityId: 'expense-1',
    payload: {} as never,
  })
  await tick()
  assert.ok(states.includes('Syncing'))
  assert.equal(states.at(-1), 'Synced')
})

test('initial group sync hydrates both local money stores and unregisters on cleanup', async () => {
  setBrowserOnline(true)
  const pulled = {
    expenses: [{ id: 'expense-1', updated_at: '2026-09-20T10:00:00Z' }],
    settlements: [{ id: 'settlement-1', updated_at: '2026-09-20T10:01:00Z' }],
  }
  const merged: string[] = []
  let requests = 0
  const store = fakeStore({
    mergeExpenses: async (_group: string, rows: Array<{ id: string }>) => {
      merged.push(...rows.map((row) => row.id))
    },
    mergeSettlements: async (_group: string, rows: Array<{ id: string }>) => {
      merged.push(...rows.map((row) => row.id))
    },
  })
  const client = {
    request: async () => {
      requests += 1
      return pulled
    },
  } as never
  const controller = createSyncStatusController(store, client)
  controller.registerGroup('group-1')
  await controller.sync('group-1')
  assert.deepEqual(merged, [
    'expense-1',
    'settlement-1',
    'expense-1',
    'settlement-1',
  ])
  controller.unregisterGroup('group-1')
  await controller.online()
  assert.equal(requests, 2)
})

test('does not merge a stale account response after its cache epoch changes', async () => {
  let current = true
  const writes: string[] = []
  const store = fakeStore({
    mergeExpenses: async () => {
      writes.push('expenses')
    },
    mergeSettlements: async () => {
      writes.push('settlements')
    },
    setCursor: async () => {
      writes.push('cursor')
    },
  })
  const client = {
    request: async () => {
      current = false
      return emptyPull
    },
  } as never
  await syncGroup(store, client, 'group-1', () => current)
  assert.deepEqual(writes, [])
})

test('a stale account epoch publishes nothing after the sync started', async () => {
  setBrowserOnline(true)
  let current = true
  const client = {
    request: async () => {
      current = false
      return emptyPull
    },
  }
  const controller = createSyncStatusController(
    fakeStore(),
    client as never,
    () => current,
  )
  await tick()
  let notifications = 0
  controller.subscribe(() => {
    notifications += 1
  })
  await controller.sync('group-1')
  assert.equal(notifications, 1)
})

test(
  'a hung sync request becomes unreachable after the request timeout',
  { timeout: 1000 },
  async () => {
    setBrowserOnline(true)
    const client = {
      request: (_path: string, init: RequestInit = {}) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'TimeoutError'))
          })
        }),
    }
    const controller = createSyncStatusController(
      fakeStore(),
      client as never,
      () => true,
      () => undefined,
      20,
    )
    await controller.sync('group-1')
    assert.equal(controller.getSnapshot().status, 'Server not reachable')
  },
)

test('does not contact the next group after the server is unreachable', async () => {
  setBrowserOnline(true)
  const calls: string[] = []
  const client = {
    request: async (path: string) => {
      calls.push(path.split('/')[1] ?? '')
      throw new TypeError('Failed to fetch')
    },
  }
  const controller = createSyncStatusController(fakeStore(), client as never)
  await Promise.all([controller.sync('a'), controller.sync('b')])
  assert.deepEqual(calls, ['a'])
  assert.equal(controller.getSnapshot().status, 'Server not reachable')
})

test('queued syncs for different groups both run, one after another', async () => {
  setBrowserOnline(true)
  const calls: string[] = []
  const client = {
    request: async (path: string) => {
      calls.push(path.split('/')[1] ?? '')
      return emptyPull
    },
  }
  const controller = createSyncStatusController(fakeStore(), client as never)
  await Promise.all([controller.sync('a'), controller.sync('b')])
  assert.deepEqual(calls, ['a', 'a', 'b', 'b'])
})

test('a group already waiting in the queue is not queued twice', async () => {
  setBrowserOnline(true)
  let pulls = 0
  const client = {
    request: async () => {
      pulls += 1
      return emptyPull
    },
  }
  const controller = createSyncStatusController(fakeStore(), client as never)
  const first = controller.sync('a')
  const waiting = controller.sync('b')
  assert.equal(controller.sync('b'), waiting)
  await Promise.all([first, waiting])
  assert.equal(pulls, 4)
})
