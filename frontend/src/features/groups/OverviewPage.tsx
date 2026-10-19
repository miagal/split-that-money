// Summarises the current member's local balance, payments to make, and latest group activity.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BedDouble,
  CarFront,
  CircleHelp,
  Coffee,
  HandCoins,
  Handshake,
  PartyPopper,
  Plus,
  ShoppingBasket,
  Ticket,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type {
  ExpenseDto,
  SettlementDto,
  SuggestedTransferDto,
} from '../../api/contracts.ts'
import { useAuth, useSyncStatus } from '../../app/providers.tsx'
import { MoneyRowMark } from '../../components/money-row-mark/MoneyRowMark.tsx'
import { expenseIconComponent } from '../../lib/icons.ts'
import { formatMoney } from '../../lib/money.ts'
import { compactNames } from '../../lib/names.ts'
import {
  blurAfterPress,
  blurOnTouchScroll,
  moneyListRowClass,
  pressableMoneyRowClass,
} from '../../lib/pressable-row.ts'
import { computeBalances, suggestTransfers } from '../balances/balances.ts'
import { SettlementDialog } from '../balances/SettlementDialog.tsx'
import { ExpenseDialog } from '../expenses/ExpenseDialog.tsx'
import { openMoneyStore } from '../sync/database.ts'
import {
  entityOutboxStatus,
  type OutboxSyncStatus,
} from '../sync/pending-marks.ts'
import { useGroup } from './group-context.ts'
import {
  balanceLabel,
  isOutgoingTransferForUser,
  latestActivity,
} from './group-view-rules.ts'

type SettlementPrefill = {
  initialFrom: string
  initialTo: string
  initialAmountCents: number
}

const expenseIcons: Record<string, LucideIcon> = {
  UtensilsCrossed,
  Coffee,
  ShoppingBasket,
  CarFront,
  Ticket,
  BedDouble,
  PartyPopper,
  CircleHelp,
}

