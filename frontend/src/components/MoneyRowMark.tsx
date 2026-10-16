// Renders a money-list category circle with an optional outbox sync badge overlay.
import { TriangleAlert, Upload } from 'lucide-react'
import type { ReactNode } from 'react'
import type { OutboxSyncStatus } from '../features/sync/pending-marks.ts'

type MoneyRowMarkProps = {
  children: ReactNode
  syncStatus?: OutboxSyncStatus
}

/**
 * Keeps the category circle footprint stable while an outbox row is waiting.
 *
 * @param props.children - Category or settlement icon inside the circle.
 * @param props.syncStatus - Outbox status for this entity, or omitted when synced.
 */
export function MoneyRowMark({ children, syncStatus }: MoneyRowMarkProps) {
  const needsAttention =
    syncStatus === 'conflict' || syncStatus === 'error'
  return (
    <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
      {children}
      {syncStatus ? (
        <span
          className={`sync-badge-waiting absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full ${
            needsAttention ? 'text-danger' : 'text-amber-500'
          }`}
          role="status"
          aria-label={
            needsAttention ? 'Sync needs attention' : 'Waiting to sync'
          }
          title={needsAttention ? 'Sync needs attention' : 'Waiting to sync'}
        >
          {needsAttention ? (
            <TriangleAlert aria-hidden size={10} />
          ) : (
            <Upload aria-hidden size={10} />
          )}
        </span>
      ) : null}
    </span>
  )
}
