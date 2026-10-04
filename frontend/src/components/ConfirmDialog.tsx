// Composes the existing native dialog and shared buttons into a small destructive confirmation control.
import { type ReactNode } from 'react'
import { Button } from './Button.tsx'
import { Dialog } from './Dialog.tsx'
import { confirmDialogCloseAction } from './confirm-dialog-rules.ts'

type ConfirmDialogProps = {
  open: boolean
  title: string
  question: string
  confirmLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
  children?: ReactNode
}

/**
 * Renders a controlled destructive confirmation using the application's native dialog behavior.
 *
 * @param props - Visibility, copy, busy state, optional detail, and caller-owned actions.
 * @returns A modal confirmation whose cancel and destructive actions are disabled while busy.
 */
export function ConfirmDialog({
  open,
  title,
  question,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  /** Keeps Escape and other Dialog close requests from cancelling an in-flight destructive action. */
  function handleClose(): void {
    if (confirmDialogCloseAction(busy) === 'cancel') onCancel()
  }

  return (
    <Dialog
      open={open}
      title={title}
      onClose={handleClose}
      nestedConfirmationOpen={false}
      saving={busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{question}</p>
      {children}
    </Dialog>
  )
}
