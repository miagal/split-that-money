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
  label: SyncStatus
  tone: 'success' | 'warning' | 'danger' | 'muted'
  icon: 'check' | 'refresh' | 'upload' | 'cloud-off' | 'warning'
}

const SYNC_PRESENTATION: Record<SyncStatus, Omit<SyncPresentation, 'label'>> = {
  Synced: { tone: 'success', icon: 'check' },
  Syncing: { tone: 'warning', icon: 'refresh' },
  'Changes waiting to sync': { tone: 'warning', icon: 'upload' },
  'Server not reachable': { tone: 'muted', icon: 'cloud-off' },
  'Needs attention': { tone: 'danger', icon: 'warning' },
}

/** Maps the sync status to the compact account-status presentation. */
export function syncPresentation(status: SyncStatus): SyncPresentation {
  return { label: status, ...SYNC_PRESENTATION[status] }
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
