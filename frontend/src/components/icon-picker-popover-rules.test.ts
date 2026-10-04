// Verifies that the icon picker dismisses only for Escape and outside pointer targets.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  iconPickerPopoverLabel,
  popoverCloseReason,
  popoverPointerAction,
} from './icon-picker-popover-rules.ts'

test('popover closes for Escape and outside targets', () => {
  assert.equal(
    popoverCloseReason({ key: 'Escape', target: 'content' }),
    'close',
  )
  assert.equal(
    popoverCloseReason({ key: undefined, target: 'outside' }),
    'close',
  )
})

test('popover stays open for anchor and content pointer targets', () => {
  assert.equal(
    popoverCloseReason({ key: undefined, target: 'anchor' }),
    'keep-open',
  )
  assert.equal(
    popoverCloseReason({ key: undefined, target: 'content' }),
    'keep-open',
  )
})

test('outside pointer dismissal consumes its following click', () => {
  assert.equal(popoverPointerAction('outside'), 'close-and-consume-click')
  assert.equal(popoverPointerAction('content'), 'keep-open')
})

test('popover supplies an accessible default name unless its caller provides one', () => {
  assert.equal(iconPickerPopoverLabel(), 'Choose an icon')
  assert.equal(
    iconPickerPopoverLabel('Pick an expense icon'),
    'Pick an expense icon',
  )
})
