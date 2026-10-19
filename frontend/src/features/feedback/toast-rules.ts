// Pure helpers for toast identity, timeouts, repeat collapse, and layout classes.
// ToastProvider renders the stack; feature code only calls success, error, and info.
import { clientUuid } from '../../lib/uuid.ts'

export type ToastKind = 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  kind: ToastKind
  message: string
  remainingMs: number
  count: number
  exiting?: boolean
}

/** Returns the auto-dismiss budget for a toast kind. */
export function timeoutFor(kind: ToastKind): number {
  return kind === 'error' ? 8_000 : 5_000
}

/** Exit fade duration in ms. Keep in sync with `.toast-exit` in `toast.css`. */
export const TOAST_EXIT_MS = 500

/**
 * Marks a toast as fading out while keeping it in the stack until the exit animation ends.
 *
 * @param toasts - The current visible notifications.
 * @param id - The toast that should start leaving.
 * @returns The same list with that toast flagged as exiting.
 */
export function beginExit(toasts: ToastItem[], id: string): ToastItem[] {
  return toasts.map((toast) =>
    toast.id === id && !toast.exiting ? { ...toast, exiting: true } : toast,
  )
}

/**
 * Maps remaining time onto 1 (full ring) through 0 (empty, toast gone).
 *
 * @param remainingMs - Milliseconds left before auto-dismiss.
 * @param kind - Toast kind whose timeout is the full ring.
 * @returns A 0–1 fraction for the dismiss ring.
 */
export function toastTimerProgress(remainingMs: number, kind: ToastKind): number {
  const total = timeoutFor(kind)
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, remainingMs / total))
}

/**
 * Adds a toast, collapsing a still-visible repeat onto one card at the front.
 *
 * @param toasts - The current notifications.
 * @param kind - Success, error, or info.
 * @param message - Visible copy; same kind plus message collapses.
 * @param remainingMs - Auto-dismiss budget for a new card.
 * @param id - Stable id for a new card.
 * @returns The updated stack, newest unique toast first.
 */
export function addToast(
  toasts: ToastItem[],
  kind: ToastKind,
  message: string,
  remainingMs = timeoutFor(kind),
  id: string = clientUuid(),
): ToastItem[] {
  const match = toasts.findIndex(
    (toast) =>
      !toast.exiting && toast.kind === kind && toast.message === message,
  )
  if (match >= 0) {
    const current = toasts[match]
    if (!current) return [{ id, kind, message, remainingMs, count: 1 }, ...toasts]
    return [
      {
        ...current,
        count: current.count + 1,
        remainingMs: timeoutFor(kind),
      },
      ...toasts.slice(0, match),
      ...toasts.slice(match + 1),
    ]
  }
  return [{ id, kind, message, remainingMs, count: 1 }, ...toasts]
}

/** Returns the visible repeat mark, or nothing on the first occurrence. */
export function toastCountLabel(count: number): string | undefined {
  return count > 1 ? `×${count}` : undefined
}

/**
 * Returns the inline count pill that sits after the toast message.
 *
 * @param isError - Whether the toast uses the error colors.
 */
export function toastCountPillClass(isError: boolean): string {
  const colors = isError
    ? 'bg-danger/10 text-danger'
    : 'bg-muted/15 text-muted'
  return `ml-1.5 inline-flex align-middle rounded-full px-2 py-0.5 text-xs font-semibold ${colors}`
}

/**
 * Subtracts elapsed time from a toast unless hover has paused it.
 *
 * @param toast - The notification whose remaining time is advancing.
 * @param elapsedMs - Milliseconds since the last tick.
 * @param paused - Whether this toast is hovered.
 * @returns Remaining milliseconds, never below zero.
 */
export function nextRemaining(
  toast: ToastItem,
  elapsedMs: number,
  paused: boolean,
): number {
  return paused ? toast.remainingMs : Math.max(0, toast.remainingMs - elapsedMs)
}

/** Positions the stack below the iPhone status bar in the installed PWA. */
export function toastViewportClass(): string {
  return 'pointer-events-none fixed inset-x-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-50 flex flex-col items-stretch gap-3 sm:inset-x-auto sm:right-4 sm:w-[min(24rem,calc(100vw-2rem))]'
}

/**
 * Returns the visual surface class for one notification card.
 *
 * @param isError - Whether the toast uses the error border.
 * @param exiting - Whether the card is playing the leave fade.
 */
export function toastCardClass(isError: boolean, exiting = false): string {
  const borderClass = isError ? 'border-danger' : 'border-border'
  const motionClass = exiting ? 'toast-exit' : 'toast-enter'
  return `${motionClass} pointer-events-auto flex items-center gap-3 rounded-xl border bg-surface-raised px-4 py-2 text-base shadow-lg sm:p-4 ${borderClass}`
}

/** Returns the icon-only dismiss control class, sized for a finger tap. */
export function toastDismissButtonClass(): string {
  return 'relative flex size-11 shrink-0 items-center justify-center rounded-md text-accent transition-colors hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
}
