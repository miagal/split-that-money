// Supplies pure integer-cent parsing, allocation, and display rules for money features.

/**
 * Formats integer cents with the browser locale and a supplied ISO currency code.
 *
 * @param cents - Signed integer minor currency units.
 * @param currency - ISO 4217 currency code.
 * @returns A locale-formatted currency string.
 */
export function formatMoney(cents: number, currency: string): string {
  if (!Number.isSafeInteger(cents))
    throw new RangeError('Cents must be a safe integer.')
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

/**
 * Formats integer cents with German locale conventions and a supplied ISO currency code.
 *
 * @param cents - Signed integer minor currency units.
 * @param currency - ISO 4217 currency code.
 * @returns A German locale-formatted currency string.
 */
export function formatGermanMoney(cents: number, currency: string): string {
  if (!Number.isSafeInteger(cents))
    throw new RangeError('Cents must be a safe integer.')
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(
    cents / 100,
  )
}

/**
 * Replaces locale commas so a decimal keypad can feed the shared point-based parser.
 *
 * @param value - Raw amount text from an input field.
 * @returns The same text with every comma turned into a decimal point.
 */
export function normalizeAmountInput(value: string): string {
  return value.replaceAll(',', '.')
}

/**
 * Parses a positive decimal form value without using floating-point arithmetic.
 *
 * @param value - Unsigned decimal text containing zero to two fractional digits.
 * @returns Positive integer cents, or null when the input is invalid or non-positive.
 */
export function parseMoneyToCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(
    normalizeAmountInput(value).trim(),
  )
  if (!match) return null

  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

/**
 * Splits cents equally and awards remainder cents by sorted stable key order.
 *
 * @param total - Non-negative integer cents to allocate.
 * @param keys - Unique stable participant identifiers.
 * @returns A per-key allocation whose values sum to total.
 */
export function distributeCents(
  total: number,
  keys: string[],
): Record<string, number> {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new RangeError('Total must be a non-negative safe integer.')
  const sortedKeys = [...keys].sort()
  if (sortedKeys.length === 0)
    throw new RangeError('At least one key is required.')
  if (new Set(sortedKeys).size !== sortedKeys.length)
    throw new RangeError('Keys must be unique.')

  const base = Math.floor(total / sortedKeys.length)
  const remainder = total % sortedKeys.length
  return Object.fromEntries(
    sortedKeys.map((key, index) => [key, base + Number(index < remainder)]),
  )
}
