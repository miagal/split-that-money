// Owns the IndexedDB records used for local money data, known groups, and a safe cached session shell.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  ExpenseDto,
  ExpenseUpsertDto,
  GroupDto,
  SettlementDto,
  SettlementUpsertDto,
  UserDto,
  Uuid,
} from '../../api/contracts.ts'

export type MoneyStoreName =
  'groups' | 'expenses' | 'settlements' | 'cursors' | 'outbox' | 'session'
export type MutationKind = 'expense' | 'settlement'
export type MutationPayload = ExpenseUpsertDto | SettlementUpsertDto
export type LocalExpense = ExpenseDto & { groupId: Uuid }
export type LocalSettlement = SettlementDto & { groupId: Uuid }

export type CursorRow = { groupId: Uuid; value: string }
export type SessionRow = { key: 'current'; user: UserDto | null }
export type OutboxRow = {
  sequence?: number
  kind: MutationKind
  groupId: Uuid
  entityId: Uuid
  payload: MutationPayload
  sync_status: 'pending' | 'conflict' | 'error'
  code?: string
  message?: string
}

export class MoneyStoreEpochError extends Error {
  constructor() {
    super('Local money data is unavailable during an account transition.')
    this.name = 'MoneyStoreEpochError'
  }
}

let activeMoneyStoreEpoch = 0
let moneyStoreAvailable = false

/** Disables every store handle until the next epoch is enabled. */
export function beginMoneyStoreTransition(): number {
  moneyStoreAvailable = false
  return ++activeMoneyStoreEpoch
}

export function enableMoneyStoreEpoch(epoch: number): void {
  if (epoch === activeMoneyStoreEpoch) moneyStoreAvailable = true
}

export function moneyStoreEpochIsCurrent(epoch: number): boolean {
  return moneyStoreAvailable && epoch === activeMoneyStoreEpoch
}

/** Returns a fail-closed store while an account handoff owns the real database. */
function unavailableMoneyStore(): MoneyStore {
  const unavailable = () => {
    throw new MoneyStoreEpochError()
  }
  return {
    db: undefined as unknown as IDBPDatabase<MoneyDb>,
    close: () => undefined,
    getGroups: async () => [],
    putGroups: async () => unavailable(),
    getGroup: async () => undefined,
    getCachedSession: async () => null,
    setCachedSession: async () => unavailable(),
    clearCachedSession: async () => unavailable(),
    clearAccountData: async () => unavailable(),
    getCursor: async () => EPOCH_CURSOR,
    setCursor: async () => unavailable(),
    getExpenses: async () => [],
    getSettlements: async () => [],
    mergeExpenses: async () => unavailable(),
    mergeSettlements: async () => unavailable(),
    enqueueMutation: async () => unavailable(),
    listPending: async () => [],
    pendingCount: async () => 0,
    attentionCount: async () => 0,
    updateOutbox: async () => unavailable(),
    deleteOutbox: async () => unavailable(),
  }
}

interface MoneyDb extends DBSchema {
  groups: { key: Uuid; value: GroupDto }
  expenses: {
    key: Uuid
    value: LocalExpense
    indexes: { groupId: Uuid; updatedAt: string }
  }
  settlements: {
    key: Uuid
    value: LocalSettlement
    indexes: { groupId: Uuid; updatedAt: string }
  }
  cursors: { key: Uuid; value: CursorRow }
  outbox: {
    key: number
    value: OutboxRow
    indexes: { groupId: Uuid; status: OutboxRow['sync_status'] }
  }
  session: { key: 'current'; value: SessionRow }
}

export type MoneyStore = {
  db: IDBPDatabase<MoneyDb>
  close(): void
  getGroups(): Promise<GroupDto[]>
  putGroups(rows: GroupDto[]): Promise<void>
  getGroup(groupId: Uuid): Promise<GroupDto | undefined>
  getCachedSession(): Promise<UserDto | null>
  setCachedSession(user: UserDto): Promise<void>
  clearCachedSession(): Promise<void>
  clearAccountData(): Promise<void>
  getCursor(groupId: Uuid): Promise<string>
  setCursor(groupId: Uuid, value: string): Promise<void>
  getExpenses(groupId: Uuid): Promise<LocalExpense[]>
  getSettlements(groupId: Uuid): Promise<LocalSettlement[]>
  mergeExpenses(groupId: Uuid, rows: ExpenseDto[]): Promise<void>
  mergeSettlements(groupId: Uuid, rows: SettlementDto[]): Promise<void>
  enqueueMutation(
    row: Omit<OutboxRow, 'sequence' | 'sync_status'> & {
      sync_status?: OutboxRow['sync_status']
    },
  ): Promise<number>
  listPending(groupId: Uuid): Promise<OutboxRow[]>
  pendingCount(): Promise<number>
  attentionCount(): Promise<number>
  updateOutbox(row: OutboxRow): Promise<void>
  deleteOutbox(sequence: number): Promise<void>
}

const DB_NAME = 'split-that-money'
const DB_VERSION = 2
const ACCOUNT_DATA_STORES = [
  'groups',
  'expenses',
  'settlements',
  'cursors',
  'outbox',
] as const
export const EPOCH_CURSOR = '1970-01-01T00:00:00.000Z'

