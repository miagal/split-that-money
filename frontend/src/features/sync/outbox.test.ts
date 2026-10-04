// Verifies which push failures mark a single outbox row and which leave it for the next sync.
import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError } from '../../api/client.ts'
import type { OutboxRow } from './database.ts'
import { pushOutbox } from './outbox.ts'

const row = (sequence: number): OutboxRow => ({
  sequence,
  kind: 'expense',
  groupId: 'group-1',
  entityId: `expense-${sequence}`,
  payload: {} as never,
  sync_status: 'pending',
})

function outboxStore(rows: OutboxRow[]) {
  const updates: OutboxRow[] = []
  const deleted: number[] = []
  const store = {
    listPending: async () => rows,
    updateOutbox: async (next: OutboxRow) => {
      updates.push(next)
    },
    deleteOutbox: async (sequence: number) => {
      deleted.push(sequence)
    },
  }
  return { store: store as never, updates, deleted }
}

test('a transport failure leaves the row pending and ends the push', async () => {
  const { store, updates, deleted } = outboxStore([row(1), row(2)])
  let requests = 0
  const client = {
    request: async () => {
      requests += 1
      throw new TypeError('Failed to fetch')
    },
  }
  await assert.rejects(pushOutbox(store, client as never, 'group-1'), TypeError)
  assert.equal(requests, 1)
  assert.deepEqual(updates, [])
  assert.deepEqual(deleted, [])
})

test('a server error leaves the row pending and ends the push', async () => {
  const { store, updates } = outboxStore([row(1)])
  const client = {
    request: async () => {
      throw new ApiError(500, 'server_error', 'Boom.')
    },
  }
  await assert.rejects(pushOutbox(store, client as never, 'group-1'), ApiError)
  assert.deepEqual(updates, [])
})

test('a missing session leaves the row pending and ends the push', async () => {
  const { store, updates } = outboxStore([row(1)])
  const client = {
    request: async () => {
      throw new ApiError(401, 'not_authenticated', 'Sign in.')
    },
  }
  await assert.rejects(pushOutbox(store, client as never, 'group-1'), ApiError)
  assert.deepEqual(updates, [])
})

test('a rejected row is marked as error and the next row still syncs', async () => {
  const { store, updates, deleted } = outboxStore([row(1), row(2)])
  let requests = 0
  const client = {
    request: async () => {
      requests += 1
      if (requests === 1)
        throw new ApiError(400, 'invalid_split', 'Split does not add up.')
      return {
        expenses: [{ id: 'expense-2', sync_status: 'created', row: {} }],
        settlements: [],
      }
    },
  }
  await pushOutbox(store, client as never, 'group-1')
  assert.deepEqual(
    updates.map(({ sequence, sync_status, code, message }) => ({
      sequence,
      sync_status,
      code,
      message,
    })),
    [
      {
        sequence: 1,
        sync_status: 'error',
        code: 'invalid_split',
        message: 'Split does not add up.',
      },
    ],
  )
  assert.deepEqual(deleted, [2])
})

test('a conflict answer keeps the row as conflict', async () => {
  const { store, updates } = outboxStore([row(1)])
  const client = {
    request: async () => ({
      expenses: [{ id: 'expense-1', sync_status: 'conflict' }],
      settlements: [],
    }),
  }
  await pushOutbox(store, client as never, 'group-1')
  assert.deepEqual(
    updates.map(({ sync_status }) => sync_status),
    ['conflict'],
  )
})
