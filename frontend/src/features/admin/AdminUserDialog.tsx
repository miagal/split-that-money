// oxlint-disable react/set-state-in-effect -- The controlled form resets its draft for each open cycle.
// Collects ordinary user profile fields and an optional edit-only password reset.
import { useEffect, useState, type FormEvent } from 'react'
import type { AdminUserUpdateDto, UserDto } from '../../api/contracts.ts'
import { Button } from '../../components/Button.tsx'
import { Dialog } from '../../components/Dialog.tsx'
import { inlineFields, toastMessage } from '../feedback/api-feedback.ts'
import { useToast } from '../feedback/ToastProvider.tsx'

export type AdminUserFormDto = AdminUserUpdateDto & { password: string }

export type AdminUserDialogProps = {
  open: boolean
  user: UserDto | null
  busy: boolean
  onClose(): void
  onSave(input: AdminUserFormDto): Promise<void>
}

/** Renders the shared create/edit form and keeps server validation beside each field. */
export function AdminUserDialog({
  open,
  user,
  busy,
  onClose,
  onSave,
}: AdminUserDialogProps) {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setEmail(user?.email ?? '')
    setFirstName(user?.first_name ?? '')
    setLastName(user?.last_name ?? '')
    setPassword('')
    setFieldErrors({})
  }, [open, user])

  /** Sends one explicit form save and lets the parent sequence the necessary requests. */
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (busy || (!user && !password.trim())) return
    setFieldErrors({})
    try {
      await onSave({
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        password,
      })
    } catch (reason) {
      const fields = inlineFields(reason)
      if (fields) setFieldErrors(fields)
      else {
        const message = toastMessage(reason)
        if (message) toast.error(message)
      }
    }
  }

  return (
    <Dialog
      open={open}
      title={user ? 'Edit user' : 'Add user'}
      onClose={() => {
        if (!busy) onClose()
      }}
      nestedConfirmationOpen={false}
      saving={busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button form="admin-user-form" type="submit" disabled={busy}>
            Save
          </Button>
        </>
      }
    >
      <form className="grid gap-4" id="admin-user-form" onSubmit={submit}>
        <label className="grid gap-2 font-semibold">
          First name
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2 font-normal"
            type="text"
            value={firstName}
            onChange={(event) => {
              setFirstName(event.target.value)
              setFieldErrors({})
            }}
            autoComplete="given-name"
            required
            disabled={busy}
          />
          {fieldMessages(fieldErrors.first_name)}
        </label>
        <label className="grid gap-2 font-semibold">
          Last name
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2 font-normal"
            type="text"
            value={lastName}
            onChange={(event) => {
              setLastName(event.target.value)
              setFieldErrors({})
            }}
            autoComplete="family-name"
            required
            disabled={busy}
          />
          {fieldMessages(fieldErrors.last_name)}
        </label>
        <label className="grid gap-2 font-semibold">
          Email address
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2 font-normal"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setFieldErrors({})
            }}
            autoComplete="email"
            required
            disabled={busy}
          />
          {fieldMessages(fieldErrors.email)}
        </label>
        <label className="grid gap-2 font-semibold">
          {user ? 'New password' : 'Password'}
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2 font-normal placeholder:text-muted"
            type="password"
            value={password}
            placeholder="••••••••"
            onChange={(event) => {
              setPassword(event.target.value)
              setFieldErrors({})
            }}
            autoComplete="new-password"
            required={!user}
            disabled={busy}
          />
          {fieldMessages(fieldErrors.password)}
        </label>
      </form>
    </Dialog>
  )
}

/** Renders each API validation message next to its corresponding input. */
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
