// Renders a caller-owned icon picker surface that dismisses without owning selection or commit state.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  iconPickerPopoverLabel,
  popoverCloseReason,
  popoverPointerAction,
  popoverPosition,
} from './icon-picker-popover-rules.ts'

type IconPickerPopoverProps = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  id?: string
  ariaLabel?: string
}

/**
 * Renders an anchored picker surface and closes it only for outside pointers or Escape.
 *
 * @param props - Visibility, caller-owned trigger reference, close callback, optional ID, and picker content.
 * @returns An absolutely positioned dialog surface when open, otherwise nothing.
 */
export function IconPickerPopover({
  open,
  anchorRef,
  onClose,
  children,
  id,
  ariaLabel,
}: IconPickerPopoverProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{
    top: number
    left: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!open) return

    /** Keeps the fixed-position surface aligned when its trigger or viewport moves. */
    function updatePosition(): void {
      const anchor = anchorRef.current
      if (!anchor) return
      setPosition(popoverPosition(anchor.getBoundingClientRect()))
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, open])

  useEffect(() => {
    if (!open) return

    /** Closes on outside pointers while reserving their matching click for picker dismissal. */
    function onPointerDown(event: PointerEvent): void {
      const target = event.target
      if (!(target instanceof Node)) return
      const targetArea = anchorRef.current?.contains(target)
        ? 'anchor'
        : surfaceRef.current?.contains(target)
          ? 'content'
          : 'outside'
      if (popoverPointerAction(targetArea) !== 'close-and-consume-click') return

      /** Prevents the click following this pointerdown from activating the parent dialog backdrop. */
      function consumeMatchingClick(clickEvent: MouseEvent): void {
        document.removeEventListener('click', consumeMatchingClick, true)
        if (clickEvent.target !== target) return
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
      }

      document.addEventListener('click', consumeMatchingClick, true)
      onClose()
    }

    /** Provides the same lightweight dismissal path for keyboard users. */
    function onKeyDown(event: KeyboardEvent): void {
      if (popoverCloseReason({ key: event.key, target: 'content' }) !== 'close')
        return
      event.preventDefault()
      event.stopPropagation()
      onClose()
      anchorRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [anchorRef, onClose, open])

  if (!open || !position) return null
  return (
    <div
      ref={surfaceRef}
      id={id}
      className="icon-picker-popover"
      role="dialog"
      aria-label={iconPickerPopoverLabel(ariaLabel)}
      style={position}
    >
      {children}
    </div>
  )
}
