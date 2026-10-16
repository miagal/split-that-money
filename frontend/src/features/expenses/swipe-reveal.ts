// Pointer state for one mobile swipe-to-reveal row action at a time.
import { useRef, useState, type PointerEvent } from 'react'

export type SwipeState = 'closed' | 'revealed'

export type SwipeInput = {
  startX: number
  currentX: number
  width: number
}

/** Pixels of leftward travel before a touch gesture commits to swipe (vs scroll). */
export const SWIPE_CAPTURE_THRESHOLD_PX = 8

/**
 * Decides whether a completed horizontal pointer gesture reveals the row action.
 *
 * @param input - Gesture start and current x coordinates plus the row width.
 * @returns Revealed only for a leftward gesture reaching one quarter of the row width.
 */
export function swipeRevealState({
  startX,
  currentX,
  width,
}: SwipeInput): SwipeState {
  return currentX < startX && startX - currentX >= width * 0.25
    ? 'revealed'
    : 'closed'
}

/** Returns the visible leftward travel, capped at the delete action width. */
export function swipeOffset({
  startX,
  currentX,
}: Pick<SwipeInput, 'startX' | 'currentX'>): number {
  const distance = startX - currentX
  return distance > 0 ? -Math.min(distance, 72) : 0
}

/** Detects dominant vertical travel so the gesture is left to native scroll. */
export function swipeIsVerticalScroll({
  startX,
  startY,
  currentX,
  currentY,
  threshold = 8,
}: {
  startX: number
  startY: number
  currentX: number
  currentY: number
  threshold?: number
}): boolean {
  const dx = Math.abs(currentX - startX)
  const dy = Math.abs(currentY - startY)
  return dy > dx && dy >= threshold
}

/** True once leftward travel clearly means swipe-to-delete, not a vertical scroll. */
export function swipeShouldCapture({
  startX,
  startY,
  currentX,
  currentY,
  threshold = SWIPE_CAPTURE_THRESHOLD_PX,
}: {
  startX: number
  startY: number
  currentX: number
  currentY: number
  threshold?: number
}): boolean {
  const left = startX - currentX
  const dy = Math.abs(currentY - startY)
  return left >= threshold && left > dy
}

/**
 * Decides whether a completed pointer gesture must consume its following click.
 *
 * @param state - The resolved state of the completed gesture.
 * @returns Whether the row activation click should be skipped.
 */
export function swipeShouldSuppressActivation(state: SwipeState): boolean {
  return state === 'revealed'
}

type SwipeStart = {
  id: string
  x: number
  y: number
}

/**
 * Leaves nested controls in charge of their own pointer and keyboard events
 * when the swipe content shell is also the pressable surface (admin rows).
 *
 * @param event - The originating target and the row handling the bubbled event.
 * @returns Whether a nested control owns the event instead of the row.
 */
export function isNestedInteractiveTarget(event: {
  target: EventTarget
  currentTarget: EventTarget
}): boolean {
  const control = (event.target as Element).closest(
    'button, a, input, select, textarea, [role="button"], [contenteditable="true"]',
  )
  return Boolean(control && control !== event.currentTarget)
}

/**
 * Tracks the one list row whose left-swipe action is currently revealed.
 *
 * Swipe lives on a non-focusable content shell; activation (edit) stays on an
 * inner `<button>`. Pointer capture waits until leftward travel beats scroll so
 * vertical `pan-y` stays native.
 *
 * @returns The revealed row ID, a close action, and pointer handlers for each row.
 */
export function useSwipeReveal() {
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{
    id: string
    offset: number
  } | null>(null)
  const startRef = useRef<SwipeStart | null>(null)
  const suppressActivationRef = useRef(false)

  /** Starts tracking a phone touch without capturing — scroll stays free until swipe wins. */
  function onPointerDown(id: string) {
    return (event: PointerEvent<HTMLElement>): void => {
      suppressActivationRef.current = false
      if (
        event.pointerType !== 'touch' ||
        !window.matchMedia('(max-width: 767px)').matches
      )
        return
      // The revealed delete control is a sibling action; ignore if hit somehow.
      const target = event.target as Element
      if (
        typeof target.closest === 'function' &&
        target.closest('.swipe-reveal-action')
      )
        return
      setRevealedId(null)
      startRef.current = { id, x: event.clientX, y: event.clientY }
    }
  }

  /** Commits to swipe only after clear leftward travel; abandons on vertical scroll. */
  function onPointerMove(id: string) {
    return (event: PointerEvent<HTMLElement>): void => {
      const start = startRef.current
      if (!start || start.id !== id) return
      if (
        swipeIsVerticalScroll({
          startX: start.x,
          startY: start.y,
          currentX: event.clientX,
          currentY: event.clientY,
        })
      ) {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId)
        startRef.current = null
        setDragging(null)
        return
      }
      if (
        !swipeShouldCapture({
          startX: start.x,
          startY: start.y,
          currentX: event.clientX,
          currentY: event.clientY,
        })
      )
        return
      if (!event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.setPointerCapture(event.pointerId)
      setDragging({
        id,
        offset: swipeOffset({ startX: start.x, currentX: event.clientX }),
      })
    }
  }

  /** Resolves the captured gesture and replaces any previously revealed row. */
  function onPointerUp(id: string) {
    return (event: PointerEvent<HTMLElement>): void => {
      const start = startRef.current
      if (!start || start.id !== id) return
      const state = swipeRevealState({
        startX: start.x,
        currentX: event.clientX,
        width: event.currentTarget.getBoundingClientRect().width,
      })
      setRevealedId(state === 'revealed' ? id : null)
      setDragging(null)
      suppressActivationRef.current = swipeShouldSuppressActivation(state)
      startRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  /** Clears an interrupted gesture without changing the currently revealed row. */
  function onPointerCancel(): void {
    startRef.current = null
    setDragging(null)
    suppressActivationRef.current = false
  }

  /** Consumes the browser click that follows a completed revealing swipe. */
  function consumeActivation(): boolean {
    const suppress = suppressActivationRef.current
    suppressActivationRef.current = false
    return suppress
  }

  return {
    revealedId,
    dragOffset: (id: string) => (dragging?.id === id ? dragging.offset : 0),
    close: () => {
      setRevealedId(null)
      setDragging(null)
    },
    consumeActivation,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
