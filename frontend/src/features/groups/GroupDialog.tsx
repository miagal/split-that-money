// oxlint-disable react/set-state-in-effect -- A controlled dialog must reset its fields when each open cycle begins.
// Collects required immutable group fields and validates icon selection before server-only creation.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, X } from 'lucide-react'
import type { GroupCreateDto } from '../../api/contracts.ts'
import { Dialog } from '../../components/Dialog.tsx'
import { IconButton } from '../../components/IconButton.tsx'
import { IconPickerPopover } from '../../components/IconPickerPopover.tsx'
import {
  emojiInputValue,
  groupCreateInput,
  iconPickerSelection,
} from './group-dialog-rules.ts'
import { groupIconChoices } from './group-icon-choices.ts'
import { useToast } from '../feedback/ToastProvider.tsx'
import { inlineFields, toastMessage } from '../feedback/api-feedback.ts'

type GroupDialogProps = {
  open: boolean
  online: boolean
  onClose: () => void
  onCreate: (input: GroupCreateDto) => Promise<void>
}

const currencies = ['EUR', 'USD', 'GBP']
/**
 * Renders the online-only form for creating one immutable-currency group.
 *
 * @param props - Controlled visibility, connectivity, close action, and create mutation.
 * @returns A group creation dialog with an anchored required-icon picker.
 */
export function GroupDialog({
  open,
  online,
  onClose,
  onCreate,
}: GroupDialogProps) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(currencies[0])
  const [icon, setIcon] = useState(`lucide:${groupIconChoices[0].value}`)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [emoji, setEmoji] = useState('')
  const iconTriggerRef = useRef<HTMLButtonElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setIcon(
      `lucide:${groupIconChoices[Math.floor(Math.random() * groupIconChoices.length)].value}`,
    )
    setName('')
    setCurrency(currencies[0])
    setError(null)
    setFieldErrors({})
  }, [open])

  /** Submits one server-backed group creation request after local required-field checks. */
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!online) return
    const input = groupCreateInput({ name, currency, icon })
    if (!input)
      return setError(
        'Enter a name, choose a currency, and select one allowed icon.',
      )

    setSaving(true)
    setError(null)
    setFieldErrors({})
    try {
      await onCreate(input)
      closeDialog()
    } catch (reason) {
      const fields = inlineFields(reason)
      if (fields) setFieldErrors(fields)
      else {
        const message = toastMessage(reason)
        if (message) toast.error(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const selectedChoice = groupIconChoices.find(
    (choice) => `lucide:${choice.value}` === icon,
  )
  const SelectedIcon = selectedChoice?.Icon

  /** Opens the picker while restoring its emoji field from the saved icon. */
  function openPicker(): void {
    setEmoji(icon.startsWith('emoji:') ? icon.slice('emoji:'.length) : '')
    setPickerOpen(true)
  }

  /** Immediately commits one valid picker value and closes the picker. */
  function selectIcon(selected: string | null): void {
    const next = iconPickerSelection({ current: icon, selected })
    setIcon(next.value)
    setPickerOpen(next.open)
  }

  /** Cancels the parent dialog only while no create request is in progress. */
  function cancelGroup(): void {
    if (!saving) closeDialog()
  }

  /** Closes the picker before its parent dialog can unmount. */
  function closeDialog(): void {
    setPickerOpen(false)
    onClose()
  }

  return (
    <>
      <Dialog
        open={open}
        title="New group"
        onClose={cancelGroup}
        nestedConfirmationOpen={false}
        saving={saving}
        footer={
          <>
            <IconButton
              aria-label="Cancel new group"
              variant="danger"
              disabled={saving}
              onClick={cancelGroup}
            >
              <X aria-hidden size={20} />
            </IconButton>
            <IconButton
              aria-label={saving ? 'Creating group' : 'Create group'}
              form="new-group-form"
              type="submit"
              disabled={!online || saving}
            >
              <Check aria-hidden size={20} />
            </IconButton>
          </>
        }
        overlay={
          <IconPickerPopover
            open={pickerOpen}
            anchorRef={iconTriggerRef}
            onClose={() => selectIcon(null)}
            ariaLabel="Choose a group icon"
          >
            <div className="grid gap-5">
              <div className="grid grid-cols-4 gap-3">
                {groupIconChoices.map(({ value, label, Icon }) => (
                  <IconButton
                    key={value}
                    aria-label={label}
                    className={
                      icon === `lucide:${value}`
                        ? 'border-accent bg-accent/10 text-accent'
                        : undefined
                    }
                    onClick={() => selectIcon(`lucide:${value}`)}
                    disabled={saving}
                  >
                    <Icon aria-hidden size={20} />
                  </IconButton>
                ))}
              </div>
              <label className="grid gap-2 text-sm font-semibold">
                Or one emoji
                <input
                  className="rounded-lg border border-border bg-surface px-3 py-2 font-normal"
                  value={emoji}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.currentTarget.focus({ preventScroll: true })
                  }}
                  onChange={(event) => {
                    const value = emojiInputValue(event.target.value)
                    setEmoji(value)
                    if (value) selectIcon(`emoji:${value}`)
                  }}
                  aria-describedby="emoji-help"
                  disabled={saving}
                />
                <span className="font-normal text-muted" id="emoji-help">
                  Use exactly one emoji.
                </span>
              </label>
            </div>
          </IconPickerPopover>
        }
      >
        <form className="grid gap-5" id="new-group-form" onSubmit={submit}>
          <label className="grid gap-2 font-semibold">
            Name
            <div className="flex items-center gap-3">
              <IconButton
                ref={iconTriggerRef}
                aria-label="Choose group icon"
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                onClick={openPicker}
                disabled={saving}
              >
                {SelectedIcon ? (
                  <SelectedIcon aria-hidden size={20} />
                ) : (
                  <span aria-hidden>{icon.slice('emoji:'.length)}</span>
                )}
              </IconButton>
              <input
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-normal"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setFieldErrors({})
                }}
                autoComplete="off"
                required
                disabled={saving}
              />
            </div>
            {fieldMessages(fieldErrors.name)}
          </label>
          <label className="grid gap-2 font-semibold">
            Currency
            <select
              className="rounded-lg border border-border bg-surface px-3 py-2 font-normal"
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value)
                setFieldErrors({})
              }}
              disabled={saving}
            >
              {currencies.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <span className="text-sm font-normal text-muted">
              Currency cannot be changed later.
            </span>
            {fieldMessages(fieldErrors.currency)}
          </label>
          {fieldMessages(fieldErrors.icon)}
          {!online && (
            <p
              className="rounded-lg bg-danger/10 p-3 text-sm text-danger"
              role="status"
            >
              Connect to the internet to create a group.
            </p>
          )}
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </form>
      </Dialog>
    </>
  )
}

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
