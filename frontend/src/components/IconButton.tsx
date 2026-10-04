// Renders accessible icon-only buttons for compact actions such as dialog footer controls.
import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import type { ButtonVariant } from './Button.tsx'

type IconButtonProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  'aria-label'
> & {
  'aria-label': string
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border border-accent bg-accent text-accent-contrast',
  secondary: 'border border-border bg-surface-raised text-foreground',
  danger: 'border border-danger text-danger',
  text: 'border border-transparent text-accent',
}

/**
 * Renders a square native button whose required accessible label describes its icon.
 *
 * @param props - Native button properties, a required aria label, and visual variant.
 * @returns The icon-only action control.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { className, type = 'button', variant = 'secondary', ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={[
          'grid size-10 place-items-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
          variantClasses[variant],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        type={type}
        {...props}
      />
    )
  },
)
