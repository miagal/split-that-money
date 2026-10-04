// Renders the compact member identity marker from a member and its already-disambiguated display label.
import type { NameMember } from '../lib/names.ts'

type AvatarProps = { member: NameMember; label: string }

/**
 * Renders member initials while exposing the unique label to assistive technology.
 *
 * @param props - A member identity and the compactNames-derived visible-group label.
 * @returns A labelled circular member marker.
 */
export function Avatar({ member, label }: AvatarProps) {
  const initials =
    `${member.first_name.charAt(0)}${member.last_name.charAt(0)}`.toUpperCase() ||
    label.slice(0, 2).toUpperCase()

  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold leading-none text-accent"
      role="img"
      aria-label={label}
      title={label}
    >
      {initials}
    </span>
  )
}