export async function openMoneyStore(
  options: { allowDuringTransition?: boolean } = {},
): Promise<MoneyStore> {
  const epoch = activeMoneyStoreEpoch
  if (!options.allowDuringTransition && !moneyStoreAvailable)
    return unavailableMoneyStore()
  const assertAccess = () => {
    if (
      epoch !== activeMoneyStoreEpoch ||
      (!options.allowDuringTransition && !moneyStoreAvailable)
    )
      throw new MoneyStoreEpochError()
  }
  const db = await openDB<MoneyDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('groups'))
        database.createObjectStore('groups', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('expenses')) {
        const store = database.createObjectStore('expenses', { keyPath: 'id' })
        store.createIndex('groupId', 'groupId')
        store.createIndex('updatedAt', 'updated_at')
      }
      if (!database.objectStoreNames.contains('settlements')) {
        const store = database.createObjectStore('settlements', {
          keyPath: 'id',
        })
        store.createIndex('groupId', 'groupId')
        store.createIndex('updatedAt', 'updated_at')
      }
      if (!database.objectStoreNames.contains('cursors'))
        database.createObjectStore('cursors', { keyPath: 'groupId' })
      if (!database.objectStoreNames.contains('outbox')) {
        const store = database.createObjectStore('outbox', {
          keyPath: 'sequence',
          autoIncrement: true,
        })
        store.createIndex('groupId', 'groupId')
        store.createIndex('status', 'sync_status')
      }
      if (!database.objectStoreNames.contains('session'))
        database.createObjectStore('session', { keyPath: 'key' })
    },
  })

  return {
    db,
    close: () => db.close(),
    async getGroups() {
      assertAccess()
      const rows = await db.getAll('groups')
      assertAccess()
      return rows
    },
    async putGroups(rows) {
      assertAccess()
      const tx = db.transaction('groups', 'readwrite')
      await Promise.all(rows.map((row) => tx.store.put(row)))
      await tx.done
      assertAccess()
    },
    async getGroup(groupId) {
      assertAccess()
      const row = await db.get('groups', groupId)
      assertAccess()
      return row
    },
    async getCachedSession() {
      assertAccess()
      const session = await db.get('session', 'current')
      assertAccess()
      return session?.user ?? null
    },
    async setCachedSession(user) {
      assertAccess()
      await db.put('session', { key: 'current', user })
      assertAccess()
    },
    async clearCachedSession() {
      assertAccess()
      await db.delete('session', 'current')
      assertAccess()
    },
    async clearAccountData() {
      assertAccess()
      await db.put('session', { key: 'current', user: null })
      assertAccess()
      const tx = db.transaction([...ACCOUNT_DATA_STORES], 'readwrite')
      await Promise.all(
        ACCOUNT_DATA_STORES.map((name) => tx.objectStore(name).clear()),
      )
      await tx.done
      assertAccess()
    },
    async getCursor(groupId) {
      assertAccess()
      const cursor = await db.get('cursors', groupId)
      assertAccess()
      return cursor?.value ?? EPOCH_CURSOR
    },
    async setCursor(groupId, value) {
      assertAccess()
      await db.put('cursors', { groupId, value })
      assertAccess()
    },
    async getExpenses(groupId) {
      assertAccess()
      const rows = await db.getAllFromIndex('expenses', 'groupId', groupId)
      assertAccess()
      return rows
    },
    async getSettlements(groupId) {
      assertAccess()
      const rows = await db.getAllFromIndex('settlements', 'groupId', groupId)
      assertAccess()
      return rows
    },
    async mergeExpenses(groupId, rows) {
      assertAccess()
      const tx = db.transaction('expenses', 'readwrite')
      await Promise.all(
        rows.map(async (row) => {
          const existing = await tx.store.get(row.id)
          assertAccess()
          if (!existing || existing.updated_at <= row.updated_at)
            await tx.store.put({ ...row, groupId })
        }),
      )
      await tx.done
      assertAccess()
    },
    async mergeSettlements(groupId, rows) {
      assertAccess()
      const tx = db.transaction('settlements', 'readwrite')
      await Promise.all(
        rows.map(async (row) => {
          const existing = await tx.store.get(row.id)
          assertAccess()
          if (!existing || existing.updated_at <= row.updated_at)
            await tx.store.put({ ...row, groupId })
        }),
      )
      await tx.done
      assertAccess()
    },
    async enqueueMutation(row) {
      assertAccess()
      const sequence = await db.add('outbox', {
        ...row,
        sync_status: row.sync_status ?? 'pending',
      })
      assertAccess()
      return sequence
    },
    async listPending(groupId) {
      assertAccess()
      const rows = await db.getAllFromIndex('outbox', 'groupId', groupId)
      assertAccess()
      return rows.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    },
    async pendingCount() {
      assertAccess()
      const count = await db.count('outbox')
      assertAccess()
      return count
    },
    async attentionCount() {
      assertAccess()
      const [conflicts, errors] = await Promise.all([
        db.countFromIndex('outbox', 'status', 'conflict'),
        db.countFromIndex('outbox', 'status', 'error'),
      ])
      assertAccess()
      return conflicts + errors
    },
    async updateOutbox(row) {
      assertAccess()
      await db.put('outbox', row)
      assertAccess()
    },
    async deleteOutbox(sequence) {
      assertAccess()
      await db.delete('outbox', sequence)
      assertAccess()
    },
  }
}
