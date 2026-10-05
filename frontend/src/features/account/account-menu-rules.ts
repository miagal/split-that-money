// Defines the small, browser-independent decisions used by the account dropdown.
import type { SyncStatus } from '../sync/sync.ts'

type AccountMenuPointerTarget = {
  targetInsideMenu: boolean
  targetInsideTrigger: boolean
}

type OverflowMeasurement = {
  scrollWidth: number
  clientWidth: number
  reducedMotion: boolean
}

type SyncPresentation = {
  label: string
  tone: 'success' | 'warning' | 'danger' | 'muted'
  icon: 'check' | 'refresh' | 'upload' | 'cloud-off' | 'warning'
}

const SYNC_PRESENTATION: Record<SyncStatus, SyncPresentation> = {
  Synced: { label: 'Synced', tone: 'success', icon: 'check' },
  Syncing: { label: 'Syncing', tone: 'warning', icon: 'refresh' },
  'Changes waiting to sync': { label: 'Waiting', tone: 'warning', icon: 'upload' },
  'Server not reachable': {
    label: 'Not reachable',
    tone: 'muted',
    icon: 'cloud-off',
  },
  'Needs attention': {
    label: 'Attention',
    tone: 'danger',
    icon: 'warning',
  },
}

/** Maps the sync status to the compact account-status presentation. */
export function syncPresentation(status: SyncStatus): SyncPresentation {
  return SYNC_PRESENTATION[status]
}

/**
 * Extra pending copy under the short status, or null when the status already says it.
 *
 * @param status - Controller sync status, not the shortened display label.
 * @param pending - Number of outbox rows waiting.
 * @returns A detail line, or null when none should render.
 */
export function syncPendingLabel(
  status: SyncStatus,
  pending: number,
): string | null {
  if (pending <= 0 || status === 'Changes waiting to sync') return null
  if (status === 'Needs attention') {
    return pending === 1
      ? '1 change needs you to sync'
      : `${pending} changes need you to sync`
  }
  return pending === 1
    ? '1 change waiting to sync'
    : `${pending} changes waiting to sync`
}

/**
 * Decides whether a pointer target sits outside the account control.
 *
 * @param target - Membership of the pointer target in the trigger and menu surfaces.
 * @returns Whether the open dropdown should close.
 */
export function shouldCloseAccountMenu({
  targetInsideMenu,
  targetInsideTrigger,
}: AccountMenuPointerTarget): boolean {
  return !targetInsideMenu && !targetInsideTrigger
}

/**
 * Decides whether a clipped email needs its optional movement treatment.
 *
 * @param measurement - Rendered email dimensions and the user's motion preference.
 * @returns Whether the email should animate horizontally.
 */
export function shouldAnimateOverflow({
  scrollWidth,
  clientWidth,
  reducedMotion,
}: OverflowMeasurement): boolean {
  return scrollWidth > clientWidth && !reducedMotion
}
