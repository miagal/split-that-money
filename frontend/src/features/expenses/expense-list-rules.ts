// Defines the bounded progressive-rendering rules for the local expense list.

export const EXPENSE_PAGE_SIZE = 20
export type ExpenseListState = 'loading' | 'empty' | 'items'

/** Distinguishes an unresolved local read from a confirmed empty expense list. */
export function expenseListState(
  initialLoadComplete: boolean,
  expenseCount: number,
): ExpenseListState {
  if (!initialLoadComplete) return 'loading'
  return expenseCount === 0 ? 'empty' : 'items'
}

/** Returns the one-shot class used after the first local expense read resolves. */
export function expenseListEntryClass(initialLoadComplete: boolean): string {
  return initialLoadComplete ? 'list-enter' : ''
}

/** Returns the next visible item count without exceeding the available expenses. */
export function nextVisibleExpenseCount(
  visibleCount: number,
  totalCount: number,
): number {
  return Math.min(visibleCount + EXPENSE_PAGE_SIZE, totalCount)
}

/**
 * Orders expenses newest calendar date first, then newest update on the same day.
 *
 * @param expenses - Local expense rows that expose `date` and `updated_at`.
 * @returns A new array; older `date` stays below even when `updated_at` is later.
 */
export function sortExpensesForList<
  T extends { date: string; updated_at: string },
>(expenses: T[]): T[] {
  return [...expenses].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.updated_at.localeCompare(a.updated_at),
  )
}
