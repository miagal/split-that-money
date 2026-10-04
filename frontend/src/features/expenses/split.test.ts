import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSplitValue, splitValueForInput, validateSplit } from './split.ts'
import { expenseSubmitState } from './expense-submit-rules.ts'

test('distributes equal cents in stable order', () =>
  assert.deepEqual(
    validateSplit({
      mode: 'equal',
      amountCents: 10,
      participants: ['b', 'a', 'c'],
    }).amounts,
    { a: 4, b: 3, c: 3 },
  ))
test('reports exact totals in display currency', () =>
  assert.equal(
    validateSplit({ mode: 'exact', amountCents: 100, values: [40, 50] }).error,
    'Amounts add up to 0.90; expected 1.00.',
  ))
test('reports percent totals', () =>
  assert.equal(
    validateSplit({ mode: 'percent', amountCents: 100, values: [40, 50] })
      .error,
    'Percentages add up to 90%; expected 100%.',
  ))
test('initializes exact splits as currency while retaining integer cents', () => {
  assert.equal(splitValueForInput('exact', 1250), '12.50')
  assert.equal(parseSplitValue('exact', '12.50'), 1250)
  assert.equal(parseSplitValue('exact', '0'), 0)
})
test('rejects over-precise exact inputs instead of silently treating them as zero', () => {
  const parsed = parseSplitValue('exact', '1.234')

  assert.equal(parsed, null)
  assert.equal(
    validateSplit({
      mode: 'exact',
      amountCents: 100,
      participants: ['a', 'b'],
      values: [parsed ?? Number.NaN, 100],
    }).error,
    'Amounts must be non-negative whole cents.',
  )
})
test('retains whole share weights and numeric percentages', () => {
  assert.equal(splitValueForInput('shares', 2), 2)
  assert.equal(parseSplitValue('shares', '2'), 2)
  assert.equal(parseSplitValue('percent', '12.5'), 12.5)
})

test('awards equal, share and percentage remainders by sorted participant ID like the backend', () => {
  // Backend compute_split(5, mode, {b: weight, a: weight}) awards the spare cent to a.
  for (const mode of ['equal', 'shares', 'percent'] as const) {
    const values = mode === 'percent' ? [50, 50] : [1, 1]
    assert.deepEqual(
      validateSplit({ mode, amountCents: 5, participants: ['b', 'a'], values })
        .amounts,
      { a: 3, b: 2 },
    )
  }
  assert.deepEqual(
    validateSplit({
      mode: 'shares',
      amountCents: 5,
      participants: ['b', 'a'],
      values: [2, 1],
    }).amounts,
    { a: 2, b: 3 },
  )
})

test('fractional percentages block expense save inline even when they total 100', () => {
  const split = validateSplit({
    mode: 'percent',
    amountCents: 100,
    participants: ['a', 'b'],
    values: [12.5, 87.5],
  })
  const state = expenseSubmitState({
    title: 'Dinner',
    amount: '1.00',
    date: '2026-09-20',
    participantCount: 2,
    splitError: split.error,
  })
  assert.equal(state.canSubmit, false)
  assert.match(state.errors.split?.[0] ?? '', /whole/)
})
