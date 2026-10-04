// Shows member balances and settlement suggestions while retaining the existing payment dialog.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Handshake, Plus } from 'lucide-react'
import type { ExpenseDto, SettlementDto } from '../../api/contracts.ts'
import { useAuth, useSyncStatus } from '../../app/providers.tsx'
import { Avatar } from '../../components/Avatar.tsx'
import { formatMoney } from '../../lib/money.ts'
import { compactNames } from '../../lib/names.ts'
import { useGroup } from '../groups/group-context.ts'
import { isOutgoingTransferForUser } from '../groups/group-view-rules.ts'
import { openMoneyStore } from '../sync/database.ts'
import { computeBalances, suggestTransfers, type Transfer } from './balances.ts'
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
  const transfers = suggestTransfers(balances)
  const memberNames = useMemo(
    () =>
      compactNames(
        group.memberships.map((membership) => membership.user),
        { currentUserId: session?.id },
      ),
    [group.memberships, session?.id],
  )
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
            {group.memberships.map((membership) => {
              const balance = balances[membership.user.id] ?? 0
              const label = memberName(membership.user.id)
              return (
                <li
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4"
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
                          ? 'shrink-0 font-semibold tabular-nums text-danger'
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
                {transfers.map((transfer) =>
                  canManageMoney &&
                  isOutgoingTransferForUser(
                    {
                      from_user_id: transfer.fromUserId,
                      to_user_id: transfer.toUserId,
                      amount_cents: transfer.amountCents,
                    },
                    session?.id,
                  ) ? (
                    <li key={`${transfer.fromUserId}-${transfer.toUserId}`}>
                      <button
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 text-left hover:bg-accent/10"
                        type="button"
                        aria-label={`Pay ${memberName(transfer.toUserId)}`}
                        onClick={() => openSuggestedPayment(transfer)}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 truncate font-semibold">
                            {memberName(transfer.fromUserId)}
                            <ArrowRight aria-hidden size={16} />
                            <span className="sr-only"> pays </span>
                            {memberName(transfer.toUserId)}
                          </span>
                          <span className="block text-sm text-muted">
                            Suggested transfer
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="grid size-9 place-items-center rounded-full bg-accent/10 text-accent">
                            <Handshake aria-hidden size={18} />
                          </span>
                          <span className="font-semibold tabular-nums">
                            {formatMoney(transfer.amountCents, group.currency)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ) : (
                    <li
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4"
                      key={`${transfer.fromUserId}-${transfer.toUserId}`}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 truncate font-semibold">
                          {memberName(transfer.fromUserId)}
                          <ArrowRight aria-hidden size={16} />
                          <span className="sr-only"> pays </span>
                          {memberName(transfer.toUserId)}
                        </p>
                        <p className="text-sm text-muted">Suggested transfer</p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatMoney(transfer.amountCents, group.currency)}
                      </span>
                    </li>
                  ),
                )}
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
