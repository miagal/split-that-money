// oxlint-disable react/set-state-in-effect, react/only-export-components -- The controlled draft resets per open cycle; its legacy removal helper remains colocated for existing callers.
// Collects, validates, and locally queues one expense with an anchored icon picker.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  BedDouble,
  Calculator,
  CarFront,
  ChartPie,
  Check,
  CircleHelp,
  Coffee,
  Equal,
  PartyPopper,
  Percent,
  ShoppingBasket,
  Ticket,
  Trash2,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react'
import type {
  ExpenseDto,
  ExpenseIcon,
  MembershipDto,
} from '../../api/contracts.ts'
import { useAuth, useSyncActions } from '../../app/providers.tsx'
import { Dialog } from '../../components/Dialog.tsx'
import { IconPickerPopover } from '../../components/IconPickerPopover.tsx'
import { IconButton } from '../../components/IconButton.tsx'
import { normalizeAmountInput, parseMoneyToCents } from '../../lib/money.ts'
import { inlineFields, toastMessage } from '../feedback/api-feedback.ts'
import { useToast } from '../feedback/ToastProvider.tsx'
import { openMoneyStore } from '../sync/database.ts'
import {
  deleteExpense,
  queueExpense,
  toExpenseUpsert,
  type ExpenseForm,
} from './expense-api.ts'
import {
  expenseDialogFooterMode,
  expenseSubmitState,
} from './expense-submit-rules.ts'
import { SplitEditor } from './SplitEditor.tsx'
import {
  parseSplitValue,
  splitValueForInput,
  validateSplit,
  type SplitMode,
} from './split.ts'

type Props = {
  open: boolean
  groupId: string
  currency: string
  members: MembershipDto[]
  expense?: ExpenseDto
  onClose: () => void
  onSaved: () => void
  onRequestDelete?: (expense: ExpenseDto) => void
  nestedConfirmationOpen?: boolean
}

type ExpenseIconChoice = {
  value: Exclude<ExpenseIcon, null>
  label: string
  Icon: LucideIcon
}
type SplitModeChoice = { value: SplitMode; label: string; Icon: LucideIcon }

const expenseIcons: ExpenseIconChoice[] = [
  { value: 'utensils-crossed', label: 'Food', Icon: UtensilsCrossed },
  { value: 'coffee', label: 'Drinks', Icon: Coffee },
  { value: 'shopping-basket', label: 'Groceries', Icon: ShoppingBasket },
  { value: 'car-front', label: 'Transport', Icon: CarFront },
  { value: 'ticket', label: 'Tickets', Icon: Ticket },
  { value: 'bed-double', label: 'Stay', Icon: BedDouble },
  { value: 'party-popper', label: 'Activities', Icon: PartyPopper },
]

const splitModes: SplitModeChoice[] = [
  { value: 'equal', label: 'Equal split', Icon: Equal },
  { value: 'exact', label: 'Exact amounts', Icon: Calculator },
  { value: 'shares', label: 'Shares', Icon: ChartPie },
  { value: 'percent', label: 'Percent split', Icon: Percent },
]

const fieldClass =
  'box-border h-10 min-w-0 rounded-lg border border-border bg-surface px-3 text-base font-normal leading-none'

/**
 * Renders the add/edit expense flow with local-first persistence and an anchored icon picker.
 *
 * @param props - Controlled dialog state, group context, membership data, and refresh callbacks.
 * @returns The expense form and its anchored icon-selection popover.
 */
