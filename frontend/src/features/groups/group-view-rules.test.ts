import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError } from '../../api/client.ts'
import {
  currentTabLabel,
  groupErrorKind,
  balanceLabel,
  latestActivity,
  outgoingTransfersForUser,
  transfersForUser,
  isOutgoingTransferForUser,
  shouldDiscardCachedGroup,
  shouldShowGroupLoadingPlaceholder,
} from './group-view-rules.ts'

test('keeps only settlement suggestions involving the current user', () => {
  const rows = [
    { from_user_id: 'me', to_user_id: 'a', amount_cents: 100 },
    { from_user_id: 'b', to_user_id: 'c', amount_cents: 200 },
  ]
  assert.deepEqual(transfersForUser(rows, 'me'), [rows[0]])
})

test('keeps only outgoing transfer suggestions actionable for the current user', () => {
  const transfers = [
    { from_user_id: 'me', to_user_id: 'alex', amount_cents: 4630 },
    { from_user_id: 'alex', to_user_id: 'me', amount_cents: 2200 },
  ]

  assert.deepEqual(outgoingTransfersForUser(transfers, 'me'), [
    { from_user_id: 'me', to_user_id: 'alex', amount_cents: 4630 },
  ])
})

test('treats only the current user’s outgoing transfers as actionable', () => {
  assert.equal(
    isOutgoingTransferForUser(
      { from_user_id: 'me', to_user_id: 'you', amount_cents: 500 },
      'me',
    ),
    true,
  )
  assert.equal(
    isOutgoingTransferForUser(
      { from_user_id: 'you', to_user_id: 'me', amount_cents: 500 },
      'me',
    ),
    false,
  )
  assert.equal(
    isOutgoingTransferForUser(
      { from_user_id: 'me', to_user_id: 'you', amount_cents: 500 },
      undefined,
    ),
    false,
  )
})

test('uses the active group tab as the shell eyebrow', () => {
  assert.deepEqual(
    ['overview', 'expenses', 'balances', 'insights', 'settings'].map((tab) =>
      currentTabLabel(`/groups/group-a/${tab}`),
    ),
    ['Overview', 'Expenses', 'Balances', 'Insights', 'Settings'],
  )
})

test('latest activity merges non-deleted expenses and settlements by update time', () => {
  const expenses = [
    activityExpense('dinner', '2026-09-20T10:00:00Z'),
    activityExpense('lunch', '2026-09-19T10:00:00Z'),
  ]
  const settlements = [
    activitySettlement('payment', '2026-09-21T10:00:00Z'),
    {
      ...activitySettlement('deleted-payment', '2026-09-22T10:00:00Z'),
      deleted: true,
    },
  ]

  assert.deepEqual(
    latestActivity(expenses, settlements).map((item) => item.kind),
    ['settlement', 'expense', 'expense'],
  )
})

test('latest activity caps globally ordered mixed events after excluding deleted distractors', () => {
  const expenses = [
    activityExpense('expense-newest', '2026-09-24T00:00:00Z'),
    activityExpense('expense-middle', '2026-09-21T00:00:00Z'),
    activityExpense('expense-oldest', '2026-09-18T00:00:00Z'),
    {
      ...activityExpense('deleted-expense', '2026-09-26T00:00:00Z'),
      deleted: true,
    },
  ]
  const settlements = [
    activitySettlement('settlement-newest', '2026-09-25T00:00:00Z'),
    activitySettlement('settlement-middle', '2026-09-22T00:00:00Z'),
    activitySettlement('settlement-oldest', '2026-09-19T00:00:00Z'),
    {
      ...activitySettlement('deleted-settlement', '2026-09-27T00:00:00Z'),
      deleted: true,
    },
  ]

  assert.deepEqual(
    latestActivity(expenses, settlements).map((item) => item.record.id),
    [
      'settlement-newest',
      'expense-newest',
      'settlement-middle',
      'expense-middle',
      'settlement-oldest',
    ],
  )
})

test('distinguishes inaccessible, missing, and recoverable group loads', () => {
  assert.equal(groupErrorKind(404), 'missing')
  assert.equal(groupErrorKind(403), 'forbidden')
  assert.equal(groupErrorKind(403, 'not_authenticated'), 'recoverable')
  assert.equal(groupErrorKind(401), 'recoverable')
  assert.equal(groupErrorKind(503), 'recoverable')
})

test('keeps a cached group when the session expired or the server is unreachable', () => {
  assert.equal(
    shouldDiscardCachedGroup(
      new ApiError(403, 'not_authenticated', 'Authentication required.'),
    ),
    false,
  )
  assert.equal(
    shouldDiscardCachedGroup(new ApiError(401, 'not_authenticated', 'Nope.')),
    false,
  )
  assert.equal(
    shouldDiscardCachedGroup(new TypeError('Failed to fetch')),
    false,
  )
})

test('discards a cached group only when the server confirms it is forbidden or missing', () => {
  assert.equal(
    shouldDiscardCachedGroup(
      new ApiError(403, 'permission_denied', 'You do not have access.'),
    ),
    true,
  )
  assert.equal(
    shouldDiscardCachedGroup(new ApiError(404, 'not_found', 'Gone.')),
    true,
  )
})

test('keeps zero balances neutral', () => {
  assert.equal(balanceLabel(0), 'You are all settled')
})

test('shows a quiet group placeholder only before any group row is available', () => {
  assert.equal(shouldShowGroupLoadingPlaceholder(true, null), true)
  assert.equal(shouldShowGroupLoadingPlaceholder(true, { id: 'g1' }), false)
  assert.equal(shouldShowGroupLoadingPlaceholder(false, null), false)
})

function activityExpense(id: string, updated_at: string) {
  return {
    id,
    updated_at,
    deleted: false,
  } as import('../../api/contracts.ts').ExpenseDto
}

function activitySettlement(id: string, updated_at: string) {
  return {
    id,
    updated_at,
    deleted: false,
  } as import('../../api/contracts.ts').SettlementDto
}
