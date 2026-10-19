// Defines framework-free keyboard decisions used by the native dialog component.

export type DialogKey = { key: string; nestedConfirmationOpen: boolean }
export type DialogSyncInput = { open: boolean; nativeDialogOpen: boolean }
export type DialogSyncAction = 'open' | 'keep-open' | 'close' | 'restore'
export type DialogBackdropInput = {
  targetIsDialog: boolean
  saving: boolean
  nestedConfirmationOpen: boolean
}

/**
 * Decides whether an Escape key press belongs to the current dialog.
 *
 * @param input - The key event identity and whether a nested confirmation is active.
 * @returns True when the current dialog may close.
 */
export function shouldCloseDialog({
  key,
  nestedConfirmationOpen,
}: DialogKey): boolean {
  return key === 'Escape' && !nestedConfirmationOpen
}

/**
 * Decides whether a pointer hit on a native dialog may dismiss it.
 *
 * @param input - Whether the hit was the backdrop and whether this dialog currently owns a blocking state.
 * @returns True only for an idle, top-level dialog backdrop hit.
 */
export function shouldCloseFromBackdrop({
  targetIsDialog,
  saving,
  nestedConfirmationOpen,
}: DialogBackdropInput): boolean {
  return targetIsDialog && !saving && !nestedConfirmationOpen
}

/**
 * Chooses the native-dialog action for one controlled visibility synchronisation.
 *
 * @param input - Controlled visibility and the native dialog's current state.
 * @returns The single native action required without repeating an already-open modal transition.
 */
export function dialogSyncAction({
  open,
  nativeDialogOpen,
}: DialogSyncInput): DialogSyncAction {
  if (open) return nativeDialogOpen ? 'keep-open' : 'open'
  return nativeDialogOpen ? 'close' : 'restore'
}
