// Sync controller: pulls and pushes group data and derives the one visible sync status.
// The status is computed from facts (running sync, reachability, local errors, outbox counts) instead of being stored.
// Pull and push requests abort after SYNC_REQUEST_TIMEOUT_MS so a dead server cannot leave the badge on Syncing.
// Interacts with the outbox push, the local money store, and the API client's failure classification.
import {
  ApiError,
  AuthEpochError,
  isNotAuthenticated,
  isTransportFailure,
} from '../../api/client.ts'
import type { ApiClient } from '../../api/client.ts'
import type { SyncPullDto, Uuid } from '../../api/contracts.ts'
import type { MoneyStore } from './database.ts'
import { EPOCH_CURSOR, MoneyStoreEpochError } from './database.ts'
import { pushOutbox } from './outbox.ts'

export type SyncStatus =
  | 'Synced'
  | 'Syncing'
  | 'Changes waiting to sync'
  | 'Server not reachable'
  | 'Needs attention'
/** Facts the visible sync status is derived from. */
export type SyncFacts = {
  syncing: boolean
  unreachable: boolean
  localError: boolean
  attention: number
  pending: number
}
export type SyncSnapshot = { status: SyncStatus; pending: number }
export const SYNC_OVERLAP_MS = 2_000
export const SYNC_REQUEST_TIMEOUT_MS = 8_000

/**
 * Converts the server's public sync timeout to milliseconds.
 *
 * @param seconds - `SYNC_REQUEST_TIMEOUT_SECONDS` from public config.
 * @returns The configured timeout, or eight seconds for missing or invalid values.
 */
export function syncRequestTimeoutMs(seconds: unknown): number {
  return typeof seconds === 'number' && seconds > 0
    ? seconds * 1000
    : SYNC_REQUEST_TIMEOUT_MS
}

export function canStartInitialGroupSync(
  groupId: Uuid,
  ready: boolean,
): boolean {
  return ready && groupId.length > 0
}

export function nextCursor(previous: string, received: string[]): string {
  const greatest = [previous, ...received]
    .map((value) => new Date(value))
    .reduce(
      (current, value) => (value > current ? value : current),
      new Date(EPOCH_CURSOR),
    )
  return greatest.toISOString().replace('.000Z', 'Z')
}

/**
 * Maps sync facts to the one visible status; earlier checks win.
 *
 * Syncing ranks first so a finished sync still refreshes local pages after a conflict exists.
 */
export function syncStatus(facts: SyncFacts): SyncStatus {
  if (facts.syncing) return 'Syncing'
  if (facts.attention > 0 || facts.localError) return 'Needs attention'
  if (facts.unreachable) return 'Server not reachable'
  if (facts.pending > 0) return 'Changes waiting to sync'
  return 'Synced'
}

export function cursorWithOverlap(cursor: string): string {
  return new Date(
    Math.max(0, new Date(cursor).getTime() - SYNC_OVERLAP_MS),
  ).toISOString()
}

/**
 * Pulls, pushes the outbox, then pulls again; stops quietly once the account epoch is stale.
 *
 * @param store Local money store holding data, cursors, and the outbox.
 * @param client API client used for pull and push requests.
 * @param groupId Group to synchronise.
 * @param isCurrent Reports whether the account epoch is still active.
 * @param requestTimeoutMs Abort bound for one pull or push request.
 */
export async function syncGroup(
  store: MoneyStore,
  client: ApiClient,
  groupId: Uuid,
  isCurrent: () => boolean = () => true,
  requestTimeoutMs: number = SYNC_REQUEST_TIMEOUT_MS,
): Promise<void> {
  if (!isCurrent()) return
  await pullGroup(store, client, groupId, isCurrent, requestTimeoutMs)
  if (!isCurrent()) return
  await pushOutbox(store, client, groupId, isCurrent, requestTimeoutMs)
  if (!isCurrent()) return
  await pullGroup(store, client, groupId, isCurrent, requestTimeoutMs)
}

async function pullGroup(
  store: MoneyStore,
  client: ApiClient,
  groupId: Uuid,
  isCurrent: () => boolean,
  requestTimeoutMs: number,
): Promise<void> {
  const cursor = await store.getCursor(groupId)
  if (!isCurrent()) return
  const result = await client.request<SyncPullDto>(
    `groups/${encodeURIComponent(groupId)}/sync/pull/?since=${encodeURIComponent(cursorWithOverlap(cursor))}`,
    { signal: AbortSignal.timeout(requestTimeoutMs) },
    isCurrent,
  )
  if (!isCurrent()) return
  await store.mergeExpenses(groupId, result.expenses)
  if (!isCurrent()) return
  await store.mergeSettlements(groupId, result.settlements)
  if (!isCurrent()) return
  const timestamps = [...result.expenses, ...result.settlements].map(
    (row) => row.updated_at,
  )
  if (timestamps.length > 0)
    await store.setCursor(groupId, nextCursor(cursor, timestamps))
}

