// Renders the standalone public authentication screen, optional self-registration, and the offline cached-identity card.
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { isTransportFailure } from '../../api/client.ts'
import type { UserDto } from '../../api/contracts.ts'
import { blocksAccountSwitch } from '../../app/auth-boot-rules.ts'
import { useAuth } from '../../app/providers.tsx'
import { nextPathForSession } from '../../app/router-rules.ts'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import {
  AUTH_CONNECTION_MESSAGE,
  authToastMessage,
  inlineFields,
  toastMessage,
} from '../feedback/api-feedback.ts'
import { useToast } from '../feedback/ToastProvider.tsx'
import { openMoneyStore } from '../sync/database.ts'
import { getPublicConfig, register } from './auth-api.ts'

type LoginFields = { email: string; password: string }
type RegisterFields = LoginFields & { firstName: string; lastName: string }
type FieldErrors = Record<string, string[]>

const emptyLogin: LoginFields = { email: '', password: '' }
const emptyRegistration: RegisterFields = {
  ...emptyLogin,
  firstName: '',
  lastName: '',
}

/** Renders server login and a saved account that can continue without server access. */
export function LoginPage() {
  const navigate = useNavigate()
  const {
    login,
    continueCachedSession,
    signOutOnDevice,
    pendingChanges,
    cacheEpoch,
    cachedSessionAllowed,
    sessionExpired,
  } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)
  const [loginFields, setLoginFields] = useState(emptyLogin)
  const [registrationFields, setRegistrationFields] =
    useState(emptyRegistration)
  const [registrationAllowed, setRegistrationAllowed] = useState(false)
  const [showRegistration, setShowRegistration] = useState(false)
  const [loginErrors, setLoginErrors] = useState<FieldErrors>({})
  const [registrationErrors, setRegistrationErrors] = useState<FieldErrors>({})
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  )
  const [cachedUser, setCachedUser] = useState<UserDto | null>(null)
  const [pending, setPending] = useState(0)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const resumeUser =
    cachedSessionAllowed && !sessionExpired ? cachedUser : null

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  // Soft leave disables the money-store epoch and leaves IndexedDB. The read has to be allowed during that transition or getCachedSession stays null.
  useEffect(() => {
    if (!cachedSessionAllowed) return
    let active = true
    void openMoneyStore({ allowDuringTransition: true })
      .then(async (store) => {
        try {
          const cached = await store.getCachedSession()
          if (active) {
            setCachedUser(cached)
            setLoginFields((fields) =>
              fields.email ? fields : { ...fields, email: cached?.email ?? '' },
            )
          }
        } finally {
          store.close()
        }
      })
      .catch(() => undefined)
    void pendingChanges()
      .then((count) => {
        if (active) setPending(count)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [cacheEpoch, cachedSessionAllowed, pendingChanges])

  useEffect(() => {
    void getPublicConfig()
      .then((config) => setRegistrationAllowed(config.ALLOW_SELF_REGISTRATION))
      .catch((reason: unknown) => {
        if (isTransportFailure(reason)) return
        const message = authToastMessage(reason)
        if (message) toastRef.current.error(message)
      })
  }, [])

  async function submitLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!navigator.onLine) {
      toast.error(AUTH_CONNECTION_MESSAGE)
      return
    }
    if (blocksAccountSwitch(cachedUser?.email, pending, loginFields.email)) {
      toast.error(
        `Unsynced changes from ${cachedUser!.email} are still on this device. Sign in as that account, or sign out on this device first.`,
      )
      return
    }
    setLoginErrors({})
    try {
      await login(loginFields)
      navigate('/groups')
    } catch (reason) {
      const fields = inlineFields(reason)
      if (fields) setLoginErrors(fields)
      else {
        const message = authToastMessage(reason)
        if (message) toast.error(message)
      }
    }
  }

  /**
   * Reopens the cached user for this document and leaves the login route.
   *
   * @returns Nothing.
   */
  async function continueOffline(): Promise<void> {
    try {
      const user = await continueCachedSession()
      navigate(nextPathForSession(user, '/login'))
    } catch {
      toast.error('Could not open the saved account.')
    }
  }

  /**
   * Wipes this device's account data and returns to the password form.
   *
   * @returns Nothing.
   */
  async function signOutHere(): Promise<void> {
    setSigningOut(true)
    try {
      await signOutOnDevice()
      setCachedUser(null)
      setPending(0)
    } catch {
      toast.error('Could not clear all account data on this device.')
    } finally {
      setSigningOut(false)
      setConfirmSignOut(false)
    }
  }

  async function submitRegistration(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    setRegistrationErrors({})
    try {
      await register({
        email: registrationFields.email,
        password: registrationFields.password,
        first_name: registrationFields.firstName,
        last_name: registrationFields.lastName,
      })
      toast.success('Account created. Sign in with your new credentials.')
      setShowRegistration(false)
    } catch (reason) {
      const fields = inlineFields(reason)
      if (fields) setRegistrationErrors(fields)
      else {
        const message = toastMessage(reason)
        if (message) toast.error(message)
      }
    }
  }

  function clearRegistrationErrors(): void {
    setRegistrationErrors({})
  }

  return (
    <main className="mx-auto flex min-h-svh items-center justify-center px-8 py-6 sm:p-6">
      <div className="relative w-full max-w-md">
        <div className="absolute right-full top-0 mr-1 flex flex-col items-center gap-0.5">
          <img
            src="/icon.svg"
            alt=""
            width={28}
            height={28}
            className="size-7 -rotate-90 rounded-lg"
          />
          <p className="whitespace-nowrap text-sm font-bold text-accent [writing-mode:sideways-lr]">
            split that money
          </p>
        </div>
        <section className="w-full rounded-2xl border border-border bg-surface-raised p-5 shadow-sm sm:p-7">
        {resumeUser ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome back
            </h1>
            <p className="mt-2 text-muted">
              {online
                ? 'Saved account'
                : "You're offline. Your groups stay on this device."}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface font-semibold leading-none text-accent"
                aria-hidden="true"
              >
                {`${resumeUser.first_name[0] ?? ''}${resumeUser.last_name[0] ?? ''}`.toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{resumeUser.display_name}</p>
                <p className="truncate text-sm text-muted">
                  {resumeUser.email}
                </p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 font-semibold text-danger"
                type="button"
                onClick={() => setConfirmSignOut(true)}
              >
                <LogOut aria-hidden size={16} />
                Sign out
              </button>
              <button
                className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast"
                type="button"
                onClick={continueOffline}
              >
                <LogIn aria-hidden size={16} strokeWidth={2.5} />
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">
              {showRegistration ? 'Create an account' : 'Welcome back'}
            </h1>
            <p className="mt-2 text-muted">
              {showRegistration
                ? 'Create an account for your shared groups.'
                : 'Sign in to keep every group and balance in sync.'}
            </p>
            {showRegistration ? (
              <form className="mt-6 grid gap-4" onSubmit={submitRegistration}>
                <label className="grid gap-1 text-sm font-semibold">
                  First name
                  <input
                    className="rounded-lg border border-border bg-surface p-2"
                    required
                    value={registrationFields.firstName}
                    onChange={(event) => {
                      clearRegistrationErrors()
                      setRegistrationFields({
                        ...registrationFields,
                        firstName: event.target.value,
                      })
                    }}
                  />
                  {fieldMessages(registrationErrors.first_name)}
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Last name
                  <input
                    className="rounded-lg border border-border bg-surface p-2"
                    required
                    value={registrationFields.lastName}
                    onChange={(event) => {
                      clearRegistrationErrors()
                      setRegistrationFields({
                        ...registrationFields,
                        lastName: event.target.value,
                      })
                    }}
                  />
                  {fieldMessages(registrationErrors.last_name)}
                </label>
                <AuthCredentials
                  fields={registrationFields}
                  errors={registrationErrors}
                  onChange={(fields) => {
                    clearRegistrationErrors()
                    setRegistrationFields({ ...registrationFields, ...fields })
                  }}
                />
                <button
                  className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast"
                  type="submit"
                >
                  Create account
                </button>
              </form>
            ) : (
              <form className="mt-6 grid gap-4" onSubmit={submitLogin}>
                <AuthCredentials
                  fields={loginFields}
                  errors={loginErrors}
                  onChange={(fields) => {
                    setLoginErrors({})
                    setLoginFields(fields)
                  }}
                />
                <button
                  className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast"
                  type="submit"
                >
                  <LogIn aria-hidden size={16} strokeWidth={2.5} />
                  Sign in
                </button>
              </form>
            )}
            {registrationAllowed && (
              <button
                className="mt-4 text-sm font-semibold text-accent"
                type="button"
                onClick={() => setShowRegistration((visible) => !visible)}
              >
                {showRegistration ? 'Back to sign in' : 'Create an account'}
              </button>
            )}
          </>
        )}
        </section>
      </div>
      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out on this device?"
        question={
          pending > 0
            ? `${pending} unsynced ${pending === 1 ? 'change' : 'changes'} will be deleted. This cannot be undone.`
            : 'All account data on this device will be deleted.'
        }
        confirmLabel="Sign out"
        busy={signingOut}
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => void signOutHere()}
      />
    </main>
  )
}

type AuthCredentialsProps = {
  fields: LoginFields
  errors: FieldErrors
  onChange: (fields: LoginFields) => void
}

function AuthCredentials({ fields, errors, onChange }: AuthCredentialsProps) {
  return (
    <>
      <label className="grid gap-1 text-sm font-semibold">
        Email address
        <input
          className="rounded-lg border border-border bg-surface p-2"
          type="email"
          autoComplete="email"
          required
          value={fields.email}
          onChange={(event) =>
            onChange({ ...fields, email: event.target.value })
          }
        />
        {fieldMessages(errors.email)}
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Password
        <input
          className="rounded-lg border border-border bg-surface p-2"
          type="password"
          autoComplete="current-password"
          required
          value={fields.password}
          onChange={(event) =>
            onChange({ ...fields, password: event.target.value })
          }
        />
        {fieldMessages(errors.password)}
      </label>
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
