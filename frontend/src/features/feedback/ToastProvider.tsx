// oxlint-disable react/only-export-components -- The public toast hook belongs with its provider.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import {
  addToast,
  nextRemaining,
  type ToastItem,
  type ToastKind,
} from './toast-rules.ts'

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

  useEffect(() => {
    if (toasts.length === 0) return

    const timer = window.setInterval(() => {
      setToasts((current) =>
        current.flatMap((toast) => {
          const remainingMs = nextRemaining(
            toast,
            100,
            pausedIds.current.has(toast.id),
          )
          return remainingMs > 0 ? [{ ...toast, remainingMs }] : []
        }),
      )
    }, 100)

    return () => window.clearInterval(timer)
  }, [toasts.length])

  function publish(kind: ToastKind, message: string) {
    setToasts((current) => addToast(current, kind, message))
  }

  function dismiss(id: string) {
    pausedIds.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
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
        className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-stretch gap-3 sm:inset-x-auto sm:right-4 sm:w-[min(24rem,calc(100vw-2rem))]"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
            onPause={() => pausedIds.current.add(toast.id)}
            onResume={() => pausedIds.current.delete(toast.id)}
          />
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

function ToastCard({ toast, onDismiss, onPause, onResume }: ToastCardProps) {
  const isError = toast.kind === 'error'
  const borderClass = isError ? 'border-danger' : 'border-border'

  return (
    <div
      className={`toast-enter pointer-events-auto flex items-center gap-3 rounded-xl border bg-surface-raised p-4 text-base shadow-lg ${borderClass}`}
      role={isError ? 'alert' : 'status'}
      aria-atomic="true"
      onPointerEnter={onPause}
      onPointerLeave={onResume}
    >
      <p className="min-w-0 flex-1 break-words">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="shrink-0 rounded-md text-accent transition-colors hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={onDismiss}
      >
        <X aria-hidden="true" size={18} strokeWidth={2} />
      </button>
    </div>
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
