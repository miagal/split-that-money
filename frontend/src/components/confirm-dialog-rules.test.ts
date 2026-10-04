// Verifies that confirmation dialogs cannot close during a destructive action.
import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmDialogCloseAction } from './confirm-dialog-rules.ts'

test('confirmation stays open while its action is busy', () => {
  assert.equal(confirmDialogCloseAction(true), 'keep-open')
  assert.equal(confirmDialogCloseAction(false), 'cancel')
})
