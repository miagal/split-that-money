import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addToast,
  beginExit,
  nextRemaining,
  timeoutFor,
  TOAST_EXIT_MS,
  toastCardClass,
  toastCountLabel,
  toastDismissButtonClass,
  toastTimerProgress,
  toastViewportClass,
} from './toast-rules.ts'

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

test('keeps the toast stack below the Home Screen safe area', () => {
  assert.match(
    toastViewportClass(),
    /top-\[calc\(1rem\+env\(safe-area-inset-top,0px\)\)\]/,
  )
})

test('gives the dismiss control a 44px tap target and centers short copy', () => {
  assert.match(toastCardClass(false), /\bitems-center\b/)
  assert.match(toastCardClass(false), /\bpx-4\b/)
  assert.match(toastCardClass(false), /\bpy-2\b/)
  assert.match(toastCardClass(false), /\bsm:p-4\b/)
  assert.match(toastDismissButtonClass(), /\bsize-11\b/)
  assert.match(toastDismissButtonClass(), /\brelative\b/)
})

test('maps remaining time onto a full-to-empty dismiss ring', () => {
  assert.equal(toastTimerProgress(5_000, 'info'), 1)
  assert.equal(toastTimerProgress(2_500, 'info'), 0.5)
  assert.equal(toastTimerProgress(0, 'info'), 0)
  assert.equal(toastTimerProgress(4_000, 'error'), 0.5)
})

test('collapses a repeat of the same visible toast and resets its timer', () => {
  const first = addToast([], 'info', 'Toast y', 1_000, 'same')
  const repeated = addToast(first, 'info', 'Toast y')

  assert.equal(repeated.length, 1)
  assert.equal(repeated[0]?.id, 'same')
  assert.equal(repeated[0]?.count, 2)
  assert.equal(repeated[0]?.remainingMs, timeoutFor('info'))
})

test('does not collapse a different kind or message', () => {
  const first = addToast([], 'info', 'Toast y', 5_000, 'y')
  const otherKind = addToast(first, 'error', 'Toast y', 8_000, 'y-error')
  const otherText = addToast(otherKind, 'info', 'Toast z', 5_000, 'z')

  assert.deepEqual(
    otherText.map(({ id, count }) => [id, count]),
    [
      ['z', 1],
      ['y-error', 1],
      ['y', 1],
    ],
  )
})

test('keeps a collapsed toast at the front of the stack', () => {
  const first = addToast([], 'info', 'Toast y', 5_000, 'y')
  const stacked = addToast(first, 'info', 'Toast z', 5_000, 'z')
  const collapsed = addToast(stacked, 'info', 'Toast y')

  assert.deepEqual(
    collapsed.map(({ id, count }) => [id, count]),
    [
      ['y', 2],
      ['z', 1],
    ],
  )
})

test('hides the count label on the first occurrence', () => {
  assert.equal(toastCountLabel(1), undefined)
  assert.equal(toastCountLabel(2), '×2')
})

test('marks a toast as exiting without removing it', () => {
  const [toast] = addToast([], 'info', 'Toast y', 5_000, 'y')
  const exiting = beginExit([toast], 'y')

  assert.equal(exiting.length, 1)
  assert.equal(exiting[0]?.exiting, true)
})

test('does not collapse into an exiting toast', () => {
  const [toast] = addToast([], 'info', 'Toast y', 5_000, 'y')
  const exiting = beginExit([toast], 'y')
  const next = addToast(exiting, 'info', 'Toast y', 5_000, 'y2')

  assert.equal(next.length, 2)
  assert.equal(next[0]?.id, 'y2')
})

test('fades out more slowly than the enter motion', () => {
  assert.ok(TOAST_EXIT_MS > 320)
})
