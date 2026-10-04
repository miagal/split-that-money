// Validates and normalizes values before the group dialog sends an immutable create request.
import type { GroupCreateDto } from '../../api/contracts.ts'
import { isGroupIcon } from '../../lib/icons.ts'

type GroupDialogValues = {
  name: string
  currency: string
  icon: string
}

type IconPickerSelection<T> = {
  current: T
  selected: T | null
}

/**
 * Builds a safe group-create payload from the dialog's editable fields.
 *
 * @param values - Name, currency, and icon text currently selected in the dialog.
 * @returns A trimmed valid payload, or null when any required value is invalid.
 */
export function groupCreateInput(
  values: GroupDialogValues,
): GroupCreateDto | null {
  const name = values.name.trim()
  if (!name || !values.currency || !isGroupIcon(values.icon)) return null
  return {
    name,
    currency: values.currency,
    icon: values.icon as GroupCreateDto['icon'],
  }
}

/** Keeps the emoji input empty or limited to one valid group-icon emoji. */
export function emojiInputValue(value: string): string {
  return value === '' || isGroupIcon(`emoji:${value}`) ? value : ''
}

/**
 * Closes an icon picker while retaining its current value when it was dismissed.
 *
 * @param selection - The current form value and an optional immediately selected replacement.
 * @returns The value to retain and the closed picker state.
 */
export function iconPickerSelection<T>({
  current,
  selected,
}: IconPickerSelection<T>): { value: T; open: false } {
  return { value: selected ?? current, open: false }
}
