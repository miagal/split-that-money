// Shows member balances and settlement suggestions while retaining the existing payment dialog.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Handshake, Plus } from 'lucide-react'
import type { ExpenseDto, SettlementDto } from '../../api/contracts.ts'
import { useAuth, useSyncStatus } from '../../app/providers.tsx'
import { Avatar } from '../../components/Avatar.tsx'
import { MoneyRowMark } from '../../components/MoneyRowMark.tsx'
import { formatMoney } from '../../lib/money.ts'
import {
  blurAfterPress,
  blurOnTouchScroll,
  moneyListRowClass,
  pressableMoneyRowClass,
} from '../../lib/pressable-row.ts'
import { compactNames } from '../../lib/names.ts'
import { useGroup } from '../groups/group-context.ts'
import { isOutgoingTransferForUser } from '../groups/group-view-rules.ts'
import { openMoneyStore } from '../sync/database.ts'
import {
  computeBalances,
  prioritizeTransfersForUser,
  suggestTransfers,
  type Transfer,
} from './balances.ts'
import { SettlementDialog } from './SettlementDialog.tsx'

type SettlementPrefill = {
  initialFrom: string
  initialTo: string
  initialAmountCents: number
}

/** Renders every member's balance and the transfers that settle the group. */
export function BalancesPage() {
  const { group, setHeaderAction } = useGroup()
  const { session } = useAuth()
  const syncStatus = useSyncStatus()
  const [expenses, setExpenses] = useState<ExpenseDto[]>([])
  const [settlements, setSettlements] = useState<SettlementDto[]>([])
  const [dialog, setDialog] = useState(false)
  const [settlementPrefill, setSettlementPrefill] =
    useState<SettlementPrefill>()
  const [initialListLoadComplete, setInitialListLoadComplete] = useState(false)
  const load = useCallback(() => {
    void openMoneyStore().then(async (store) => {
      try {
        setExpenses(await store.getExpenses(group.id))
        setSettlements(await store.getSettlements(group.id))
      } finally {
        store.close()
        setInitialListLoadComplete(true)
      }
    })
  }, [group.id])
  useEffect(() => {
    load()
  }, [load, syncStatus])
  const balances = computeBalances(expenses, settlements)
  const transfers = useMemo(
    () =>
      prioritizeTransfersForUser(suggestTransfers(balances), session?.id),
    [balances, session?.id],
  )
  const memberNames = useMemo(
    () =>
      compactNames(
        group.memberships.map((membership) => membership.user),
        { currentUserId: session?.id },
      ),
    [group.memberships, session?.id],
  )
  // Keep membership order, but pin the signed-in member ("You") to the top.
  const balanceMembers = useMemo(() => {
    const currentId = session?.id
    if (!currentId) return group.memberships
    return [
      ...group.memberships.filter(
        (membership) => membership.user.id === currentId,
      ),
      ...group.memberships.filter(
        (membership) => membership.user.id !== currentId,
      ),
    ]
  }, [group.memberships, session?.id])
  const memberName = (id: string) => memberNames[id] ?? 'Member'
  /** Opens a manual payment without a generated transfer prefill. */
  function openPaymentDialog(): void {
    setSettlementPrefill(undefined)
    setDialog(true)
  }
  const canManageMoney = group.memberships.some(
    (membership) => membership.is_active && membership.user.id === session?.id,
  )
  useEffect(() => {
    if (!canManageMoney) return
    setHeaderAction(
      <button
        className="grid size-10 place-items-center rounded-full bg-accent text-accent-contrast"
        type="button"
        aria-label="Record payment"
        onClick={openPaymentDialog}
      >
        <Plus aria-hidden size={20} />
      </button>,
    )
    return () => setHeaderAction(null)
  }, [canManageMoney, setHeaderAction])
  /** Opens an outgoing generated payment with its sender, receiver, and amount selected. */
  function openSuggestedPayment(transfer: Transfer): void {
    setSettlementPrefill({
      initialFrom: transfer.fromUserId,
      initialTo: transfer.toUserId,
      initialAmountCents: transfer.amountCents,
    })
    setDialog(true)
  }
  return (
    <section className="grid gap-6">
      {canManageMoney && (
        <button
          className="fixed bottom-4 right-4 z-30 grid size-11 place-items-center rounded-full bg-accent text-accent-contrast md:hidden"
          type="button"
          aria-label="Record payment"
          onClick={openPaymentDialog}
        >
          <Plus aria-hidden size={20} />
        </button>
      )}
      {initialListLoadComplete && (
        <>
          <ul className="list-enter divide-y divide-border rounded-xl border border-border bg-surface-raised">
            {balanceMembers.map((membership) => {
              const balance = balances[membership.user.id] ?? 0
              const label = memberName(membership.user.id)
              return (
                <li
                  className={moneyListRowClass}
                  key={membership.id}
                >
                  <Avatar member={membership.user} label={label} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{label}</p>
                    <p className="text-sm text-muted">
                      {membership.is_active ? 'Active member' : 'Former member'}
                    </p>
                  </div>
                  <span
                    className={
                      balance > 0
                        ? 'shrink-0 font-semibold tabular-nums text-accent'
                        : balance < 0
                          ? 'balance-negative shrink-0 font-semibold tabular-nums'
                          : 'shrink-0 font-semibold tabular-nums'
                    }
                  >
                    {formatMoney(balance, group.currency)}
                  </span>
                </li>
              )
            })}
          </ul>
          <section className="list-enter">
            <h3 className="mb-3 text-lg font-bold">Suggested transfers</h3>
            {transfers.length === 0 ? (
              <p className="empty-state">Everyone is settled.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface-raised">
                {transfers.map((transfer) => {
                  const actionable =
                    canManageMoney &&
                    isOutgoingTransferForUser(
                      {
                        from_user_id: transfer.fromUserId,
                        to_user_id: transfer.toUserId,
                        amount_cents: transfer.amountCents,
                      },
                      session?.id,
                    )
                  const names = (
                    <span className="flex min-w-0 items-center gap-1 truncate font-semibold">
                      {memberName(transfer.fromUserId)}
                      <ArrowRight aria-hidden size={16} />
                      <span className="sr-only"> pays </span>
                      {memberName(transfer.toUserId)}
                    </span>
                  )
                  const amount = (
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatMoney(transfer.amountCents, group.currency)}
                    </span>
                  )
                  // Accent mark = you can pay; muted mark = someone else must settle.
                  const mark = actionable ? (
                    <MoneyRowMark>
                      <Handshake aria-hidden size={18} />
                    </MoneyRowMark>
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted/15 text-muted">
                      <Handshake aria-hidden size={18} />
                    </span>
                  )
                  return actionable ? (
                    <li key={`${transfer.fromUserId}-${transfer.toUserId}`}>
                      <button
                        className={pressableMoneyRowClass}
                        type="button"
                        aria-label={`Pay ${memberName(transfer.toUserId)}`}
                        onClick={(event) => {
                          openSuggestedPayment(transfer)
                          blurAfterPress(event)
                        }}
                        onTouchMove={blurOnTouchScroll}
                      >
                        {mark}
                        {names}
                        {amount}
                      </button>
                    </li>
                  ) : (
                    <li
                      className={moneyListRowClass}
                      key={`${transfer.fromUserId}-${transfer.toUserId}`}
                    >
                      {mark}
                      {names}
                      {amount}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
      <SettlementDialog
        open={dialog}
        groupId={group.id}
        currency={group.currency}
        members={group.memberships}
        initialFrom={settlementPrefill?.initialFrom ?? session?.id}
        initialTo={settlementPrefill?.initialTo}
        initialAmountCents={settlementPrefill?.initialAmountCents}
        onClose={() => setDialog(false)}
        onSaved={load}
      />
    </section>
  )
}
