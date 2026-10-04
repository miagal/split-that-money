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
