// Verifies which outbox rows should mark a money list item as waiting to sync.
import assert from 'node:assert/strict'
import test from 'node:test'
import { entityOutboxStatus } from './pending-marks.ts'

test('maps pending outbox rows to their entity ids for one kind', () => {
  const status = entityOutboxStatus(
    [
      {
        entityId: 'expense-1',
        kind: 'expense',
        sync_status: 'pending',
      },
      {
        entityId: 'settlement-1',
        kind: 'settlement',
        sync_status: 'pending',
      },
    ],
    'expense',
  )
  assert.deepEqual([...status], [['expense-1', 'pending']])
})

test('prefers conflict or error over pending for the same entity', () => {
  const status = entityOutboxStatus(
    [
      {
        entityId: 'expense-1',
        kind: 'expense',
        sync_status: 'pending',
      },
      {
        entityId: 'expense-1',
        kind: 'expense',
        sync_status: 'conflict',
      },
    ],
    'expense',
  )
  assert.equal(status.get('expense-1'), 'conflict')
})

test('returns an empty map when nothing is waiting for that kind', () => {
  const status = entityOutboxStatus(
    [
      {
        entityId: 'settlement-1',
        kind: 'settlement',
        sync_status: 'error',
      },
    ],
    'expense',
  )
  assert.equal(status.size, 0)
})
