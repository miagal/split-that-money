// Resolves validated backend icon strings to pure display identifiers without importing React.

const groupIcons = {
  house: 'House',
  plane: 'Plane',
  'shopping-basket': 'ShoppingBasket',
  'utensils-crossed': 'UtensilsCrossed',
  'car-front': 'CarFront',
  'tent-tree': 'TentTree',
  'party-popper': 'PartyPopper',
  handshake: 'Handshake',
} as const

const expenseIcons = {
  'utensils-crossed': 'UtensilsCrossed',
  coffee: 'Coffee',
  'shopping-basket': 'ShoppingBasket',
  'car-front': 'CarFront',
  ticket: 'Ticket',
  'bed-double': 'BedDouble',
  'party-popper': 'PartyPopper',
} as const

const emojiFallbackPattern =
  /^(?:\p{Extended_Pictographic}\p{Emoji_Modifier}?\uFE0F?(?:\u200D\p{Extended_Pictographic}\p{Emoji_Modifier}?\uFE0F?)*|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)$/u
const emojiPattern =
  /\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3/u

export type IconComponent =
  | (typeof groupIcons)[keyof typeof groupIcons]
  | (typeof expenseIcons)[keyof typeof expenseIcons]
  | 'CircleHelp'
  | string

/**
 * Validates the backend's required group-icon contract before a create request is sent.
 *
 * @param value - A candidate `lucide:` or `emoji:` group icon value.
 * @returns True when the value is a curated Lucide icon or one emoji grapheme.
 */
export function isGroupIcon(value: string): boolean {
  if (value.startsWith('emoji:'))
    return isSingleEmoji(value.slice('emoji:'.length))
  if (!value.startsWith('lucide:')) return false
  return Object.hasOwn(groupIcons, value.slice('lucide:'.length))
}

/**
 * Converts a required group icon wire value into a Lucide component name or verified emoji.
 *
 * @param icon - Backend `lucide:` or `emoji:` group icon value.
 * @returns A curated Lucide name, emoji grapheme, or CircleHelp for malformed data.
 */
export function groupIconComponent(icon: string): IconComponent {
  if (icon.startsWith('emoji:')) {
    const emoji = icon.slice('emoji:'.length)
    return isSingleEmoji(emoji) ? emoji : 'CircleHelp'
  }
  const name = icon.slice('lucide:'.length) as keyof typeof groupIcons
  return groupIcons[name] ?? 'CircleHelp'
}

/**
 * Converts an optional expense icon wire value into a curated Lucide component name.
 *
 * @param icon - Backend expense icon, or null when the expense deliberately has none.
 * @returns A curated Lucide name, with CircleHelp representing no or malformed icon data.
 */
export function expenseIconComponent(icon: string | null): IconComponent {
  if (icon === null) return 'CircleHelp'
  return expenseIcons[icon as keyof typeof expenseIcons] ?? 'CircleHelp'
}

/**
 * Validates one emoji grapheme so malformed wire data cannot become arbitrary display text.
 *
 * @param value - Text after the `emoji:` prefix.
 * @returns True when the text contains exactly one emoji grapheme.
 */
function isSingleEmoji(value: string): boolean {
  if (!emojiPattern.test(value)) return false
  if (typeof Intl.Segmenter === 'undefined')
    return emojiFallbackPattern.test(value)
  return (
    [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
        value,
      ),
    ].length === 1
  )
}
