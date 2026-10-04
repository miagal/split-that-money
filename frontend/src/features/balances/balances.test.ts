import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeBalances,
  settlementDialogResetKey,
  settlementFormDefaults,
  suggestTransfers,
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

  assert.equal(closed, null)
  assert.notEqual(opened, closed)
  assert.notEqual(changedMembers, opened)
  assert.equal(
    settlementDialogResetKey(true, ['alice', 'bob'], 'alice', 'bob', 'alice'),
    opened,
  )
})