export function ExpenseDialog({
  open,
  groupId,
  currency,
  members,
  expense,
  onClose,
  onSaved,
  onRequestDelete,
  nestedConfirmationOpen = false,
}: Props) {
  const { session, cacheEpoch, isCacheEpochCurrent } = useAuth()
  const { enqueue } = useSyncActions()
  const toast = useToast()
  const active = useMemo(
    () => members.filter((member) => member.is_active),
    [members],
  )
  const activeIds = useMemo(
    () => active.map((member) => member.user.id),
    [active],
  )
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [payer, setPayer] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [mode, setMode] = useState<SplitMode>('equal')
  const [values, setValues] = useState<Record<string, string>>({})
  const [icon, setIcon] = useState<ExpenseIcon>(null)
  const [note, setNote] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const iconTriggerRef = useRef<HTMLButtonElement>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!open) return
    const selected = expense?.shares.map((share) => share.user) ?? activeIds
    setTitle(expense?.title ?? '')
    setAmount(expense ? (expense.amount_cents / 100).toFixed(2) : '')
    setDate(expense?.date ?? new Date().toISOString().slice(0, 10))
    setPayer(expense?.payer ?? session?.id ?? '')
    setParticipants(selected)
    const initialMode = expense?.split_type ?? 'equal'
    setMode(initialMode)
    setValues(
      Object.fromEntries(
        (expense?.shares ?? selected.map((user) => ({ user, value: 1 }))).map(
          (share) => [
            share.user,
            String(splitValueForInput(initialMode, share.value)),
          ],
        ),
      ),
    )
    setIcon(expense?.icon ?? null)
    setNote(expense?.note ?? '')
    setPickerOpen(false)
    setErrors({})
  }, [activeIds, expense, open, session?.id])

  const amountCents = parseMoneyToCents(amount) ?? -1
  const orderedValues = useMemo(
    () =>
      participants.map(
        (participant) =>
          parseSplitValue(mode, values[participant] ?? '') ?? Number.NaN,
      ),
    [mode, participants, values],
  )
  const split = useMemo(
    () =>
      validateSplit({ mode, amountCents, participants, values: orderedValues }),
    [amountCents, mode, orderedValues, participants],
  )
  const memberName = (id: string) =>
    members.find((member) => member.user.id === id)?.user.display_name ??
    'Member'

  /** Seeds exact cents from the current allocation before switching modes. */
  function changeMode(next: SplitMode): void {
    if (next === 'exact' && mode !== 'exact')
      setValues(
        Object.fromEntries(
          participants.map((participant) => [
            participant,
            String(
              splitValueForInput('exact', split.amounts[participant] ?? 0),
            ),
          ]),
        ),
      )
    setMode(next)
  }

  /** Adds or removes one active group member from the split. */
  function toggleParticipant(userId: string): void {
    setParticipants((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    )
    setErrors((current) => ({ ...current, participants: [], split: [] }))
  }

  /** Validates, writes, queues, and reports one expense mutation. */
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const submitState = expenseSubmitState({
      title,
      amount,
      date,
      participantCount: participants.length,
      splitError: split.error,
    })
    const validAmountCents = parseMoneyToCents(amount)
    if (!submitState.canSubmit || validAmountCents === null) {
      setErrors(submitState.errors)
      return
    }
    if (!session) {
      toast.error('Your session is no longer available. Please sign in again.')
      return
    }

    setSaving(true)
    setErrors({})
    try {
      const fields = {
        title,
        amountCents: validAmountCents,
        date,
        payer,
        splitType: mode,
        icon,
        note,
        shares: participants.map((user) => ({
          user,
          value:
            mode === 'equal'
              ? 1
              : (parseSplitValue(mode, values[user] ?? '') ?? 0),
        })),
      }
      const form: ExpenseForm = expense
        ? {
            ...fields,
            id: expense.id,
            createdBy: expense.created_by,
            createdAt: expense.created_at,
            createdOnDevice: expense.created_on_device,
          }
        : fields
      const payload = toExpenseUpsert(form, session, groupId)
      const writeEpoch = cacheEpoch
      if (!isCacheEpochCurrent(writeEpoch)) return
      const store = await openMoneyStore()
      try {
        if (!isCacheEpochCurrent(writeEpoch)) return
        await queueExpense(store, payload, groupId, enqueue, () =>
          isCacheEpochCurrent(writeEpoch),
        )
        if (!isCacheEpochCurrent(writeEpoch)) return
      } finally {
        store.close()
      }
      onSaved()
      onClose()
      if (navigator.onLine)
        toast.success(expense ? 'Expense updated.' : 'Expense saved.')
      else toast.info('Changes queued for sync.')
    } catch (reason) {
      const fields = inlineFields(reason)
      if (fields) setErrors(fields)
      else
        toast.error(
          toastMessage(reason) ?? 'Could not save changes. Please try again.',
        )
    } finally {
      setSaving(false)
    }
  }

  const footer =
    expenseDialogFooterMode(expense) === 'delete-cancel-save' ? (
      <>
        <IconButton
          aria-label="Delete expense"
          className="mr-auto"
          variant="danger"
          onClick={() => {
            if (expense) onRequestDelete?.(expense)
          }}
          disabled={saving}
        >
          <Trash2 aria-hidden size={20} />
        </IconButton>
        <IconButton
          aria-label="Cancel expense"
          variant="danger"
          onClick={onClose}
          disabled={saving}
        >
          <X aria-hidden size={20} />
        </IconButton>
        <IconButton
          aria-label="Save expense"
          form="expense-form"
          type="submit"
          disabled={saving}
        >
          <Check aria-hidden size={20} />
        </IconButton>
      </>
    ) : (
      <>
        <IconButton
          aria-label="Cancel expense"
          variant="danger"
          onClick={onClose}
          disabled={saving}
        >
          <X aria-hidden size={20} />
        </IconButton>
        <IconButton
          aria-label="Save expense"
          form="expense-form"
          type="submit"
          disabled={saving}
        >
          <Check aria-hidden size={20} />
        </IconButton>
      </>
    )

  return (
    <>
      <Dialog
        open={open}
        title={expense ? 'Edit expense' : 'Add expense'}
        onClose={() => {
          if (!saving) onClose()
        }}
        nestedConfirmationOpen={nestedConfirmationOpen}
        saving={saving}
        footer={footer}
        overlay={
          <IconPickerPopover
            open={pickerOpen}
            anchorRef={iconTriggerRef}
            onClose={() => setPickerOpen(false)}
            ariaLabel="Choose an expense icon"
          >
            <div className="grid grid-cols-4 gap-3">
              <IconButton
                aria-label="No icon"
                className={
                  icon === null
                    ? 'border-accent bg-accent/10 text-accent'
                    : undefined
                }
                onClick={() => {
                  setIcon(null)
                  setPickerOpen(false)
                }}
                disabled={saving}
              >
                <CircleHelp aria-hidden size={20} />
              </IconButton>
              {expenseIcons.map(({ value, label, Icon }) => (
                <IconButton
                  aria-label={label}
                  key={value}
                  className={
                    icon === value
                      ? 'border-accent bg-accent/10 text-accent'
                      : undefined
                  }
                  onClick={() => {
                    setIcon(value)
                    setPickerOpen(false)
                  }}
                  disabled={saving}
                >
                  <Icon aria-hidden size={20} />
                </IconButton>
              ))}
            </div>
          </IconPickerPopover>
        }
      >
        <form
          className="grid min-w-0 gap-5"
          id="expense-form"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <ExpenseTitleWithIcon
            icon={icon}
            title={title}
            error={errors.title}
            saving={saving}
            iconTriggerRef={iconTriggerRef}
            pickerOpen={pickerOpen}
            onChooseIcon={() => setPickerOpen(true)}
            onTitleChange={(value) => {
              setTitle(value)
              setErrors((current) => ({ ...current, title: [] }))
            }}
          />
          <AmountAndDate
            amount={amount}
            date={date}
            amountError={errors.amount}
            dateError={errors.date}
            saving={saving}
            onAmountChange={(value) => {
              setAmount(normalizeAmountInput(value))
              setErrors((current) => ({ ...current, amount: [], split: [] }))
            }}
            onDateChange={(value) => {
              setDate(value)
              setErrors((current) => ({ ...current, date: [] }))
            }}
          />
          <PayerSelect
            payer={payer}
            members={active}
            saving={saving}
            onChange={setPayer}
          />
          <ParticipantSelector
            members={active}
            selected={participants}
            errors={errors.participants}
            saving={saving}
            onToggle={toggleParticipant}
          />
          <SplitModeChooser mode={mode} saving={saving} onChange={changeMode} />
          <SplitEditor
            mode={mode}
            amountCents={amountCents}
            participants={participants}
            values={values}
            onValuesChange={(next) => {
              setValues(next)
              setErrors((current) => ({ ...current, split: [] }))
            }}
            names={memberName}
            currency={currency}
          />
          <OptionalNote note={note} saving={saving} onChange={setNote} />
        </form>
      </Dialog>
    </>
  )
}

