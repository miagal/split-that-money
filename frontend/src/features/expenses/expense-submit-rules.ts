// Centralizes expense-submit validation so valid and invalid form states follow one path.
import { parseMoneyToCents } from '../../lib/money.ts'
import type { ExpenseDto } from '../../api/contracts.ts'

export type ExpenseSubmitInput = {
  title: string
  amount: string
  date: string
  participantCount: number
  splitError?: string
}

export type ExpenseSubmitState = {
  canSubmit: boolean
  errors: Record<string, string[]>
}

/**
 * Builds the explicit confirmation copy for an expense deletion.
 *
 * @param title - The persisted expense title shown to the person deleting it.
 * @returns The confirmation question for that specific expense.
 */
export function expenseDeleteQuestion(title: string): string {
  return `Do you really want to delete ${title}?`
}

/**
 * Chooses the compact footer control order from whether the expense already exists.
 *
 * @param expense - The expense being edited, if any.
 * @returns The footer mode used by the add or edit dialog.
 */
export function expenseDialogFooterMode(
  expense: ExpenseDto | undefined,
): 'delete-cancel-save' | 'cancel-save' {
  return expense ? 'delete-cancel-save' : 'cancel-save'
}

/**
 * Validates the user-editable fields required before an expense can enter the local queue.
 *
 * @param input - Current title, decimal amount, date, participant count, and split result.
 * @returns Whether submission is safe plus field-local error messages.
 */
export function expenseSubmitState(
  input: ExpenseSubmitInput,
): ExpenseSubmitState {
  const errors: Record<string, string[]> = {}
  const amountCents = parseMoneyToCents(input.amount)
  if (!input.title.trim()) errors.title = ['Enter a title.']
  if (amountCents === null) errors.amount = ['Enter a valid amount.']
  if (!input.date) errors.date = ['Choose a date.']
  if (input.participantCount === 0)
    errors.participants = ['Choose at least one participant.']
  if (amountCents !== null && input.participantCount > 0 && input.splitError)
    errors.split = [input.splitError]
  return { canSubmit: Object.keys(errors).length === 0, errors }
}
