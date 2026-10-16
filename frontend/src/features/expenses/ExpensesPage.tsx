// Lists a group's local expenses and settlements, with edit activation and confirmed deletion.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BedDouble,
  CarFront,
  CircleHelp,
  Coffee,
  HandCoins,
  PartyPopper,
  Plus,
  ShoppingBasket,
  Ticket,
  Trash2,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { ExpenseDto, SettlementDto } from '../../api/contracts.ts'
import { useAuth, useSyncActions, useSyncStatus } from '../../app/providers.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { MoneyRowMark } from '../../components/MoneyRowMark.tsx'
import { expenseIconComponent } from '../../lib/icons.ts'
import { formatMoney } from '../../lib/money.ts'
import { compactNames } from '../../lib/names.ts'
import {
  blurAfterPress,
  blurOnTouchScroll,
  moneyListRowClass,
  pressableMoneyRowClass,
} from '../../lib/pressable-row.ts'
import { SettlementDialog } from '../balances/SettlementDialog.tsx'
import { useToast } from '../feedback/ToastProvider.tsx'
import { toastMessage } from '../feedback/api-feedback.ts'
import { useGroup } from '../groups/group-context.ts'
import { newRowIds } from '../groups/groups-page-rules.ts'
import { openMoneyStore } from '../sync/database.ts'
import {
  entityOutboxStatus,
  type OutboxSyncStatus,
} from '../sync/pending-marks.ts'
import { ExpenseDialog, removeExpense } from './ExpenseDialog.tsx'
import { expenseDeleteQuestion } from './expense-submit-rules.ts'
import {
  EXPENSE_PAGE_SIZE,
  expenseListEntryClass,
  expenseListState,
  nextVisibleExpenseCount,
  sortExpensesForList,
} from './expense-list-rules.ts'
import { useSwipeReveal } from './swipe-reveal.ts'

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

