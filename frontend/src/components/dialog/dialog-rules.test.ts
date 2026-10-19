// Verifies the framework-free keyboard rule shared by the native dialog component.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dialogSyncAction,
  shouldCloseDialog,
  shouldCloseFromBackdrop,
} from './dialog-rules.ts'

test('keeps a parent dialog open only when a nested confirmation owns Escape', () => {
  assert.equal(
    shouldCloseDialog({ key: 'Escape', nestedConfirmationOpen: true }),
    false,
  )
  assert.equal(
    shouldCloseDialog({ key: 'Escape', nestedConfirmationOpen: false }),
    true,
  )
})

test('leaves an already-open dialog untouched during an open sync', () => {
  assert.equal(
    dialogSyncAction({ open: true, nativeDialogOpen: true }),
    'keep-open',
  )
})

test('closes only an idle top-level dialog from its backdrop', () => {
  assert.equal(
    shouldCloseFromBackdrop({
      targetIsDialog: true,
      saving: false,
      nestedConfirmationOpen: false,
    }),
    true,
  )
  assert.equal(
    shouldCloseFromBackdrop({
      targetIsDialog: false,
      saving: false,
      nestedConfirmationOpen: false,
    }),
    false,
  )
  assert.equal(
    shouldCloseFromBackdrop({
      targetIsDialog: true,
      saving: true,
      nestedConfirmationOpen: false,
    }),
    false,
  )
  assert.equal(
    shouldCloseFromBackdrop({
      targetIsDialog: true,
      saving: false,
      nestedConfirmationOpen: true,
    }),
    false,
  )
})
