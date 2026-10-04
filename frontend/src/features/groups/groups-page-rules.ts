// Keeps group creation unavailable until its visible-list state is safe to update.

type GroupRow = { id: string }

export type GroupListState<T extends GroupRow> = {
  groups: T[]
  error: string | null
}

/**
 * Determines whether the group dialog can open without an initial fetch replacing a new group.
 *
 * @param online - Whether server-only group creation is available.
 * @param loading - Whether the initial visible-group request is still pending.
 * @returns True when a user may safely begin creating a group.
 */
export function canOpenGroupDialog(online: boolean, loading: boolean): boolean {
  return online && !loading
}

/**
 * Withholds list and empty-state copy until the first visible-group read resolves.
 *
 * @param initialLoadComplete - Whether the initial list request has finished.
 * @param hasError - Whether the page is showing an inline list error.
 * @returns Whether the group list body may render.
 */
export function shouldShowGroupList(
  initialLoadComplete: boolean,
  hasError: boolean,
): boolean {
  return initialLoadComplete && !hasError
}

/**
 * Returns the one-shot enter class used after the first visible-group read resolves.
 *
 * @param initialLoadComplete - Whether the initial list request has finished.
 * @returns The enter animation class, or an empty string while still loading.
 */
export function groupListEntryClass(initialLoadComplete: boolean): string {
  return initialLoadComplete ? 'list-enter' : ''
}

/**
 * Returns row IDs that arrived after the first paint so only they fade in.
 *
 * @param seen - Row IDs that have already been rendered once.
 * @param rows - Current rows that may need a one-shot enter class.
 * @param initialPaintDone - Whether at least one resolved paint has already happened.
 * @returns The subset of current row IDs that should receive the enter animation.
 */
export function newRowIds(
  seen: ReadonlySet<string>,
  rows: readonly GroupRow[],
  initialPaintDone: boolean,
): Set<string> {
  return initialPaintDone
    ? new Set(rows.filter((row) => !seen.has(row.id)).map((row) => row.id))
    : new Set()
}

/**
 * Determines whether an asynchronous list result still owns the current page state.
 *
 * @param requestGeneration - Generation captured when the request started.
 * @param activeGeneration - Most recently started or invalidated generation.
 * @returns True only for the request that may update the list.
 */
export function isCurrentGroupListRequest(
  requestGeneration: number,
  activeGeneration: number,
): boolean {
  return requestGeneration === activeGeneration
}

/**
 * Keeps the visible list usable after a failed fetch; the caller reports the failure separately.
 *
 * @param state - Current visible-group rows and any prior loading error.
 * @returns The same rows with the inline error cleared after the caller reports it as a toast.
 */
export function listFetchFailed<T extends GroupRow>(
  state: GroupListState<T>,
): GroupListState<T> {
  return { ...state, error: null }
}

/**
 * Adds a newly created group without treating it as proof that the list request succeeded.
 *
 * @param state - Current visible-group rows and loading error.
 * @param group - Group returned by the create endpoint.
 * @returns The updated rows while preserving the current list error.
 */
export function listWithCreatedGroup<T extends GroupRow>(
  state: GroupListState<T>,
  group: T,
): GroupListState<T> {
  return {
    ...state,
    groups: [group, ...state.groups.filter((row) => row.id !== group.id)],
  }
}

/**
 * Replaces list data after a successful refresh while retaining a just-created response row.
 *
 * @param state - Current visible-group state.
 * @param groups - Authoritative rows returned by the list endpoint.
 * @param createdGroup - Optional just-created row that must not disappear during refresh.
 * @returns Fresh groups with any stale list error cleared.
 */
export function listFetchSucceeded<T extends GroupRow>(
  state: GroupListState<T>,
  groups: T[],
  createdGroup?: T,
): GroupListState<T> {
  const refreshed = createdGroup
    ? listWithCreatedGroup({ ...state, groups }, createdGroup).groups
    : groups
  return { groups: refreshed, error: null }
}
