import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeBalances,
  prioritizeTransfersForUser,
  settlementDialogResetKey,
  settlementFormDefaults,
  suggestTransfers,
  toSettlementUpsert,
} from './balances.ts'

test('computes expense balances and excludes deleted records', () => {
  const expense = {
    payer: 'a',
    amount_cents: 900,
    shares: [
      { user: 'a', amount_cents: 300 },
      { user: 'b', amount_cents: 600 },
    ],
    deleted: false,
  } as unknown as import('../../api/contracts.ts').ExpenseDto
  const deleted = { ...expense, payer: 'b', deleted: true }
  assert.deepEqual(computeBalances([expense, deleted], []), { a: 600, b: -600 })
})

test('applies settlements with from-user credit semantics', () => {
  const settlement = {
    from_user: 'a',
    to_user: 'b',
    amount_cents: 200,
    deleted: false,
  } as unknown as import('../../api/contracts.ts').SettlementDto
  assert.deepEqual(computeBalances([], [settlement]), { a: 200, b: -200 })
})

test('suggests stable greedy transfers', () => {
  assert.deepEqual(suggestTransfers({ a: -500, b: 200, c: 300 }), [
    { fromUserId: 'a', toUserId: 'c', amountCents: 300 },
    { fromUserId: 'a', toUserId: 'b', amountCents: 200 },
  ])
})

test('pins current-user transfers first, outgoing before incoming', () => {
  const transfers = [
    { fromUserId: 'a', toUserId: 'b', amountCents: 100 },
    { fromUserId: 'c', toUserId: 'me', amountCents: 50 },
    { fromUserId: 'me', toUserId: 'a', amountCents: 80 },
    { fromUserId: 'b', toUserId: 'c', amountCents: 20 },
    { fromUserId: 'me', toUserId: 'c', amountCents: 40 },
  ]
  assert.deepEqual(prioritizeTransfersForUser(transfers, 'me'), [
    { fromUserId: 'me', toUserId: 'a', amountCents: 80 },
    { fromUserId: 'me', toUserId: 'c', amountCents: 40 },
    { fromUserId: 'c', toUserId: 'me', amountCents: 50 },
    { fromUserId: 'a', toUserId: 'b', amountCents: 100 },
    { fromUserId: 'b', toUserId: 'c', amountCents: 20 },
  ])
  assert.deepEqual(prioritizeTransfersForUser(transfers, undefined), transfers)
})

test('chooses settlement defaults from the latest dialog inputs', () => {
  assert.deepEqual(
    settlementFormDefaults(['alice', 'bob'], undefined, undefined, 'alice'),
    { from: 'alice', to: 'bob' },
  )
  assert.deepEqual(
    settlementFormDefaults(['alice', 'bob'], 'bob', 'alice', 'alice'),
    { from: 'bob', to: 'alice' },
  )
})

test('resets settlement fields on each open cycle and changed open inputs', () => {
  const closed = settlementDialogResetKey(
    false,
    ['alice', 'bob'],
    'alice',
    'bob',
    'alice',
  )
  const opened = settlementDialogResetKey(
    true,
    ['alice', 'bob'],
    'alice',
    'bob',
    'alice',
  )
  const changedMembers = settlementDialogResetKey(
    true,
    ['alice', 'bob', 'carol'],
    'alice',
    'bob',
    'alice',
  )
  const editing = settlementDialogResetKey(
    true,
    ['alice', 'bob'],
    'alice',
    'bob',
    'alice',
    'settlement-1',
    500,
  )

  assert.equal(closed, null)
  assert.notEqual(opened, closed)
  assert.notEqual(changedMembers, opened)
  assert.notEqual(editing, opened)
  assert.equal(
    settlementDialogResetKey(true, ['alice', 'bob'], 'alice', 'bob', 'alice'),
    opened,
  )
})

test('preserves settlement identity fields when building an edit upsert', () => {
  const session = { id: 'editor' } as import('../../api/contracts.ts').UserDto
  const payload = toSettlementUpsert(
    {
      id: 'settlement-1',
      createdBy: 'original',
      createdAt: '2026-09-01T08:30:00Z',
      createdOnDevice: 'device-1',
      fromUser: 'alice',
      toUser: 'bob',
      amountCents: 1250,
    },
    session,
    'group-1',
  )
  assert.equal(payload.id, 'settlement-1')
  assert.equal(payload.created_by, 'original')
  assert.equal(payload.created_at, '2026-09-01T08:30:00Z')
  assert.equal(payload.created_on_device, 'device-1')
  assert.equal(payload.from_user, 'alice')
  assert.equal(payload.to_user, 'bob')
  assert.equal(payload.amount_cents, 1250)
  assert.notEqual(payload.updated_at, payload.created_at)
})
