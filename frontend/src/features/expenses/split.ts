// Validates expense split modes and converts exact-split inputs at the currency boundary.
import { distributeCents } from '../../lib/money.ts'

export type SplitMode = 'equal' | 'exact' | 'shares' | 'percent'
export type SplitInput = {
  mode: SplitMode
  amountCents: number
  participants?: string[]
  values?: number[]
}
export type SplitResult = { amounts: Record<string, number>; error?: string }

/** Validates one split and returns calculated integer-cent allocations by participant. */
export function validateSplit(input: SplitInput): SplitResult {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0)
    return { amounts: {}, error: 'Enter a valid non-negative amount.' }
  const participants = [
    ...new Set(
      input.participants ??
        input.values?.map((_, index) => String(index)) ??
        [],
    ),
  ]
  if (participants.length === 0)
    return { amounts: {}, error: 'Choose at least one participant.' }
  const equal = distributeCents(input.amountCents, participants)
  if (input.mode === 'equal') return { amounts: equal }
  const values = input.values ?? []
  if (input.mode === 'exact') {
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0))
      return {
        amounts: equal,
        error: 'Amounts must be non-negative whole cents.',
      }
    const total = values.reduce((sum, value) => sum + value, 0)
    if (total !== input.amountCents)
      return {
        amounts: byParticipants(participants, values),
        error: `Amounts add up to ${formatCents(total)}; expected ${formatCents(input.amountCents)}.`,
      }
    return { amounts: byParticipants(participants, values) }
  }
  if (input.mode === 'shares') {
    if (values.some((value) => !Number.isSafeInteger(value) || value <= 0))
      return { amounts: equal, error: 'Shares must be positive whole numbers.' }
    const total = values.reduce((sum, value) => sum + value, 0)
    return remainderResult(input.amountCents, participants, values, total)
  }
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0))
    return {
      amounts: equal,
      error: 'Percentages must be non-negative whole numbers.',
    }
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total !== 100)
    return {
      amounts: byParticipants(
        participants,
        values.map((value) => Math.floor((input.amountCents * value) / 100)),
      ),
      error: `Percentages add up to ${total}%; expected 100%.`,
    }
  return remainderResult(input.amountCents, participants, values, 100)
}

/** Formats stored split values for their mode-specific input control. */
export function splitValueForInput(
  mode: SplitMode,
  value: number,
): string | number {
  return mode === 'exact' ? (value / 100).toFixed(2) : value
}

/** Parses one raw mode-specific input, returning null instead of coercing invalid text. */
export function parseSplitValue(mode: SplitMode, value: string): number | null {
  if (mode !== 'exact') {
    const parsed = Number(value)
    return value.trim() && Number.isFinite(parsed) ? parsed : null
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

function byParticipants(
  participants: string[],
  values: number[],
): Record<string, number> {
  return Object.fromEntries(
    participants.map((participant, index) => [participant, values[index] ?? 0]),
  )
}

function remainderResult(
  total: number,
  participants: string[],
  values: number[],
  divisor: number,
): Pick<SplitResult, 'amounts'> {
  const amounts = participants.map((_, index) =>
    Math.floor((total * (values[index] ?? 0)) / divisor),
  )
  const remainderCents = total - amounts.reduce((sum, value) => sum + value, 0)
  const result = byParticipants(participants, amounts)
  // Match the server's stable participant-ID order, independently of form row order.
  for (const participant of [...participants].sort().slice(0, remainderCents))
    result[participant] += 1
  return { amounts: result }
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2)
}
