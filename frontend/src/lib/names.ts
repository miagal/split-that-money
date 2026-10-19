// Derives unique member labels for a single visible group context.

export type NameMember = {
  id: string
  first_name: string
  last_name: string
  email: string
}

/**
 * Produces unique labels by progressively adding enough identity to disambiguate members.
 *
 * @param members - Group members with stable IDs and backend identity fields.
 * @param options - Optional viewer identity; when set, that member's label becomes `You`.
 * @returns A member-ID-to-label map using first name, initial, full name, then `Name (email)` as needed.
 */
export function compactNames(
  members: NameMember[],
  options?: { currentUserId?: string },
): Record<string, string> {
  const labels = new Map(
    members.map((member) => [member.id, member.first_name]),
  )
  refineCollisions(
    members,
    labels,
    (member) => `${member.first_name} ${member.last_name.charAt(0)}.`,
  )
  refineCollisions(members, labels, fullName)
  refineCollisions(members, labels, fullNameWithEmail)
  if (options?.currentUserId && labels.has(options.currentUserId))
    labels.set(options.currentUserId, 'You')
  return Object.fromEntries(labels)
}

/**
 * Labels members with full names, adding `(email)` only when the full name collides.
 *
 * @param members - Group members with stable IDs and backend identity fields.
 * @returns A member-ID-to-label map of full names, with email in parentheses when needed.
 */
export function fullNames(members: NameMember[]): Record<string, string> {
  const labels = new Map(members.map((member) => [member.id, fullName(member)]))
  refineCollisions(members, labels, fullNameWithEmail)
  return Object.fromEntries(labels)
}

function fullName(member: NameMember): string {
  return `${member.first_name} ${member.last_name}`
}

function fullNameWithEmail(member: NameMember): string {
  return `${fullName(member)} (${member.email})`
}

/**
 * Replaces every colliding label with the next more-specific representation.
 *
 * @param members - Members whose current labels are checked for collisions.
 * @param labels - Mutable labels keyed by stable member ID.
 * @param next - The next representation to apply to every collision group.
 */
function refineCollisions(
  members: NameMember[],
  labels: Map<string, string>,
  next: (member: NameMember) => string,
): void {
  const counts = new Map<string, number>()
  for (const member of members) {
    const label = labels.get(member.id)!
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  for (const member of members) {
    if ((counts.get(labels.get(member.id)!) ?? 0) > 1)
      labels.set(member.id, next(member))
  }
}
