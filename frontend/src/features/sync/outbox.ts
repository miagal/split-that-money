import {
  ApiError,
  isNotAuthenticated,
  type ApiClient,
} from '../../api/client.ts'
import { SYNC_REQUEST_TIMEOUT_MS } from './sync.ts'
import type { SyncPushDto, Uuid } from '../../api/contracts.ts'
import type { MoneyStore, OutboxRow } from './database.ts'

export function enqueueMutation(
  store: MoneyStore,
  row: Omit<OutboxRow, 'sequence' | 'sync_status'> & {
    sync_status?: OutboxRow['sync_status']
  },
): Promise<number> {
  return store.enqueueMutation(row)
}

export function outboxDisposition(
  row: Pick<SyncPushDto['expenses'][number], 'sync_status'>,
): 'delete' | 'needs-attention' {
  return row.sync_status === 'conflict' || row.sync_status === 'error'
    ? 'needs-attention'
    : 'delete'
}

/**
 * Pushes a group's outbox rows in order, one request per row.
 *
 * Server outcomes and rejected rows are stored on the row. Any other failure
 * leaves the row untouched and rejects, so the caller can classify it.
 *
 * @param store Local money store holding the outbox rows.
 * @param client API client used for each push request.
 * @param groupId Group whose pending rows are pushed.
 * @param isCurrent Reports whether the account epoch is still active.
 * @param requestTimeoutMs Abort bound for one push request.
 */
export async function pushOutbox(
  store: MoneyStore,
  client: ApiClient,
  groupId: Uuid,
  isCurrent: () => boolean = () => true,
  requestTimeoutMs: number = SYNC_REQUEST_TIMEOUT_MS,
): Promise<void> {
  const rows = await store.listPending(groupId)
  for (const row of rows) {
    if (!isCurrent()) return
    if (row.sync_status === 'conflict') continue
    const payload =
      row.kind === 'expense'
        ? { expenses: [row.payload], settlements: [] }
        : { expenses: [], settlements: [row.payload] }
    let result: SyncPushDto
    try {
      result = await client.request<SyncPushDto>(
        `groups/${encodeURIComponent(groupId)}/sync/push/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(requestTimeoutMs),
        },
        isCurrent,
      )
    } catch (error) {
      if (!isRejectedRow(error)) throw error
      if (!isCurrent()) return
      await store.updateOutbox({
        ...row,
        sync_status: 'error',
        code: error.code,
        message: error.message,
      })
      continue
    }
    if (!isCurrent()) return
    const outcome =
      row.kind === 'expense' ? result.expenses[0] : result.settlements[0]
    if (!outcome || outboxDisposition(outcome) === 'delete')
      await store.deleteOutbox(row.sequence!)
    else
      await store.updateOutbox({
        ...row,
        sync_status: outcome.sync_status as 'conflict' | 'error',
        code: 'code' in outcome ? outcome.code : undefined,
        message: 'message' in outcome ? outcome.message : undefined,
      })
  }
}

/** A 4xx answer other than a missing session rejects this one row, not the whole sync. */
function isRejectedRow(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    !isNotAuthenticated(error)
  )
}
