// Renders a small click-only on/off switch for compact settings rows.
import type { ComponentPropsWithoutRef } from 'react'

type SwitchProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  'onChange' | 'role' | 'type' | 'children'
> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/**
 * Toggles a boolean preference with a visible on/off track.
 *
 * Click only — no drag handling. Green track means on; muted track means off.
 *
 * @param props - Checked state, change callback, and optional native button attributes including `aria-label`.
 * @returns A `role="switch"` button with a sliding thumb.
 */
export function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
  ...props
}: SwitchProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={[
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'border-emerald-600 bg-emerald-500'
          : 'border-border bg-muted/40',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked)
      }}
    >
      <span
        aria-hidden
        className={[
          'pointer-events-none size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}