/** Renders the icon trigger and primary expense title field. */
function ExpenseTitleWithIcon({
  icon,
  title,
  error,
  saving,
  iconTriggerRef,
  pickerOpen,
  onChooseIcon,
  onTitleChange,
}: {
  icon: ExpenseIcon
  title: string
  error?: string[]
  saving: boolean
  iconTriggerRef: React.RefObject<HTMLButtonElement | null>
  pickerOpen: boolean
  onChooseIcon: () => void
  onTitleChange: (value: string) => void
}) {
  const Icon =
    expenseIcons.find((choice) => choice.value === icon)?.Icon ?? CircleHelp
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-stretch gap-3">
        <IconButton
          ref={iconTriggerRef}
          aria-label="Choose expense icon"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={onChooseIcon}
          disabled={saving}
        >
          <Icon aria-hidden size={20} />
        </IconButton>
        <input
          className={`${fieldClass} w-full`}
          placeholder="e.g. Dinner"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          aria-invalid={Boolean(error?.length)}
          disabled={saving}
        />
      </div>
      {fieldMessages(error)}
    </div>
  )
}

/** Renders amount before date and uses two columns only at widths that fit both controls. */
function AmountAndDate({
  amount,
  date,
  amountError,
  dateError,
  saving,
  onAmountChange,
  onDateChange,
}: {
  amount: string
  date: string
  amountError?: string[]
  dateError?: string[]
  saving: boolean
  onAmountChange: (value: string) => void
  onDateChange: (value: string) => void
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-3">
      <label className="grid min-w-0 gap-1">
        <span className="text-sm font-semibold">Amount</span>
        <input
          className={`${fieldClass} w-full`}
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          inputMode="decimal"
          aria-invalid={Boolean(amountError?.length)}
          disabled={saving}
        />
        {fieldMessages(amountError)}
      </label>
      <label className="grid min-w-0 gap-1">
        <span className="text-sm font-semibold">Date</span>
        <input
          className={`${fieldClass} w-full`}
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          aria-invalid={Boolean(dateError?.length)}
          disabled={saving}
        />
        {fieldMessages(dateError)}
      </label>
    </div>
  )
}

