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

export type AppIdentity = { version: string; git: string }
export type FrontendIdentityEnv = {
  VITE_APP_VERSION?: string
  VITE_APP_GIT?: string
}
export type PublicAppIdentity = {
  APP_VERSION?: string
  APP_GIT?: string
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

/**
 * Reads the GUI identity baked into the Vite bundle.
 *
 * Missing env (containerless `npm run dev`, Node tests) is `lcl` with an empty git.
 * `import.meta.env` is Vite-only; Node tests pass an explicit object or omit it.
 *
 * @param env - Vite `import.meta.env` or a test double.
 * @returns The running frontend identity.
 */
export function frontendIdentity(
  env: FrontendIdentityEnv = (
    import.meta as ImportMeta & { env?: FrontendIdentityEnv }
  ).env ?? {},
): AppIdentity {
  return {
    version: env.VITE_APP_VERSION?.trim() || 'lcl',
    git: env.VITE_APP_GIT?.trim() || '',
  }
}

/**
 * Reads backend identity from public config. Empty or missing APP_VERSION is unknown
 * (old cached config from before this field existed).
 *
 * @param config - Public config object, or null when none has been loaded.
 * @returns Backend identity, or null when it must not be shown.
 */
export function backendIdentity(
  config: PublicAppIdentity | null,
): AppIdentity | null {
  const version = config?.APP_VERSION?.trim() ?? ''
  if (!version) return null
  return { version, git: config?.APP_GIT?.trim() ?? '' }
}

/**
 * Builds the account-menu version footer, or null when the backend identity is unknown.
 *
 * Same label and same git (empty git equals empty git) → one label.
 * Any difference → `fe: <frontend> / be: <backend>`. Hashes stay out of the string.
 *
 * @param frontend - Identity of the running JS bundle.
 * @param backend - Identity from live or stored public config, or null.
 * @returns Footer text, or null to hide the row.
 */
export function versionFooterLine(
  frontend: AppIdentity,
  backend: AppIdentity | null,
): string | null {
  if (!backend) return null
  if (frontend.version === backend.version && frontend.git === backend.git)
    return frontend.version
  return `fe: ${frontend.version} / be: ${backend.version}`
}
