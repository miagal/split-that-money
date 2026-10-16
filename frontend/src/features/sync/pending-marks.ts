// Maps outbox rows to the per-entity sync mark used by money list icons.

export type OutboxSyncStatus = 'pending' | 'conflict' | 'error'

type OutboxMarkRow = {
  entityId: string
  kind: string
  sync_status: OutboxSyncStatus
}

const STATUS_RANK: Record<OutboxSyncStatus, number> = {
  pending: 0,
  conflict: 1,
  error: 2,
}

/**
 * Builds the strongest outbox status per entity for one mutation kind.
 *
 * @param rows - Outbox rows for any kind; other kinds are ignored.
 * @param kind - Mutation kind to keep (`expense` or `settlement`).
 * @returns Map of entity id to the highest-priority status still waiting.
 */
export function entityOutboxStatus(
  rows: OutboxMarkRow[],
  kind: string,
): Map<string, OutboxSyncStatus> {
  const status = new Map<string, OutboxSyncStatus>()
  for (const row of rows) {
    if (row.kind !== kind) continue
    const previous = status.get(row.entityId)
    if (!previous || STATUS_RANK[row.sync_status] > STATUS_RANK[previous])
      status.set(row.entityId, row.sync_status)
  }
  return status
}
