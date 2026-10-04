// Covers pure expense grouping, display labels, and selected-callout state transitions.
import assert from 'node:assert/strict'
import test from 'node:test'
import type { ExpenseDto } from '../../api/contracts.ts'
import {
  displayCategory,
  groupByIcon,
  groupByPayer,
  insightInitials,
  insightListRowClass,
  nextSelectedInsightKey,
} from './insights.ts'

const expense = (overrides: Partial<ExpenseDto>): ExpenseDto => ({
  id: crypto.randomUUID(),
  title: 'Test',
  amount_cents: 100,
  date: '2026-09-20',
  payer: 'user-a',
  split_type: 'equal',
  icon: null,
  note: '',
  shares: [],
  created_by: 'user-a',
  created_at: '',
  updated_by: 'user-a',
  updated_at: '',
  deleted: false,
  created_on_device: null,
  ...overrides,
})

test('groups icon totals and puts no-icon expenses in Other', () => {
  assert.deepEqual(
    groupByIcon([
      expense({ icon: null, amount_cents: 230 }),
      expense({ icon: 'coffee', amount_cents: 170 }),
    ]),
    [
      { key: 'coffee', amountCents: 170 },
      { key: 'other', amountCents: 230 },
    ],
  )
})

test('excludes tombstones and groups all non-deleted expenses by payer', () => {
  assert.deepEqual(
    groupByPayer([
      expense({ payer: 'user-a', amount_cents: 230 }),
      expense({ payer: 'user-a', amount_cents: 170 }),
      expense({ payer: 'user-b', amount_cents: 50 }),
      expense({ payer: 'user-b', amount_cents: 999, deleted: true }),
    ]),
    [
      { key: 'user-a', amountCents: 400 },
      { key: 'user-b', amountCents: 50 },
    ],
  )
})

test('display category maps every persisted expense icon without changing its key', () => {
  assert.equal(displayCategory('utensils-crossed'), 'Food & drinks')
  assert.equal(displayCategory('coffee'), 'Coffee')
  assert.equal(displayCategory('shopping-basket'), 'Shopping')
  assert.equal(displayCategory('car-front'), 'Transport')
  assert.equal(displayCategory('ticket'), 'Tickets & events')
  assert.equal(displayCategory('bed-double'), 'Accommodation')
  assert.equal(displayCategory('party-popper'), 'Entertainment')
  assert.equal(displayCategory('other'), 'Other')
  assert.equal(displayCategory(null), 'Other')
})

test('selected insight clears the active segment and replaces it for another segment', () => {
  assert.equal(nextSelectedInsightKey(null, 'coffee'), 'coffee')
  assert.equal(nextSelectedInsightKey('coffee', 'coffee'), null)
  assert.equal(nextSelectedInsightKey('coffee', 'car-front'), 'car-front')
})

test('uses equal-height list rows for person and category insights', () => {
  assert.equal(insightListRowClass(), 'flex items-center gap-3 px-3 py-2.5')
})

test('derives person-marker initials from first and last names', () => {
  assert.equal(insightInitials('Ada', 'Lovelace'), 'AL')
  assert.equal(insightInitials('', ''), '?')
})