/** Renders a group's recorded expenses and settlements. */
export function ExpensesPage() {
  const { group, setHeaderAction } = useGroup()
  const { session, cacheEpoch, isCacheEpochCurrent } = useAuth()
  const syncStatus = useSyncStatus()
  const { enqueue } = useSyncActions()
  const toast = useToast()
  const toastRef = useRef(toast)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const {
    revealedId,
    dragOffset,
    close: closeSwipe,
    consumeActivation,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = useSwipeReveal()
  const [expenses, setExpenses] = useState<ExpenseDto[]>([])
  const [settlements, setSettlements] = useState<SettlementDto[]>([])
  const [expenseSync, setExpenseSync] = useState(
    () => new Map<string, OutboxSyncStatus>(),
  )
  const [settlementSync, setSettlementSync] = useState(
    () => new Map<string, OutboxSyncStatus>(),
  )
  const [editingExpense, setEditingExpense] = useState<ExpenseDto>()
  const [editingSettlement, setEditingSettlement] = useState<SettlementDto>()
  const [expenseDialog, setExpenseDialog] = useState(false)
  const [settlementDialog, setSettlementDialog] = useState(false)
  const [pendingDeletion, setPendingDeletion] = useState<ExpenseDto>()
  const [deleting, setDeleting] = useState(false)
  const [visibleExpenseCount, setVisibleExpenseCount] =
    useState(EXPENSE_PAGE_SIZE)
  const [initialListLoadComplete, setInitialListLoadComplete] = useState(false)
  const initialExpensePaintDoneRef = useRef(false)
  const seenExpenseIdsRef = useRef(new Set<string>())

  useEffect(() => {
    toastRef.current = toast
  }, [toast])
  const load = useCallback(() => {
    void openMoneyStore()
      .then(async (store) => {
        try {
          const [storedExpenses, storedSettlements, pending] =
            await Promise.all([
              store.getExpenses(group.id),
              store.getSettlements(group.id),
              store.listPending(group.id),
            ])
          setExpenses(storedExpenses.filter((expense) => !expense.deleted))
          setSettlements(
            storedSettlements.filter((settlement) => !settlement.deleted),
          )
          setExpenseSync(entityOutboxStatus(pending, 'expense'))
          setSettlementSync(entityOutboxStatus(pending, 'settlement'))
        } finally {
          store.close()
        }
      })
      .catch(() => toastRef.current.error('Could not load local expenses.'))
      .finally(() => setInitialListLoadComplete(true))
  }, [group.id])
  useEffect(() => {
    load()
  }, [load, syncStatus])
  const canManageMoney = group.memberships.some(
    (membership) => membership.is_active && membership.user.id === session?.id,
  )
  const sortedExpenses = useMemo(
    () => sortExpensesForList(expenses),
    [expenses],
  )
  const visibleExpenses = sortedExpenses.slice(0, visibleExpenseCount)
  const listState = expenseListState(initialListLoadComplete, expenses.length)
  // oxlint-disable react/refs -- This render-time ref bookkeeping is required so new rows get list-enter on their first visible render without effect state.
  const enteringExpenseIds = newRowIds(
    seenExpenseIdsRef.current,
    visibleExpenses,
    initialExpensePaintDoneRef.current,
  )
  visibleExpenses.forEach((expense) =>
    seenExpenseIdsRef.current.add(expense.id),
  )
  if (initialListLoadComplete) initialExpensePaintDoneRef.current = true
  // oxlint-enable react/refs

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || visibleExpenses.length === sortedExpenses.length) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting)
        setVisibleExpenseCount((count) =>
          nextVisibleExpenseCount(count, sortedExpenses.length),
        )
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [sortedExpenses.length, visibleExpenses.length])
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

  /** Opens the one confirmation gate shared by desktop, mobile, and edit-footer deletion controls. */
  function requestExpenseDeletion(expense: ExpenseDto): void {
    closeSwipe()
    setPendingDeletion(expense)
  }

  /** Deletes the pending expense through the existing local-first tombstone flow. */
  async function confirmExpenseDeletion(): Promise<void> {
    if (!pendingDeletion) return
    setDeleting(true)
    try {
      const writeEpoch = cacheEpoch
      await removeExpense(
        { ...pendingDeletion, groupId: group.id },
        load,
        enqueue,
        () => isCacheEpochCurrent(writeEpoch),
      )
      toast.success('Expense deleted.')
      setPendingDeletion(undefined)
      setEditingExpense(undefined)
      setExpenseDialog(false)
    } catch (reason) {
      toast.error(
        toastMessage(reason) ?? 'Could not save changes. Please try again.',
      )
    } finally {
      setDeleting(false)
    }
  }

  /** Opens one expense row's edit dialog for clicks and keyboard activation. */
  function editExpense(expense: ExpenseDto): void {
    closeSwipe()
    setEditingSettlement(undefined)
    setEditingExpense(expense)
    setExpenseDialog(true)
  }

  /** Opens one settlement row's edit dialog. */
  function editSettlement(settlement: SettlementDto): void {
    setEditingExpense(undefined)
    setEditingSettlement(settlement)
    setSettlementDialog(true)
  }

  const memberNames = useMemo(
    () =>
      compactNames(
        group.memberships.map((membership) => membership.user),
        { currentUserId: session?.id },
      ),
    [group.memberships, session?.id],
  )
  const member = (id: string) => memberNames[id] ?? 'Member'

  return (
    <section className="grid gap-6">
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
      <section>
        {initialListLoadComplete &&
          (listState === 'empty' ? (
            <p className="empty-state list-enter">No expenses yet.</p>
          ) : (
            <ul
              className={`divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-raised ${expenseListEntryClass(initialListLoadComplete)}`}
            >
              {visibleExpenses.map((expense) =>
                canManageMoney ? (
                  <li
                    className={`swipe-reveal-track ${enteringExpenseIds.has(expense.id) ? 'list-enter' : ''}`.trim()}
                    data-revealed={revealedId === expense.id}
                    key={expense.id}
                  >
                    <button
                      className="swipe-reveal-action grid place-items-center bg-red-600 text-white md:hidden"
                      type="button"
                      aria-label={`Delete ${expense.title}`}
                      onClick={() => requestExpenseDeletion(expense)}
                    >
                      <Trash2 aria-hidden size={20} />
                    </button>
                    {/* Swipe shell only; the edit button owns focus and the full-row hit area. */}
                    <div
                      className="swipe-reveal-content relative bg-surface-raised"
                      style={
                        dragOffset(expense.id)
                          ? {
                              transform: `translateX(${dragOffset(expense.id)}px)`,
                              transition: 'none',
                            }
                          : undefined
                      }
                      onPointerDown={onPointerDown(expense.id)}
                      onPointerMove={onPointerMove(expense.id)}
                      onPointerUp={onPointerUp(expense.id)}
                      onPointerCancel={onPointerCancel}
                    >
                      <button
                        className={`${pressableMoneyRowClass} md:pr-12`}
                        type="button"
                        aria-label={`Edit ${expense.title}`}
                        onClick={(event) => {
                          if (consumeActivation()) return
                          editExpense(expense)
                          blurAfterPress(event)
                        }}
                        onTouchMove={blurOnTouchScroll}
                      >
                        <ExpenseMark
                          icon={expense.icon}
                          syncStatus={expenseSync.get(expense.id)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {expense.title}
                          </span>
                          <span className="block truncate text-sm text-muted">
                            {expense.date} · {member(expense.payer)}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatMoney(expense.amount_cents, group.currency)}
                        </span>
                      </button>
                      <button
                        className="absolute top-1/2 right-4 hidden -translate-y-1/2 text-red-600 md:block"
                        aria-label={`Delete ${expense.title}`}
                        type="button"
                        onClick={() => requestExpenseDeletion(expense)}
                      >
                        <Trash2 aria-hidden size={17} />
                      </button>
                    </div>
                  </li>
                ) : (
                  <li
                    className={`${moneyListRowClass} ${enteringExpenseIds.has(expense.id) ? 'list-enter' : ''}`.trim()}
                    key={expense.id}
                  >
                    <ExpenseMark
                      icon={expense.icon}
                      syncStatus={expenseSync.get(expense.id)}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{expense.title}</p>
                      <p className="truncate text-sm text-muted">
                        {expense.date} · {member(expense.payer)}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(expense.amount_cents, group.currency)}
                    </span>
                  </li>
                ),
              )}
            </ul>
          ))}
        {initialListLoadComplete &&
          listState === 'items' &&
          visibleExpenses.length < sortedExpenses.length && (
            <div ref={loadMoreRef} aria-hidden className="h-px" />
          )}
      </section>
      <section>
        {initialListLoadComplete && (
          <div className="list-enter">
            <h3 className="mb-3 text-lg font-bold">Settlements</h3>
            {settlements.length === 0 ? (
              <p className="empty-state">No settlements yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface-raised">
                {settlements.map((settlement) =>
                  canManageMoney ? (
                    <li key={settlement.id}>
                      <button
                        className={pressableMoneyRowClass}
                        type="button"
                        aria-label={`Edit payment from ${member(settlement.from_user)} to ${member(settlement.to_user)}`}
                        onClick={(event) => {
                          editSettlement(settlement)
                          blurAfterPress(event)
                        }}
                        onTouchMove={blurOnTouchScroll}
                      >
                        <MoneyRowMark
                          syncStatus={settlementSync.get(settlement.id)}
                        >
                          <HandCoins aria-hidden size={18} />
                        </MoneyRowMark>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {member(settlement.from_user)} paid{' '}
                            {member(settlement.to_user)}
                          </span>
                          <span className="block text-sm text-muted">
                            Settlement
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatMoney(
                            settlement.amount_cents,
                            group.currency,
                          )}
                        </span>
                      </button>
                    </li>
                  ) : (
                    <li
                      className={moneyListRowClass}
                      key={settlement.id}
                    >
                      <MoneyRowMark
                        syncStatus={settlementSync.get(settlement.id)}
                      >
                        <HandCoins aria-hidden size={18} />
                      </MoneyRowMark>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {member(settlement.from_user)} paid{' '}
                          {member(settlement.to_user)}
                        </p>
                        <p className="text-sm text-muted">Settlement</p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatMoney(settlement.amount_cents, group.currency)}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        )}
      </section>
      <ExpenseDialog
        open={expenseDialog}
        groupId={group.id}
        currency={group.currency}
        members={group.memberships}
        expense={editingExpense}
        onClose={() => setExpenseDialog(false)}
        onSaved={load}
        onRequestDelete={requestExpenseDeletion}
        nestedConfirmationOpen={Boolean(pendingDeletion)}
      />
      <SettlementDialog
        open={settlementDialog}
        groupId={group.id}
        currency={group.currency}
        members={group.memberships}
        settlement={editingSettlement}
        onClose={() => setSettlementDialog(false)}
        onSaved={load}
      />
      <ConfirmDialog
        open={Boolean(pendingDeletion)}
        title="Delete expense"
        question={
          pendingDeletion ? expenseDeleteQuestion(pendingDeletion.title) : ''
        }
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setPendingDeletion(undefined)}
        onConfirm={() => void confirmExpenseDeletion()}
      />
    </section>
  )
}

/** Renders an expense category marker from the persisted icon value. */
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
