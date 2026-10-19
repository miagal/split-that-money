// Hosts the global toast viewport and the hook that publishes into it.
// Handles auto-dismiss, hover pause, collapsing identical messages, and enter/exit motion.
// oxlint-disable react/only-export-components -- The public toast hook belongs with its provider.
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import {
  addToast,
  beginExit,
  nextRemaining,
  TOAST_EXIT_MS,
  toastCardClass,
  toastCountLabel,
  toastCountPillClass,
  toastDismissButtonClass,
  toastTimerProgress,
  toastViewportClass,
  type ToastItem,
  type ToastKind,
} from './toast-rules.ts'
import './toast.css'

// 44px tap target; the ring sits tight around the 18px X.
const TIMER_RING_SIZE = 44
const TIMER_RING_RADIUS = 12
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_RADIUS

type ToastApi = {
  success(message: string): void
  error(message: string): void
  info(message: string): void
}

const ToastContext = createContext<ToastApi | null>(null)

type ToastProviderProps = {
  children: ReactNode
}

/**
 * Provides short-lived, dismissible feedback messages for the whole application.
 *
 * @param props - The application subtree that may publish feedback.
 * @returns The subtree together with its toast viewport.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const pausedIds = useRef(new Set<string>())
  const viewportRef = useRef<HTMLDivElement>(null)
  const previousTops = useRef(new Map<string, number>())
  const exitTimers = useRef(new Map<string, number>())
  const stackOrder = toasts.map((toast) => `${toast.id}:${toast.count}`).join()

  // Advance remaining time every 100ms until a toast starts exiting.
  useEffect(() => {
    if (toasts.length === 0) return

    const timer = window.setInterval(() => {
      setToasts((current) =>
        current.flatMap((toast) => {
          if (toast.exiting) return [toast]
          const remainingMs = nextRemaining(
            toast,
            100,
            pausedIds.current.has(toast.id),
          )
          return remainingMs > 0
            ? [{ ...toast, remainingMs }]
            : [{ ...toast, remainingMs: 0, exiting: true }]
        }),
      )
    }, 100)

    return () => window.clearInterval(timer)
  }, [toasts.length])

  // Preserve each card's previous Y, then ease to the new stack position.
  useLayoutEffect(() => {
    const root = viewportRef.current
    if (!root) return
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const nextTops = new Map<string, number>()
    for (const node of root.children) {
      if (!(node instanceof HTMLElement)) continue
      const id = node.dataset.toastId
      if (!id) continue
      const top = node.getBoundingClientRect().top
      nextTops.set(id, top)
      const previousTop = previousTops.current.get(id)
      if (reduceMotion || previousTop === undefined) continue
      const dy = previousTop - top
      if (Math.abs(dy) < 1) continue
      node.style.transition = 'none'
      node.style.transform = `translateY(${dy}px)`
      void node.getBoundingClientRect()
      node.style.transition = ''
      node.style.transform = ''
    }
    previousTops.current = nextTops
  }, [stackOrder])

  // Timer and X only start the fade; drop the node after the exit animation.
  useEffect(() => {
    for (const toast of toasts) {
      if (!toast.exiting || exitTimers.current.has(toast.id)) continue
      const id = toast.id
      const timer = window.setTimeout(() => {
        exitTimers.current.delete(id)
        pausedIds.current.delete(id)
        setToasts((current) => current.filter((item) => item.id !== id))
      }, TOAST_EXIT_MS)
      exitTimers.current.set(id, timer)
    }
  }, [toasts])

  useEffect(() => {
    const timers = exitTimers.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
    }
  }, [])

  function publish(kind: ToastKind, message: string) {
    setToasts((current) => addToast(current, kind, message))
  }

  function dismiss(id: string) {
    setToasts((current) => beginExit(current, id))
  }

  const api: ToastApi = {
    success: (message) => publish('success', message),
    error: (message) => publish('error', message),
    info: (message) => publish('info', message),
  }

  return (
    <ToastContext value={api}>
      {children}
      <div
        ref={viewportRef}
        className={toastViewportClass()}
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-toast-id={toast.id}
            data-exiting={toast.exiting ? '' : undefined}
            className="toast-slot"
          >
            <div className="toast-slot-clip">
              <ToastCard
                toast={toast}
                onDismiss={() => dismiss(toast.id)}
                onPause={() => pausedIds.current.add(toast.id)}
                onResume={() => pausedIds.current.delete(toast.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </ToastContext>
  )
}

type ToastCardProps = {
  toast: ToastItem
  onDismiss(): void
  onPause(): void
  onResume(): void
}

/**
 * Renders one notification card with optional repeat count and a timed dismiss control.
 *
 * @param props - The toast record and dismiss/pause callbacks.
 */
function ToastCard({ toast, onDismiss, onPause, onResume }: ToastCardProps) {
  const isError = toast.kind === 'error'
  const countLabel = toastCountLabel(toast.count)

  return (
    <div
      className={toastCardClass(isError, toast.exiting === true)}
      role={isError ? 'alert' : 'status'}
      aria-atomic="true"
      onPointerEnter={onPause}
      onPointerLeave={onResume}
    >
      <p className="min-w-0 flex-1 break-words">
        {toast.message}
        {countLabel ? (
          <>
            <span className="sr-only">{` Shown ${toast.count} times`}</span>
            <span className={toastCountPillClass(isError)} aria-hidden="true">
              {countLabel}
            </span>
          </>
        ) : null}
      </p>
      <button
        type="button"
        aria-label="Dismiss notification"
        className={toastDismissButtonClass()}
        onClick={onDismiss}
      >
        <ToastTimerRing
          remainingMs={toast.remainingMs}
          kind={toast.kind}
          isError={isError}
        />
        <X aria-hidden="true" size={18} strokeWidth={2} />
      </button>
    </div>
  )
}

type ToastTimerRingProps = {
  remainingMs: number
  kind: ToastKind
  isError: boolean
}

/**
 * Draws the auto-dismiss countdown as a ring around the X, full to empty.
 *
 * @param props - Remaining time, toast kind, and error styling.
 * @returns An SVG ring that does not capture taps.
 */
function ToastTimerRing({ remainingMs, kind, isError }: ToastTimerRingProps) {
  const dashoffset =
    TIMER_RING_CIRCUMFERENCE * (1 - toastTimerProgress(remainingMs, kind))
  const center = TIMER_RING_SIZE / 2
  const strokeClass = isError ? 'text-danger' : 'text-accent'

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      viewBox={`0 0 ${TIMER_RING_SIZE} ${TIMER_RING_SIZE}`}
      aria-hidden="true"
    >
      <circle
        cx={center}
        cy={center}
        r={TIMER_RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-border"
      />
      <circle
        cx={center}
        cy={center}
        r={TIMER_RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={`${strokeClass} transition-[stroke-dashoffset] duration-100 ease-linear`}
        transform={`rotate(-90 ${center} ${center})`}
        strokeDasharray={TIMER_RING_CIRCUMFERENCE}
        strokeDashoffset={dashoffset}
      />
    </svg>
  )
}

/**
 * Reads the feedback API exposed by the nearest toast provider.
 *
 * @returns The success, error, and informational toast actions.
 * @throws {Error} When called outside a ToastProvider.
 */
export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider.')
  return context
}
