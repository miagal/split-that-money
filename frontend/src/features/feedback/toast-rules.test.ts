import assert from 'node:assert/strict'
import test from 'node:test'
import { addToast, nextRemaining, timeoutFor } from './toast-rules.ts'

test('pauses only the hovered error toast', () => {
  const toasts = addToast([], 'error', 'Could not save changes.', 8_000)

  assert.equal(nextRemaining(toasts[0], 2_000, true), 8_000)
  assert.equal(nextRemaining(toasts[0], 2_000, false), 6_000)
})

test('uses the agreed timeout for each toast kind', () => {
  assert.equal(timeoutFor('success'), 5_000)
  assert.equal(timeoutFor('info'), 5_000)
  assert.equal(timeoutFor('error'), 8_000)
})

test('stacks a new toast above existing notifications', () => {
  const first = addToast([], 'info', 'First', 5_000, 'first')
  const stacked = addToast(first, 'success', 'Second', 5_000, 'second')

  assert.deepEqual(
    stacked.map(({ id }) => id),
    ['second', 'first'],
  )
})

test('does not let a timer become negative', () => {
  const [toast] = addToast([], 'success', 'Saved', 5_000)

  assert.equal(nextRemaining(toast, 6_000, false), 0)
})
