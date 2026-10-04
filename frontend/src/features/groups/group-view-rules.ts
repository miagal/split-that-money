// Provides pure presentation and state rules shared by group route components.
import type {
  ExpenseDto,
  SettlementDto,
  SuggestedTransferDto,
} from '../../api/contracts.ts'

export const MOBILE_ACTIVE_TAB_WIDTH = '6.5rem'
export const MOBILE_INACTIVE_TAB_WIDTH = '2.75rem'

export const groupTabs = [
  { path: 'overview', label: 'Overview' },
  { path: 'expenses', label: 'Expenses' },
  { path: 'balances', label: 'Balances' },
  { path: 'insights', label: 'Insights' },
  { path: 'settings', label: 'Settings' },
] as const

export type GroupTabPath = (typeof groupTabs)[number]['path']

export type GroupActivity =
  | { kind: 'expense'; record: ExpenseDto }
  | { kind: 'settlement'; record: SettlementDto }

/** Returns the route segments owned by the group section navigation. */
export function groupTabPaths(): GroupTabPath[] {
  return groupTabs.map(({ path }) => path)
}

/** Returns the mobile tab state used by the compact, inline group navigation. */
export function mobileTabClass(
  path: string,
  activePath: string,
): 'is-active' | 'is-inactive' {
  return path === activePath ? 'is-active' : 'is-inactive'
}

/** Returns the shared three-column layout for a navigable group-list row. */
export function groupListRowClass(): string {
  return 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-surface-raised p-4 transition hover:border-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
}

/** Returns the desktop-only visual state for a route-backed group tab. */
export function desktopGroupTabClass(isActive: boolean): string {
  const focus =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent'
  return isActive
    ? `${focus} md:bg-accent/10 md:text-accent`
    : `${focus} md:text-foreground md:hover:bg-surface`
}

/** Returns a mobile-compact label that becomes visible for every desktop tab. */
export function desktopGroupTabLabelClass(isActive: boolean): string {
  return isActive ? 'truncate' : 'sr-only md:not-sr-only md:truncate'
}

/** Returns desktop sidebar classes that stay fixed unless the viewport is too short for every tab. */
export function desktopSidebarClass(): string {
  return 'hidden md:sticky md:top-8 md:block md:max-h-[calc(100svh-4rem)] md:self-start md:overflow-y-auto'
}

/** Provides a testable reduced-motion value for tab transitions. */
export function transitionDuration(reducedMotion: boolean): string {
  return reducedMotion ? '0ms' : '280ms'
}

/** Keeps the mobile tab animation limited to its flex width. */
export function mobileTabTransitionClass(): string {
  return 'transition-[flex] duration-[280ms] motion-reduce:transition-none'
}

export function transfersForUser(
  transfers: SuggestedTransferDto[],
  userId: string,
): SuggestedTransferDto[] {
  return transfers.filter(
    (transfer) =>
      transfer.from_user_id === userId || transfer.to_user_id === userId,
  )
}

/** Returns only the payment suggestions the current member can complete themselves. */
export function outgoingTransfersForUser(
  transfers: SuggestedTransferDto[],
  userId: string,
): SuggestedTransferDto[] {
  return transfers.filter((transfer) => transfer.from_user_id === userId)
}

/**
 * Determines whether a suggested transfer is actionable by the current user.
 *
 * @param transfer - The suggested payment to assess.
 * @param userId - The current user identifier, when a session exists.
 * @returns True only when the current user must send the suggested payment.
 */
export function isOutgoingTransferForUser(
  transfer: SuggestedTransferDto,
  userId: string | undefined,
): boolean {
  return (
    userId !== undefined &&
    outgoingTransfersForUser([transfer], userId).length === 1
  )
}

/** Merges the five newest non-deleted expense and payment records for the group overview. */
export function latestActivity(
  expenses: ExpenseDto[],
  settlements: SettlementDto[],
): GroupActivity[] {
  return [
    ...expenses
      .filter((record) => !record.deleted)
      .map((record) => ({ kind: 'expense' as const, record })),
    ...settlements
      .filter((record) => !record.deleted)
      .map((record) => ({ kind: 'settlement' as const, record })),
  ]
    .sort((a, b) => b.record.updated_at.localeCompare(a.record.updated_at))
    .slice(0, 5)
}

/** Returns the display label for the active group route tab. */
export function currentTabLabel(
  pathname: string,
): (typeof groupTabs)[number]['label'] {
  const path = pathname.split('/').at(-1)
  return groupTabs.find((tab) => tab.path === path)?.label ?? 'Overview'
}

export function groupErrorKind(
  status: number | undefined,
): 'missing' | 'forbidden' | 'recoverable' {
  if (status === 404) return 'missing'
  if (status === 403) return 'forbidden'
  return 'recoverable'
}

export function balanceLabel(cents: number | null): string {
  if (cents === null) return 'Balance unavailable'
  if (cents > 0) return 'Others owe you'
  if (cents < 0) return 'You owe the group'
  return 'You are all settled'
}

/**
 * Keeps the group shell visible once a cached or fetched row exists.
 *
 * A refresh may stay loading in the background without replacing the UI with copy.
 *
 * @param loading - Whether a group fetch is still in flight.
 * @param group - The group already available to render, if any.
 * @returns Whether the layout should render a quiet empty placeholder.
 */
export function shouldShowGroupLoadingPlaceholder(
  loading: boolean,
  group: { id: string } | null,
): boolean {
  return loading && group === null
}