/** Renders a compact group overview for the signed-in member. */
export function OverviewPage() {
  const { group, setHeaderAction } = useGroup()
  const { session } = useAuth()
  const syncStatus = useSyncStatus()
  const [expenses, setExpenses] = useState<ExpenseDto[]>([])
  const [settlements, setSettlements] = useState<SettlementDto[]>([])
  const [expenseSync, setExpenseSync] = useState(
    () => new Map<string, OutboxSyncStatus>(),
  )
  const [settlementSync, setSettlementSync] = useState(
    () => new Map<string, OutboxSyncStatus>(),
  )
  const [settlementDialog, setSettlementDialog] = useState(false)
  const [expenseDialog, setExpenseDialog] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseDto>()
  const [editingSettlement, setEditingSettlement] = useState<SettlementDto>()
  const [settlementPrefill, setSettlementPrefill] =
    useState<SettlementPrefill>()
  const [initialListLoadComplete, setInitialListLoadComplete] = useState(false)

  const load = useCallback(() => {
    void openMoneyStore().then(async (store) => {
      try {
        const [storedExpenses, storedSettlements, pending] = await Promise.all([
          store.getExpenses(group.id),
          store.getSettlements(group.id),
          store.listPending(group.id),
        ])
        setExpenses(storedExpenses)
        setSettlements(storedSettlements)
        setExpenseSync(entityOutboxStatus(pending, 'expense'))
        setSettlementSync(entityOutboxStatus(pending, 'settlement'))
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
  const balance = session ? (balances[session.id] ?? 0) : 0
  const transfers: SuggestedTransferDto[] = suggestTransfers(balances).map(
    (transfer) => ({
      from_user_id: transfer.fromUserId,
      to_user_id: transfer.toUserId,
      amount_cents: transfer.amountCents,
    }),
  )
  const outgoing = transfers.filter((transfer) =>
    isOutgoingTransferForUser(transfer, session?.id),
  )
  const activity = latestActivity(expenses, settlements)
  const canManageMoney = group.memberships.some(
    (membership) => membership.is_active && membership.user.id === session?.id,
  )
  const names = useMemo(
    () =>
      compactNames(
        group.memberships.map((membership) => membership.user),
        { currentUserId: session?.id },
      ),
    [group.memberships, session?.id],
  )
  const memberName = (id: string) => names[id] ?? 'A group member'
  const amountClass = [
    'text-3xl font-bold tabular-nums',
    balance > 0
      ? 'text-emerald-300'
      : balance < 0
        ? 'text-red-400'
        : 'text-white',
  ].join(' ')

  /** Opens one generated payment with its sender, receiver, and total already selected. */
  function openSuggestedPayment(transfer: SuggestedTransferDto): void {
    setEditingSettlement(undefined)
    setSettlementPrefill({
      initialFrom: transfer.from_user_id,
      initialTo: transfer.to_user_id,
      initialAmountCents: transfer.amount_cents,
    })
    setSettlementDialog(true)
  }

  /** Opens the expense editor for one Latest activity row. */
  function editExpense(expense: ExpenseDto): void {
    setEditingExpense(expense)
    setExpenseDialog(true)
  }

  /** Opens the payment editor for one Latest activity settlement row. */
  function editSettlement(settlement: SettlementDto): void {
    setSettlementPrefill(undefined)
    setEditingSettlement(settlement)
    setSettlementDialog(true)
  }

  useEffect(() => {
    if (!canManageMoney) return
    setHeaderAction(
      <button
        className="grid size-10 place-items-center rounded-full bg-accent text-accent-contrast"
        type="button"
        aria-label="Add expense"
        onClick={() => {
          setEditingExpense(undefined)
          setExpenseDialog(true)
        }}
      >
        <Plus aria-hidden size={20} />
      </button>,
    )
    return () => setHeaderAction(null)
  }, [canManageMoney, setHeaderAction])

  return (
    <section className="grid gap-5">
      {canManageMoney && (
        <button
          className="fixed bottom-4 right-[1.125rem] z-30 grid size-11 place-items-center rounded-full bg-accent text-accent-contrast md:hidden"
          type="button"
          aria-label="Add expense"
          onClick={() => {
            setEditingExpense(undefined)
            setExpenseDialog(true)
          }}
        >
          <Plus aria-hidden size={20} />
        </button>
      )}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <article
          className={`flex items-center justify-between gap-5 rounded-2xl border border-white/15 bg-slate-950 px-5 py-4 text-white ${
            // Match settle-up height on desktop when more than one payment row is shown.
            outgoing.length > 1 ? 'md:self-end md:py-5' : 'md:py-3'
          }`}
        >
          <div>
            <p className="text-sm text-white/70">Your balance</p>
            <p className="mt-1 text-sm text-white/70">
              {balanceLabel(balance)}
            </p>
          </div>
          <p className={amountClass}>{formatMoney(balance, group.currency)}</p>
        </article>
        <section className="grid content-start gap-3">
          {initialListLoadComplete && (
            <div className="list-enter grid content-start gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Settle up</h2>
                <Link
                  className="inline-flex items-center gap-1 text-sm font-bold text-accent"
                  to={`/groups/${group.id}/balances`}
                >
                  See all <ArrowRight aria-hidden size={15} />
                </Link>
              </div>
              {outgoing.length === 0 ? (
                <p className="empty-state">You are all settled.</p>
              ) : (
                <ul className="min-h-[4.5rem] divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-raised">
                  {outgoing.map((transfer) => (
                    <li key={`${transfer.from_user_id}-${transfer.to_user_id}`}>
                      <button
                        className={pressableMoneyRowClass}
                        type="button"
                        aria-label={`Pay ${memberName(transfer.to_user_id)}`}
                        onClick={(event) => {
                          openSuggestedPayment(transfer)
                          blurAfterPress(event)
                        }}
                        onTouchMove={blurOnTouchScroll}
                      >
                        <MoneyRowMark>
                          <Handshake aria-hidden size={18} />
                        </MoneyRowMark>
                        <span className="min-w-0 truncate font-semibold">
                          Pay {memberName(transfer.to_user_id)}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatMoney(transfer.amount_cents, group.currency)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
      <section>
        {initialListLoadComplete && (
          <div className="list-enter">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Latest activity</h2>
              <Link
                className="inline-flex items-center gap-1 text-sm font-bold text-accent"
                to={`/groups/${group.id}/expenses`}
              >
                All expenses <ArrowRight aria-hidden size={15} />
              </Link>
            </div>
            {activity.length === 0 ? (
              <p className="empty-state">No local activity yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface-raised">
                {activity.map((item) =>
                  item.kind === 'expense' ? (
                    <ActivityExpense
                      key={`expense-${item.record.id}`}
                      expense={item.record}
                      memberName={memberName}
                      currency={group.currency}
                      syncStatus={expenseSync.get(item.record.id)}
                      editable={canManageMoney}
                      onEdit={editExpense}
                    />
                  ) : (
                    <ActivitySettlement
                      key={`settlement-${item.record.id}`}
                      settlement={item.record}
                      memberName={memberName}
                      currency={group.currency}
                      syncStatus={settlementSync.get(item.record.id)}
                      editable={canManageMoney}
                      onEdit={editSettlement}
                    />
                  ),
                )}
              </ul>
            )}
          </div>
        )}
      </section>
      <SettlementDialog
        open={settlementDialog}
        groupId={group.id}
        currency={group.currency}
        members={group.memberships}
        settlement={editingSettlement}
        initialFrom={
          editingSettlement
            ? undefined
            : (settlementPrefill?.initialFrom ?? session?.id)
        }
        initialTo={editingSettlement ? undefined : settlementPrefill?.initialTo}
        initialAmountCents={
          editingSettlement
            ? undefined
            : settlementPrefill?.initialAmountCents
        }
        onClose={() => setSettlementDialog(false)}
        onSaved={load}
      />
      <ExpenseDialog
        open={expenseDialog}
        groupId={group.id}
        currency={group.currency}
        members={group.memberships}
        expense={editingExpense}
        onClose={() => setExpenseDialog(false)}
        onSaved={load}
      />
    </section>
  )
}

/** Renders one recent expense with its payer and locally formatted total. */
function ActivityExpense({
  expense,
  memberName,
  currency,
  syncStatus,
  editable,
  onEdit,
}: {
  expense: ExpenseDto
  memberName: (id: string) => string
  currency: string
  syncStatus?: OutboxSyncStatus
  editable: boolean
  onEdit: (expense: ExpenseDto) => void
}) {
  const body = (
    <>
      <ExpenseMark icon={expense.icon} syncStatus={syncStatus} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{expense.title}</span>
        <span className="block truncate text-sm text-muted">
          {expense.date} · {memberName(expense.payer)}
        </span>
      </span>
      <span className="shrink-0 font-semibold tabular-nums">
        {formatMoney(expense.amount_cents, currency)}
      </span>
    </>
  )
  if (!editable)
    return (
      <li className={moneyListRowClass}>{body}</li>
    )
  return (
    <li>
      <button
        className={pressableMoneyRowClass}
        type="button"
        aria-label={`Edit ${expense.title}`}
        onClick={(event) => {
          onEdit(expense)
          blurAfterPress(event)
        }}
        onTouchMove={blurOnTouchScroll}
      >
        {body}
      </button>
    </li>
  )
}

/** Renders one recent payment distinctly from expenses. */
function ActivitySettlement({
  settlement,
  memberName,
  currency,
  syncStatus,
  editable,
  onEdit,
}: {
  settlement: SettlementDto
  memberName: (id: string) => string
  currency: string
  syncStatus?: OutboxSyncStatus
  editable: boolean
  onEdit: (settlement: SettlementDto) => void
}) {
  const body = (
    <>
      <MoneyRowMark syncStatus={syncStatus}>
        <HandCoins aria-hidden size={18} />
      </MoneyRowMark>
      <span className="min-w-0">
        <span className="block truncate font-semibold">
          {memberName(settlement.from_user)} paid{' '}
          {memberName(settlement.to_user)}
        </span>
        <span className="block truncate text-sm text-muted">Payment</span>
      </span>
      <span className="shrink-0 font-semibold tabular-nums">
        {formatMoney(settlement.amount_cents, currency)}
      </span>
    </>
  )
  if (!editable)
    return (
      <li className={moneyListRowClass}>{body}</li>
    )
  return (
    <li>
      <button
        className={pressableMoneyRowClass}
        type="button"
        aria-label={`Edit payment from ${memberName(settlement.from_user)} to ${memberName(settlement.to_user)}`}
        onClick={(event) => {
          onEdit(settlement)
          blurAfterPress(event)
        }}
        onTouchMove={blurOnTouchScroll}
      >
        {body}
      </button>
    </li>
  )
}

/** Renders an expense category marker matching the Expenses list treatment. */
function ExpenseMark({
  icon,
  syncStatus,
}: {
  icon: ExpenseDto['icon']
  syncStatus?: OutboxSyncStatus
}) {
  const Icon = expenseIcons[expenseIconComponent(icon)] ?? CircleHelp
  return (
    <MoneyRowMark syncStatus={syncStatus}>
      <Icon aria-hidden size={18} />
    </MoneyRowMark>
  )
}
