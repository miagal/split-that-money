// Records a member-to-member payment and queues it for synchronization.
import { useState, type FormEvent } from 'react'
import { Check, X } from 'lucide-react'
import type { MembershipDto } from '../../api/contracts.ts'
import { useAuth, useSyncActions } from '../../app/providers.tsx'
import { Dialog } from '../../components/Dialog.tsx'
import { IconButton } from '../../components/IconButton.tsx'
import {
  formatMoney,
  normalizeAmountInput,
  parseMoneyToCents,
} from '../../lib/money.ts'
import { useToast } from '../feedback/ToastProvider.tsx'
import { inlineFields, toastMessage } from '../feedback/api-feedback.ts'
import { openMoneyStore } from '../sync/database.ts'
import {
  queueSettlement,
  settlementDialogResetKey,
  settlementFormDefaults,
  toSettlementUpsert,
} from './balances.ts'

type Props = {
  open: boolean
  groupId: string
  currency: string
  members: MembershipDto[]
  initialFrom?: string
  initialTo?: string
  initialAmountCents?: number
  onClose: () => void
  onSaved: () => void
}

export function SettlementDialog({
  open,
  groupId,
  currency,
  members,
  initialFrom,
  initialTo,
  initialAmountCents,
  onClose,
  onSaved,
}: Props) {
  const { session, cacheEpoch, isCacheEpochCurrent } = useAuth()
  const { enqueue } = useSyncActions()
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const memberIds = members.map((member) => member.user.id)
  const resetKey = settlementDialogResetKey(
    open,
    memberIds,
    initialFrom,
    initialTo,
    session?.id,
  )
  const [activeResetKey, setActiveResetKey] = useState<string | null>(null)
  if (resetKey !== activeResetKey) {
    setActiveResetKey(resetKey)
    if (resetKey !== null) {
      const defaults = settlementFormDefaults(
        memberIds,
        initialFrom,
        initialTo,
        session?.id,
      )
      setFrom(defaults.from)
      setTo(defaults.to)
      setAmount(
        initialAmountCents === undefined
          ? ''
          : (initialAmountCents / 100).toFixed(2),
      )
      setErrors({})
    }
  }
  const cents = parseMoneyToCents(amount)
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!session || !from || !to || from === to || cents === null) {
      setErrors({
        from: from ? [] : ['Choose a sender.'],
        to: !to
          ? ['Choose a receiver.']
          : from === to
            ? ['Sender and receiver must be different.']
            : [],
        amount: cents === null ? ['Enter a positive amount.'] : [],
      })
      return
    }
    setSaving(true)
    try {
      const writeEpoch = cacheEpoch
      if (!isCacheEpochCurrent(writeEpoch)) return
      const store = await openMoneyStore()
      try {
        if (!isCacheEpochCurrent(writeEpoch)) return
        await queueSettlement(
          store,
          toSettlementUpsert(
            { fromUser: from, toUser: to, amountCents: cents },
            session,
            groupId,
          ),
          groupId,
          enqueue,
          () => isCacheEpochCurrent(writeEpoch),
        )
        if (!isCacheEpochCurrent(writeEpoch)) return
      } finally {
        store.close()
      }
      onSaved()
      onClose()
      if (navigator.onLine) toast.success('Payment recorded.')
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
  const memberName = (id: string) =>
    members.find((member) => member.user.id === id)?.user.display_name ??
    'Member'
  return (
    <Dialog
      open={open}
      title="Record payment"
      onClose={() => {
        if (!saving) onClose()
      }}
      nestedConfirmationOpen={false}
      saving={saving}
      footer={
        <>
          <IconButton
            aria-label="Cancel payment"
            variant="danger"
            onClick={onClose}
            disabled={saving}
          >
            <X aria-hidden size={20} />
          </IconButton>
          <IconButton
            aria-label="Save payment"
            form="record-payment-form"
            type="submit"
            disabled={saving}
          >
            <Check aria-hidden size={20} />
          </IconButton>
        </>
      }
    >
      <form
        className="grid gap-4"
        id="record-payment-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="grid gap-1 text-sm font-semibold">
          Paid by
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2 font-normal"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.id} value={member.user.id}>
                {memberName(member.user.id)}
                {member.is_active ? '' : ' (left)'}
              </option>
            ))}
          </select>
        </label>
        {errors.from?.map((message) => (
          <span className="text-sm text-danger" role="alert" key={message}>
            {message}
          </span>
        ))}
        <label className="grid gap-1 text-sm font-semibold">
          Paid to
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2 font-normal"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.id} value={member.user.id}>
                {memberName(member.user.id)}
                {member.is_active ? '' : ' (left)'}
              </option>
            ))}
          </select>
        </label>
        {errors.to?.map((message) => (
          <span className="text-sm text-danger" role="alert" key={message}>
            {message}
          </span>
        ))}
        <label className="grid gap-1 text-sm font-semibold">
          Amount ({currency})
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2 font-normal"
            inputMode="decimal"
            value={amount}
            onChange={(event) =>
              setAmount(normalizeAmountInput(event.target.value))
            }
          />
          {initialAmountCents !== undefined && (
            <span className="text-sm font-normal text-muted">
              Suggested: {formatMoney(initialAmountCents, currency)}
            </span>
          )}
        </label>
        {errors.amount?.map((message) => (
          <span className="text-sm text-danger" role="alert" key={message}>
            {message}
          </span>
        ))}
      </form>
    </Dialog>
  )
}
