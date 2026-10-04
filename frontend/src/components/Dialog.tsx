// Provides a controlled native dialog with focus management and nested-confirmation-safe Escape handling.
import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { OverlayScrollArea } from './OverlayScrollArea.tsx'
import {
  dialogSyncAction,
  shouldCloseDialog,
  shouldCloseFromBackdrop,
} from './dialog-rules.ts'
import { cycleFocus, focusableElements } from './dialog-focus.ts'

type DialogProps = {
  open: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
  overlay?: ReactNode
  saving?: boolean
  initialFocus?: 'first'
  onClose: () => void
  nestedConfirmationOpen: boolean
}

/**
 * Renders a controlled modal dialog without prescribing a caller-owned close action.
 *
 * @param props - Visibility, title, body content, close callback, and nested-dialog state.
 * @returns A native dialog whose body is the only default scroll region.
 */
export function Dialog({
  open,
  title,
  children,
  footer,
  overlay,
  saving = false,
  initialFocus,
  onClose,
  nestedConfirmationOpen,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const action = dialogSyncAction({ open, nativeDialogOpen: dialog.open })
    if (action === 'open') {
      triggerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      dialog.showModal()
      if (initialFocus === 'first') focusFirstElement(dialog)
      return
    }
    if (action === 'keep-open') return

    if (action === 'close') dialog.close()
    triggerRef.current?.focus()
  }, [initialFocus, open])

  useEffect(() => {
    if (!open) return

    /** Handles Escape and Tab before a native dialog can perform its default close. */
    function handleKeyDown(event: KeyboardEvent): void {
      const dialog = dialogRef.current
      if (!dialog) return

      if (
        event.key === 'Escape' &&
        shouldCloseDialog({ key: event.key, nestedConfirmationOpen })
      ) {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'Tab') cycleFocus(event, dialog, nestedConfirmationOpen)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [nestedConfirmationOpen, onClose, open])

  /** Prevents native cancellation from bypassing the controlled nested-dialog rule. */
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>): void {
    event.preventDefault()
    if (shouldCloseDialog({ key: 'Escape', nestedConfirmationOpen })) onClose()
  }

  /** Dismisses only a true native-dialog backdrop hit, never dialog content. */
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
    if (
      shouldCloseFromBackdrop({
        targetIsDialog: event.target === event.currentTarget,
        saving,
        nestedConfirmationOpen,
      })
    )
      onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog-surface"
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <h2 className="px-6 pt-6 text-xl font-bold" id={titleId}>
        {title}
      </h2>
      <OverlayScrollArea className="max-h-[70svh] p-6 pt-4">
        {children}
      </OverlayScrollArea>
      {footer && <div className="dialog-footer">{footer}</div>}
      {overlay}
    </dialog>
  )
}

/** Focuses the first interactive control, retaining the dialog itself as an accessible fallback. */
function focusFirstElement(dialog: HTMLDialogElement): void {
  const first = focusableElements(dialog)[0]
  if (first) first.focus()
  else dialog.focus()
}