/** Renders the active-member payer selector. */
function PayerSelect({
  payer,
  members,
  saving,
  onChange,
}: {
  payer: string
  members: MembershipDto[]
  saving: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-sm font-semibold">Paid by</span>
      <select
        className={`${fieldClass} w-full`}
        value={payer}
        onChange={(event) => onChange(event.target.value)}
        disabled={saving}
      >
        {members.map((member) => (
          <option key={member.user.id} value={member.user.id}>
            {member.user.display_name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Renders active members as compact split-participant toggles. */
function ParticipantSelector({
  members,
  selected,
  errors,
  saving,
  onToggle,
}: {
  members: MembershipDto[]
  selected: string[]
  errors?: string[]
  saving: boolean
  onToggle: (userId: string) => void
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold">Split between</span>
      <div className="flex flex-wrap gap-2">
        {members.map((member) => {
          const active = selected.includes(member.user.id)
          return (
            <button
              className={
                active
                  ? 'rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent'
                  : 'rounded-full border border-border px-3 py-1.5 text-sm text-muted'
              }
              type="button"
              aria-pressed={active}
              disabled={saving}
              onClick={() => onToggle(member.user.id)}
              key={member.user.id}
            >
              {member.user.display_name}
            </button>
          )
        })}
      </div>
      {fieldMessages(errors)}
    </div>
  )
}

/** Renders the split heading followed immediately by icon-only mode controls. */
function SplitModeChooser({
  mode,
  saving,
  onChange,
}: {
  mode: SplitMode
  saving: boolean
  onChange: (mode: SplitMode) => void
}) {
  const selected = splitModes.find((choice) => choice.value === mode)?.label
  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold">
        How to split{' '}
        <span className="font-normal text-muted">({selected})</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {splitModes.map(({ value, label, Icon }) => (
          <IconButton
            aria-label={label}
            aria-pressed={mode === value}
            title={label}
            className={
              mode === value
                ? '!border-accent !bg-accent/10 !text-accent'
                : undefined
            }
            disabled={saving}
            onClick={() => onChange(value)}
            key={value}
          >
            <Icon aria-hidden size={20} />
          </IconButton>
        ))}
      </div>
    </div>
  )
}

/** Renders the final optional note field. */
function OptionalNote({
  note,
  saving,
  onChange,
}: {
  note: string
  saving: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm font-semibold">
        Note <span className="font-normal text-muted">(optional)</span>
      </span>
      <textarea
        className="min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base font-normal"
        placeholder="Anything useful to remember"
        value={note}
        onChange={(event) => onChange(event.target.value)}
        disabled={saving}
      />
    </label>
  )
}

/** Renders one feature-local list of inline validation messages. */
function fieldMessages(messages: string[] | undefined) {
  return messages?.map((message, index) => (
    <span
      className="text-sm font-normal text-danger"
      role="alert"
      key={`${message}-${index}`}
    >
      {message}
    </span>
  ))
}

/** Queues an expense tombstone and refreshes the caller after its local write. */
export async function removeExpense(
  expense: ExpenseDto & { groupId: string },
  onDone: () => void,
  enqueue?: Parameters<typeof queueExpense>[3],
  isCurrent: Parameters<typeof queueExpense>[4] = () => true,
): Promise<void> {
  if (!isCurrent()) return
  const store = await openMoneyStore()
  try {
    if (!isCurrent()) return
    await deleteExpense(store, expense, enqueue, isCurrent)
  } finally {
    store.close()
  }
  if (!isCurrent()) return
  onDone()
}
