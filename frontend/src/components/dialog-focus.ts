// Owns the native dialog's focusable controls and keyboard focus wrapping.
const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Returns enabled, non-inert dialog controls in document order. */
export function focusableElements(dialog: HTMLDialogElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.tabIndex >= 0 &&
      !element.closest('[inert]'),
  )
}

/** Wraps Tab at the current dialog's boundaries; nested dialogs own their own focus. */
export function cycleFocus(
  event: KeyboardEvent,
  dialog: HTMLDialogElement,
  nestedConfirmationOpen: boolean,
): void {
  if (nestedConfirmationOpen) return
  const elements = focusableElements(dialog)
  const first = elements[0]
  const last = elements.at(-1)
  if (!first || !last) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const active = dialog.ownerDocument.activeElement
  if (
    event.shiftKey &&
    (active === first || active === dialog || !dialog.contains(active))
  ) {
    event.preventDefault()
    last.focus()
  } else if (
    !event.shiftKey &&
    (active === last || active === dialog || !dialog.contains(active))
  ) {
    event.preventDefault()
    first.focus()
  }
}
