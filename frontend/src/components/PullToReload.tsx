// Adds a touch pull gesture to the authenticated app's existing scroll region.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { pullToReloadState, shouldPreventPull } from './pull-to-reload-rules.ts'

const threshold = 72

/** Renders one scroll region and reloads after a completed touch pull from its top. */
export function PullToReload({
  children,
  className,
}: {
  children: ReactNode
  className: string
}) {
  const regionRef = useRef<HTMLDivElement>(null)
  const touchRef = useRef<{
    id: number
    startY: number
    startScrollTop: number
    state: 'idle' | 'pulling' | 'ready'
  } | null>(null)
  const [state, setState] = useState<'idle' | 'pulling' | 'ready'>('idle')

  useEffect(() => {
    const region = regionRef.current
    if (!region) return
    const element: HTMLDivElement = region

    function reset() {
      touchRef.current = null
      setState('idle')
    }

    function changedTouch(event: TouchEvent) {
      return Array.from(event.changedTouches).find(
        (touch) => touch.identifier === touchRef.current?.id,
      )
    }

    function onTouchStart(event: TouchEvent) {
      if (touchRef.current || event.touches.length !== 1) return
      if (event.target instanceof Element && event.target.closest('dialog'))
        return
      const touch = event.changedTouches[0]
      touchRef.current = {
        id: touch.identifier,
        startY: touch.clientY,
        startScrollTop: element.scrollTop,
        state: 'idle',
      }
    }

    function onTouchMove(event: TouchEvent) {
      const touch = changedTouch(event)
      const active = touchRef.current
      if (!touch || !active) return
      const position = {
        startY: active.startY,
        currentY: touch.clientY,
        startScrollTop: active.startScrollTop,
        scrollTop: element.scrollTop,
      }
      if (shouldPreventPull(position)) event.preventDefault()
      active.state = pullToReloadState({ ...position, threshold })
      setState(active.state)
    }

    function onTouchEnd(event: TouchEvent) {
      if (!changedTouch(event)) return
      const ready =
        touchRef.current?.state === 'ready' && element.scrollTop === 0
      reset()
      if (ready) window.location.reload()
    }

    function onTouchCancel(event: TouchEvent) {
      if (changedTouch(event)) reset()
    }

    region.addEventListener('touchstart', onTouchStart)
    region.addEventListener('touchmove', onTouchMove, { passive: false })
    region.addEventListener('touchend', onTouchEnd)
    region.addEventListener('touchcancel', onTouchCancel)
    return () => {
      region.removeEventListener('touchstart', onTouchStart)
      region.removeEventListener('touchmove', onTouchMove)
      region.removeEventListener('touchend', onTouchEnd)
      region.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [])

  return (
    <div ref={regionRef} className={`pull-to-reload ${className}`}>
      <div
        aria-hidden="true"
        className={`pull-to-reload-indicator pull-to-reload-indicator--${state}`}
      />
      {children}
    </div>
  )
}