export type SyncStatusController = {
  getSnapshot(): SyncSnapshot
  subscribe(listener: () => void): () => void
  sync(groupId: Uuid): Promise<void>
  registerGroup(groupId: Uuid): void
  unregisterGroup(groupId: Uuid): void
  enqueue(row: Parameters<MoneyStore['enqueueMutation']>[0]): Promise<number>
  online(): Promise<void>
  offline(): void
}

/**
 * Creates the controller that serializes group syncs and publishes the derived status.
 *
 * @param store Local money store holding data, cursors, and the outbox.
 * @param client API client used for pull and push requests.
 * @param isCurrent Reports whether the account epoch that created the controller is still active.
 * @param onSessionExpired Called when the server reports a missing session.
 * @param requestTimeoutMs Abort bound for one pull or push request; keeps Syncing from hanging on a dead server.
 * @returns A controller whose snapshot is stable between changes, for use with external-store subscriptions.
 */
export function createSyncStatusController(
  store: MoneyStore,
  client: ApiClient,
  isCurrent: () => boolean = () => true,
  onSessionExpired: () => void = () => undefined,
  requestTimeoutMs: number = SYNC_REQUEST_TIMEOUT_MS,
): SyncStatusController {
  const browserOffline = () =>
    typeof navigator !== 'undefined' && !navigator.onLine
  const facts: SyncFacts = {
    syncing: false,
    unreachable: browserOffline(),
    localError: false,
    attention: 0,
    pending: 0,
  }
  let snapshot: SyncSnapshot = { status: syncStatus(facts), pending: 0 }
  let running = 0
  let queueFailed = false
  let chain: Promise<unknown> = Promise.resolve()
  const waiting = new Map<Uuid, Promise<void>>()
  const groups = new Set<Uuid>()
  const listeners = new Set<() => void>()
  // A stale account epoch must not touch the status of the account that replaced it.
  const publish = (change: Partial<SyncFacts>) => {
    if (!isCurrent()) return
    Object.assign(facts, change)
    snapshot = { status: syncStatus(facts), pending: facts.pending }
    listeners.forEach((listener) => listener())
  }
  const refreshCounts = async () => {
    const [pending, attention] = await Promise.all([
      store.pendingCount(),
      store.attentionCount(),
    ])
    publish({ pending, attention })
  }
  // Turns a failed sync into fact changes; epoch changes and expired sessions are not sync problems.
  const classify = (error: unknown): Partial<SyncFacts> => {
    if (
      !isCurrent() ||
      error instanceof AuthEpochError ||
      error instanceof MoneyStoreEpochError
    )
      return {}
    if (isNotAuthenticated(error)) {
      onSessionExpired()
      return {}
    }
    if (isTransportFailure(error) || error instanceof ApiError)
      return { unreachable: true }
    return { localError: true }
  }
  const sync = (groupId: Uuid): Promise<void> => {
    if (!isCurrent()) return Promise.resolve()
    if (browserOffline()) {
      publish({ unreachable: true })
      return Promise.resolve()
    }
    const queued = waiting.get(groupId)
    if (queued) return queued
    // A drained queue may retry after a dead server; leftover groups in this burst must not.
    if (running === 0) queueFailed = false
    running += 1
    publish({ syncing: true })
    const run = chain
      .then(async (): Promise<Partial<SyncFacts>> => {
        // A request arriving while this group runs must queue again so newer outbox rows are pushed.
        waiting.delete(groupId)
        if (!isCurrent()) return {}
        if (browserOffline() || queueFailed) return { unreachable: true }
        try {
          await syncGroup(
            store,
            client,
            groupId,
            isCurrent,
            requestTimeoutMs,
          )
          return { unreachable: false, localError: false }
        } catch (error) {
          const change = classify(error)
          if (change.unreachable) queueFailed = true
          return change
        }
      })
      .then(async (change) => {
        await refreshCounts().catch(() => undefined)
        running -= 1
        publish({ ...change, syncing: running > 0 })
      })
    waiting.set(groupId, run)
    chain = run
    return run
  }
  void refreshCounts().catch(() => undefined)
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    sync,
    registerGroup: (groupId) => {
      groups.add(groupId)
    },
    unregisterGroup: (groupId) => {
      groups.delete(groupId)
    },
    enqueue: async (row) => {
      if (!isCurrent()) return 0
      const sequence = await store.enqueueMutation(row)
      if (!isCurrent()) return 0
      groups.add(row.groupId)
      await refreshCounts().catch(() => undefined)
      if (!browserOffline())
        void Promise.resolve().then(() => sync(row.groupId))
      return sequence
    },
    online: async () => {
      publish({ unreachable: false })
      for (const groupId of groups) await sync(groupId)
    },
    offline: () => {
      publish({ unreachable: true })
    },
  }
}
