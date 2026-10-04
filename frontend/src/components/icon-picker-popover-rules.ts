// Defines the browser-independent dismissal decisions for an anchored icon picker.

type PopoverTarget = 'anchor' | 'content' | 'outside'

type PopoverCloseInput = {
  key?: string
  target: PopoverTarget
}

export type PopoverCloseReason = 'close' | 'keep-open'
export type PopoverPointerAction = 'close-and-consume-click' | 'keep-open'

type PopoverAnchorPosition = {
  bottom: number
  left: number
}

/**
 * Decides whether an icon picker should dismiss for one keyboard or pointer interaction.
 *
 * @param input - The pressed key when relevant and the target's relationship to the picker.
 * @returns Whether the controlled popover should close.
 */
export function popoverCloseReason({
  key,
  target,
}: PopoverCloseInput): PopoverCloseReason {
  if (key !== undefined) return key === 'Escape' ? 'close' : 'keep-open'
  return target === 'outside' ? 'close' : 'keep-open'
}

/**
 * Decides whether an outside pointer should also consume its matching click.
 *
 * @param target - The pointer target's relationship to the picker.
 * @returns The pointer dismissal action for the picker owner.
 */
export function popoverPointerAction(
  target: PopoverTarget,
): PopoverPointerAction {
  return popoverCloseReason({ target }) === 'close'
    ? 'close-and-consume-click'
    : 'keep-open'
}

/**
 * Provides a non-empty accessible name when an icon picker caller has none of its own.
 *
 * @param label - Optional caller-supplied dialog label.
 * @returns The usable accessible name for the popover dialog.
 */
export function iconPickerPopoverLabel(label?: string): string {
  return label?.trim() || 'Choose an icon'
}

/**
 * Positions a viewport-level popover just below its trigger.
 *
 * @param anchor - The trigger's viewport bottom and left coordinates.
 * @returns Fixed-position coordinates for the popover surface.
 */
export function popoverPosition({ bottom, left }: PopoverAnchorPosition): {
  top: number
  left: number
} {
  return { top: bottom + 8, left }
}
