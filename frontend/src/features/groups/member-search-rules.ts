// Decides whether a member-account keystroke can keep the visible picker instead of refetching.
export const MEMBER_SEARCH_LIMIT = 3

type MemberSearchHit = { email: string }

export type MemberSearchPlan<T extends MemberSearchHit> =
  | { action: 'idle' }
  | { action: 'reuse' }
  | { action: 'filter'; results: T[] }
  | { action: 'fetch'; results: T[] }

/** Returns whether an account email still contains the current search text. */
export function memberMatchesQuery(email: string, query: string): boolean {
  return email.toLowerCase().includes(query.trim().toLowerCase())
}

/**
 * Chooses whether the visible member-search list can stay, shrink, or must reload.
 *
 * @param previousQuery - The last query actually sent to the server.
 * @param nextQuery - The query after this keystroke.
 * @param results - Accounts returned by that last server search.
 * @param limit - Maximum accounts the server returns for one query.
 * @returns The next picker action and, when needed, the immediately visible accounts.
 */
export function memberSearchPlan<T extends MemberSearchHit>(
  previousQuery: string,
  nextQuery: string,
  results: T[],
  limit = MEMBER_SEARCH_LIMIT,
): MemberSearchPlan<T> {
  const previous = previousQuery.trim()
  const next = nextQuery.trim()
  if (next.length < 2) return { action: 'idle' }
  if (previous.toLowerCase() === next.toLowerCase()) return { action: 'reuse' }

  const filtered = results.filter((item) =>
    memberMatchesQuery(item.email, next),
  )
  const refined =
    previous.length >= 2 &&
    next.toLowerCase().startsWith(previous.toLowerCase())
  if (!refined) return { action: 'fetch', results: filtered }
  if (filtered.length === results.length) return { action: 'reuse' }
  if (results.length < limit) return { action: 'filter', results: filtered }
  return { action: 'fetch', results: filtered }
}
