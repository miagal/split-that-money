// Computes local balances and queues settlement mutations for background sync.
import type {
  ExpenseDto,
  SettlementDto,
  SettlementUpsertDto,
  UserDto,
  Uuid,
} from '../../api/contracts.ts'
import { clientUuid } from '../../lib/uuid.ts'
import type { MoneyStore, OutboxRow } from '../sync/database.ts'
import { enqueueMutation } from '../sync/outbox.ts'

export type BalanceMap = Record<string, number>
export type Transfer = {
  fromUserId: string
  toUserId: string
  amountCents: number
}
export type SettlementForm = {
  id?: Uuid
  fromUser: Uuid
  toUser: Uuid
  amountCents: number
}
export type SettlementFormDefaults = { from: string; to: string }

/** Chooses the sender and receiver shown when the payment dialog opens. */
export function settlementFormDefaults(
  memberIds: string[],
  initialFrom?: string,
  initialTo?: string,
  sessionId?: string,
): SettlementFormDefaults {
  const from = initialFrom ?? sessionId ?? memberIds[0] ?? ''
  const to =
    initialTo ??
    memberIds.find((memberId) => memberId !== (initialFrom ?? sessionId)) ??
    ''
  return { from, to }
}

/** Identifies one open-dialog input set so local fields reset once per relevant change. */
export function settlementDialogResetKey(
  open: boolean,
  memberIds: string[],
  initialFrom?: string,
  initialTo?: string,
  sessionId?: string,
): string | null {
  return open
    ? JSON.stringify([initialFrom, initialTo, sessionId, memberIds])
    : null
}

/** Derives balances from local records. Positive values are owed to the user. */
export function computeBalances(
  expenses: ExpenseDto[],
  settlements: SettlementDto[],
): BalanceMap {
  const balances: BalanceMap = {}
  for (const expense of expenses) {
    if (expense.deleted) continue
    balances[expense.payer] =
      (balances[expense.payer] ?? 0) + expense.amount_cents
    for (const share of expense.shares)
      balances[share.user] = (balances[share.user] ?? 0) - share.amount_cents
  }
  for (const settlement of settlements) {
    if (settlement.deleted) continue
    balances[settlement.from_user] =
      (balances[settlement.from_user] ?? 0) + settlement.amount_cents
    balances[settlement.to_user] =
      (balances[settlement.to_user] ?? 0) - settlement.amount_cents
  }
  return balances
}

/** Greedily matches stable, sorted debtors with stable, sorted creditors. */
export function suggestTransfers(balances: BalanceMap): Transfer[] {
  const debtors = Object.entries(balances)
    .filter(([, value]) => value < 0)
    .sort(([a, av], [b, bv]) => av - bv || a.localeCompare(b))
    .map(([id, value]) => [id, -value] as [string, number])
  const creditors = Object.entries(balances)
    .filter(([, value]) => value > 0)
    .sort(([a, av], [b, bv]) => bv - av || a.localeCompare(b))
    .map(([id, value]) => [id, value] as [string, number])
  const transfers: Transfer[] = []
  let debtor = 0
  let creditor = 0
  while (debtor < debtors.length && creditor < creditors.length) {
    const amount = Math.min(debtors[debtor][1], creditors[creditor][1])
    transfers.push({
      fromUserId: debtors[debtor][0],
      toUserId: creditors[creditor][0],
      amountCents: amount,
    })
    debtors[debtor][1] -= amount
    creditors[creditor][1] -= amount
    if (debtors[debtor][1] === 0) debtor += 1
    if (creditors[creditor][1] === 0) creditor += 1
  }
  return transfers
}

export function toSettlementUpsert(
  form: SettlementForm,
  session: UserDto,
  groupId: Uuid,
): SettlementUpsertDto {
  const now = new Date().toISOString()
  return {
    id: form.id ?? clientUuid(),
    created_by: session.id,
    created_at: now,
    updated_at: now,
    from_user: form.fromUser,
    to_user: form.toUser,
    amount_cents: form.amountCents,
    created_on_device: deviceId(groupId),
  }
}

export async function queueSettlement(
  store: MoneyStore,
  payload: SettlementUpsertDto,
  groupId: Uuid,
  enqueue?: (
    row: Omit<OutboxRow, 'sequence' | 'sync_status'> & {
      sync_status?: OutboxRow['sync_status']
    },
  ) => Promise<number>,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!isCurrent()) return
  const local: SettlementDto & { groupId: Uuid } = {
    ...payload,
    updated_by: payload.created_by,
    deleted: payload.deleted ?? false,
    created_on_device: payload.created_on_device ?? null,
    groupId,
  }
  await store.mergeSettlements(groupId, [local])
  if (!isCurrent()) return
  const row = {
    kind: 'settlement' as const,
    groupId,
    entityId: payload.id,
    payload,
  }
  if (enqueue) await enqueue(row)
  else await enqueueMutation(store, row)
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
