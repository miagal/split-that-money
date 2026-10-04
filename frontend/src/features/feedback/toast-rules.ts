// Defines toast creation and timeout behavior independently of rendering.
import { clientUuid } from '../../lib/uuid.ts'

export type ToastKind = 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  kind: ToastKind
  message: string
  remainingMs: number
}

export function timeoutFor(kind: ToastKind): number {
  return kind === 'error' ? 8_000 : 5_000
}

export function addToast(
  toasts: ToastItem[],
  kind: ToastKind,
  message: string,
  remainingMs = timeoutFor(kind),
  id: string = clientUuid(),
): ToastItem[] {
  return [{ id, kind, message, remainingMs }, ...toasts]
}

export function nextRemaining(
  toast: ToastItem,
  elapsedMs: number,
  paused: boolean,
): number {
  return paused ? toast.remainingMs : Math.max(0, toast.remainingMs - elapsedMs)
}
