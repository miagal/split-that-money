// Supplies the narrow pointer state needed to reveal one mobile expense-row action at a time.
import { useRef, useState, type PointerEvent } from 'react'

export type SwipeState = 'closed' | 'revealed'

export type SwipeInput = {
  startX: number
  currentX: number
  width: number
}

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
}

/**
 * Leaves nested controls in charge of their own pointer and keyboard events.
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
 * Tracks the one expense row whose left-swipe action is currently revealed.
 *
 * @returns The revealed row ID, a close action, and pointer-capturing handlers for each row.
 */
export function useSwipeReveal() {
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{
    id: string
    offset: number
  } | null>(null)
  const startRef = useRef<SwipeStart | null>(null)
  const suppressActivationRef = useRef(false)

  /** Captures phone touch gestures so release stays associated with their row. */
  function onPointerDown(id: string) {
    return (event: PointerEvent<HTMLElement>): void => {
      suppressActivationRef.current = false
      if (
        event.pointerType !== 'touch' ||
        !window.matchMedia('(max-width: 767px)').matches ||
        isNestedInteractiveTarget(event)
      )
        return
      setRevealedId(null)
      startRef.current = { id, x: event.clientX }
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  /** Mirrors leftward finger travel so the delete action appears before release. */
  function onPointerMove(id: string) {
    return (event: PointerEvent<HTMLElement>): void => {
      const start = startRef.current
      if (!start || start.id !== id) return
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
