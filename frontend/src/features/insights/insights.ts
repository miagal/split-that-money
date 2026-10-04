// Groups locally stored expenses and supplies presentation-only Insights helpers.
import type { ExpenseDto, ExpenseIcon } from '../../api/contracts.ts'

export type InsightGroup = { key: string; amountCents: number }

export type InsightCalloutPlacement =
  | { mode: 'side'; side: 'left' | 'right'; connector: true }
  | { mode: 'above'; connector: false }

const categoryLabels: Record<Exclude<ExpenseIcon, null> | 'other', string> = {
  'utensils-crossed': 'Food & drinks',
  coffee: 'Coffee',
  'shopping-basket': 'Shopping',
  'car-front': 'Transport',
  ticket: 'Tickets & events',
  'bed-double': 'Accommodation',
  'party-popper': 'Entertainment',
  other: 'Other',
}

/** Returns list-row spacing that keeps person and category rows equally tall. */
export function insightListRowClass(): string {
  return 'flex items-center gap-3 px-3 py-2.5'
}

/** Returns the compact initials shown inside a person insight marker. */
export function insightInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?'
}

/**
 * Turns a persisted expense icon into its approved, human-readable category.
 *
 * @param icon - The persisted icon, an Insights other key, or no icon.
 * @returns The display-only category without changing the stored value.
 */
export function displayCategory(icon: ExpenseIcon | 'other'): string {
  return icon === null ? 'Other' : categoryLabels[icon]
}

/**
 * Chooses the one visible chart callout, clearing it when its segment is clicked again.
 *
 * @param current - The currently selected Insight group key, if any.
 * @param clicked - The key for the chart segment receiving the interaction.
 * @returns The next selected key, or null when the current segment was cleared.
 */
export function nextSelectedInsightKey(
  current: string | null,
  clicked: string,
): string | null {
  return current === clicked ? null : clicked
}

/**
 * Chooses the selected chart callout position from its segment and available side space.
 *
 * @param start - The segment's clockwise starting angle in degrees.
 * @param end - The segment's clockwise ending angle in degrees.
 * @param hasSideSpace - Whether the layout has room beside the chart.
 * @returns A side callout with a connector, or an above-chart callout without one.
 */
export function insightCalloutPlacement(
  start: number,
  end: number,
  hasSideSpace: boolean,
): InsightCalloutPlacement {
  if (!hasSideSpace) return { mode: 'above', connector: false }
  const horizontalMass = Math.cos(
    ((midpointDegrees(start, end) - 90) * Math.PI) / 180,
  )
  return {
    mode: 'side',
    side: horizontalMass < -0.0001 ? 'left' : 'right',
    connector: true,
  }
}

/** Returns the circular midpoint of conic-gradient degree bounds. */
function midpointDegrees(start: number, end: number): number {
  return (start + (end < start ? end + 360 : end)) / 2
}

/** Groups non-deleted expenses by payer for the local insights view. */
export function groupByPayer(expenses: ExpenseDto[]): InsightGroup[] {
  return group(expenses, (expense) => expense.payer)
}

/** Groups non-deleted expenses by icon, assigning intentional no-icon rows to Other. */
export function groupByIcon(expenses: ExpenseDto[]): InsightGroup[] {
  return group(expenses, (expense) => expense.icon ?? 'other').sort((a, b) =>
    a.key === 'other'
      ? 1
      : b.key === 'other'
        ? -1
        : b.amountCents - a.amountCents || a.key.localeCompare(b.key),
  )
}

function group(
  expenses: ExpenseDto[],
  keyOf: (expense: ExpenseDto) => string,
): InsightGroup[] {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    if (expense.deleted) continue
    const key = keyOf(expense)
    totals.set(key, (totals.get(key) ?? 0) + expense.amount_cents)
  }
  return [...totals.entries()]
    .map(([key, amountCents]) => ({ key, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents || a.key.localeCompare(b.key))
}
