// Keeps destructive confirmation dialogs open while their action is in progress.

/**
 * Decides whether a dialog-originated close request may cancel the current confirmation.
 *
 * @param busy - Whether the destructive action is currently in progress.
 * @returns Cancellation when idle, otherwise an instruction to keep the dialog open.
 */
export function confirmDialogCloseAction(
  busy: boolean,
): 'cancel' | 'keep-open' {
  return busy ? 'keep-open' : 'cancel'
}
