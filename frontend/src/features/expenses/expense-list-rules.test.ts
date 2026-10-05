// Verifies bounded progressive rendering for the expense list.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXPENSE_PAGE_SIZE,
  expenseListEntryClass,
  expenseListState,
  nextVisibleExpenseCount,
  sortExpensesForList,
} from './expense-list-rules.ts'

test('starts with 20 expenses and appends one bounded page at a time', () => {
  assert.equal(EXPENSE_PAGE_SIZE, 20)
  assert.equal(nextVisibleExpenseCount(20, 100), 40)
  assert.equal(nextVisibleExpenseCount(80, 100), 100)
  assert.equal(nextVisibleExpenseCount(20, 27), 27)
})

test('adds the entry animation only after the initial local list load', () => {
  assert.equal(expenseListEntryClass(false), '')
  assert.equal(expenseListEntryClass(true), 'list-enter')
})

test('withholds the empty-state copy until the initial local read resolves', () => {
  assert.equal(expenseListState(false, 0), 'loading')
  assert.equal(expenseListState(true, 0), 'empty')
  assert.equal(expenseListState(true, 1), 'items')
})

test('sorts expenses by date, then updated_at on the same day', () => {
  const olderDay = {
    id: 'older-day',
    date: '2026-04-01',
    updated_at: '2026-04-05T12:00:00.000Z',
  }
  const sameDayEarlier = {
    id: 'same-day-earlier',
    date: '2026-04-02',
    updated_at: '2026-04-02T08:00:00.000Z',
  }
  const sameDayLater = {
    id: 'same-day-later',
    date: '2026-04-02',
    updated_at: '2026-04-02T18:00:00.000Z',
  }

  assert.deepEqual(
    sortExpensesForList([olderDay, sameDayEarlier, sameDayLater]).map(
      (expense) => expense.id,
    ),
    ['same-day-later', 'same-day-earlier', 'older-day'],
  )
})
