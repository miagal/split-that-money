// Renders the small set of shared semantic button treatments used across the application.
import type { ComponentPropsWithoutRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text'

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border border-accent bg-accent text-accent-contrast',
  secondary: 'border border-border bg-surface-raised text-foreground',
  danger: 'border border-danger text-danger',
  text: 'border border-transparent text-accent',
}

/**
 * Renders a native button with a documented visual emphasis.
 *
 * @param props - Native button properties plus the desired semantic variant.
 * @returns The styled native button.
 */
export function Button({
  className,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center rounded-lg px-4 py-2 font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      type={type}
      {...props}
    />
  )
}
