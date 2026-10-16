// Shared money-list row layout and touch focus helpers.

/** Suppresses the iOS tap flash on pressable money-list rows. */
export const pressableRowClass =
  '[-webkit-tap-highlight-color:transparent]' as const

/** Clickable money-list row: shared grid, padding, and press feedback. */
export const pressableMoneyRowClass =
  `grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left active:bg-accent/10 md:p-4 md:hover:bg-accent/10 ${pressableRowClass}` as const

/** Non-interactive money-list row using the same grid and padding. */
export const moneyListRowClass =
  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 md:p-4' as const

/**
 * Clears sticky focus after a press. Safe when the harness calls onClick without an event.
 *
 * @param event - Optional activate event whose currentTarget should lose focus.
 */
export function blurAfterPress(event?: {
  currentTarget?: { blur: () => void } | null
}): void {
  event?.currentTarget?.blur()
}

/**
 * Clears sticky focus once a finger starts scrolling on the row.
 *
 * @param event - Touch-move event from the focused pressable row.
 */
export function blurOnTouchScroll(event: {
  currentTarget: { blur: () => void }
}): void {
  event.currentTarget.blur()
}
