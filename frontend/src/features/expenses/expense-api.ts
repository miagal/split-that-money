// Maps expense forms to sync payloads and persists each local-first mutation before background sync.
import type {
  UserDto,
  ExpenseDto,
  ExpenseIcon,
  ExpenseUpsertDto,
  Uuid,
} from '../../api/contracts.ts'
import type { MoneyStore, OutboxRow } from '../sync/database.ts'
import { enqueueMutation } from '../sync/outbox.ts'
import { validateSplit } from './split.ts'
import { clientUuid } from '../../lib/uuid.ts'

type ExpenseFormFields = {
  title: string
  amountCents: number
  date: string
  payer: Uuid
  splitType: ExpenseUpsertDto['split_type']
  icon: ExpenseIcon
  note: string
  shares: Array<{ user: Uuid; value: number }>
}
type NewExpenseForm = ExpenseFormFields & { id?: undefined }
type ExistingExpenseForm = ExpenseFormFields & {
  id: Uuid
  createdBy: Uuid
  createdAt: string
  createdOnDevice: string | null
}
export type ExpenseForm = NewExpenseForm | ExistingExpenseForm

/** Builds the client-owned wire payload for a new or edited expense. */
export function toExpenseUpsert(
  form: ExpenseForm,
  session: UserDto,
  groupId: Uuid,
): ExpenseUpsertDto {
  const now = new Date().toISOString()
  if (form.id)
    return {
      id: form.id,
      created_by: form.createdBy,
      created_at: form.createdAt,
      updated_at: now,
      title: form.title.trim(),
      amount_cents: form.amountCents,
      date: form.date,
      payer: form.payer,
      split_type: form.splitType,
      icon: form.icon ?? null,
      note: form.note.trim(),
      shares: form.shares,
      created_on_device: form.createdOnDevice,
    }
  return {
    id: clientUuid(),
    created_by: session.id,
    created_at: now,
    updated_at: now,
    title: form.title.trim(),
    amount_cents: form.amountCents,
    date: form.date,
    payer: form.payer,
    split_type: form.splitType,
    icon: form.icon ?? null,
    note: form.note.trim(),
    shares: form.shares,
    created_on_device: deviceId(groupId),
  }
}

/** Writes the optimistic local expense before enqueueing the same payload for sync. */
export async function queueExpense(
  store: MoneyStore,
  payload: ExpenseUpsertDto,
  groupId: Uuid,
  enqueue?: (
    row: Omit<OutboxRow, 'sequence' | 'sync_status'> & {
      sync_status?: OutboxRow['sync_status']
    },
  ) => Promise<number>,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!isCurrent()) return
  const local: ExpenseDto & { groupId: Uuid } = payloadToDto(payload, groupId)
  await store.mergeExpenses(groupId, [local])
  if (!isCurrent()) return
  const row = {
    kind: 'expense' as const,
    groupId,
    entityId: payload.id,
    payload,
  }
  if (enqueue) await enqueue(row)
  else await enqueueMutation(store, row)
}

/** Queues a tombstone while retaining the expense's immutable sync fingerprint. */
export async function deleteExpense(
  store: MoneyStore,
  expense: ExpenseDto & { groupId: Uuid },
  enqueue?: Parameters<typeof queueExpense>[3],
  isCurrent?: Parameters<typeof queueExpense>[4],
): Promise<void> {
  const now = new Date().toISOString()
  await queueExpense(
    store,
    {
      id: expense.id,
      created_by: expense.created_by,
      created_at: expense.created_at,
      updated_at: now,
      title: expense.title,
      amount_cents: expense.amount_cents,
      date: expense.date,
      payer: expense.payer,
      split_type: expense.split_type,
      icon: expense.icon,
      note: expense.note,
      shares: expense.shares.map(({ user, value }) => ({ user, value })),
      deleted: true,
      created_on_device: expense.created_on_device,
    },
    expense.groupId,
    enqueue,
    isCurrent,
  )
}

function payloadToDto(
  payload: ExpenseUpsertDto,
  groupId = '',
): ExpenseDto & { groupId: Uuid } {
  const split = validateSplit({
    mode: payload.split_type,
    amountCents: payload.amount_cents,
    participants: payload.shares.map((share) => share.user),
    values: payload.shares.map((share) => share.value),
  })
  if (split.error) throw new Error(split.error)
  return {
    ...payload,
    icon: payload.icon ?? null,
    note: payload.note ?? '',
    created_on_device: payload.created_on_device ?? null,
    updated_by: payload.created_by,
    deleted: payload.deleted ?? false,
    shares: payload.shares.map((share) => ({
      ...share,
      amount_cents: split.amounts[share.user] ?? 0,
    })),
    groupId,
  }
}

function deviceId(groupId: Uuid): string {
  const key = 'split-that-money-device-id'
  const existing =
    typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  if (existing) return existing
  const value = `${groupId}:${clientUuid()}`
  if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  return value
}
