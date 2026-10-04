// Lists accounts for system administrators and owns their server-backed profile and status changes.
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import {
  ArrowLeft,
  House,
  Plus,
  RotateCcw,
  UserRoundX,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { UserDto } from '../../api/contracts.ts'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { toastMessage } from '../feedback/api-feedback.ts'
import { useToast } from '../feedback/ToastProvider.tsx'
import {
  isNestedInteractiveTarget,
  useSwipeReveal,
} from '../expenses/swipe-reveal.ts'
import { desktopSidebarClass } from '../groups/group-view-rules.ts'
import {
  createAdminUser,
  deactivateAdminUser,
  fetchAdminUsers,
  reactivateAdminUser,
  resetAdminUserPassword,
  updateAdminUser,
} from './admin-user-api.ts'
import { AdminUserDialog, type AdminUserFormDto } from './AdminUserDialog.tsx'

/** Renders the admin user list and coordinates the shared form and status confirmation. */
export function AdminUsersPage() {
  const [users, setUsers] = useState<UserDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserDto | null>(null)
  const [pendingDeactivation, setPendingDeactivation] =
    useState<UserDto | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
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

  /** Refreshes the visible directory after mount or a successful write. */
  const loadUsers = useCallback(async (): Promise<void> => {
    if (!serverAvailable()) {
      setLoading(false)
      return
    }
    try {
      setUsers(await fetchAdminUsers())
      setError(null)
    } catch (reason) {
      setError(
        toastMessage(reason) ?? 'Could not load users. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    async function loadInitialUsers(): Promise<void> {
      await loadUsers()
    }
    void loadInitialUsers()
  }, [loadUsers])

  /** Creates or edits a user, resetting the password only when an edit supplies one. */
  async function saveUser({
    password,
    ...profile
  }: AdminUserFormDto): Promise<void> {
    if (busy || !serverAvailable()) return
    setBusy(true)
    try {
      if (editingUser) {
        await updateAdminUser(editingUser.id, profile)
        if (password) await resetAdminUserPassword(editingUser.id, password)
      } else {
        await createAdminUser({ ...profile, password })
      }
      setDialogOpen(false)
      setEditingUser(null)
      toast.success(editingUser ? 'User updated.' : 'User created.')
      await loadUsers()
    } finally {
      setBusy(false)
    }
  }

  /** Applies an account status change and refreshes the list once the server accepts it. */
  async function changeStatus(user: UserDto, active: boolean): Promise<void> {
    if (busy || !serverAvailable()) return
    setBusy(true)
    try {
      if (active) await reactivateAdminUser(user.id)
      else await deactivateAdminUser(user.id)
      setPendingDeactivation(null)
      toast.success(active ? 'User reactivated.' : 'User deactivated.')
      await loadUsers()
    } catch (reason) {
      toast.error(
        toastMessage(reason) ?? 'Could not save changes. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  function openEditor(user: UserDto): void {
    closeSwipe()
    setEditingUser(user)
    setDialogOpen(true)
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    user: UserDto,
  ): void {
    if (
      isNestedInteractiveTarget(event) ||
      (event.key !== 'Enter' && event.key !== ' ')
    )
      return
    event.preventDefault()
    openEditor(user)
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-3 py-4 pb-24 sm:gap-6 sm:p-8 md:grid-cols-[15rem_1fr] md:pb-8">
      <aside className={desktopSidebarClass()}>
        <Link
          className="mb-5 inline-flex items-center gap-2 text-sm text-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
          to="/groups"
        >
          <ArrowLeft aria-hidden size={16} />
          All groups
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-accent/10 text-accent">
            <UsersRound aria-hidden size={20} />
          </span>
          <div>
            <h1 className="font-bold">User management</h1>
            <p className="text-xs text-muted">System administration</p>
          </div>
        </div>
      </aside>
      <section className="min-w-0">
        <PageHeader
          busy={busy}
          onAdd={() => {
            setEditingUser(null)
            setDialogOpen(true)
          }}
        />
        <div className="fixed bottom-4 left-4 z-20 md:hidden">
          <Link
            className="grid size-11 place-items-center rounded-full border border-border bg-surface-raised shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            to="/groups"
            aria-label="All groups"
          >
            <House aria-hidden size={19} />
          </Link>
        </div>
        <button
          className="fixed bottom-4 right-4 z-30 grid size-11 place-items-center rounded-full bg-accent text-accent-contrast md:hidden"
          type="button"
          aria-label="Add user"
          disabled={busy}
          onClick={() => {
            setEditingUser(null)
            setDialogOpen(true)
          }}
        >
          <Plus aria-hidden size={20} />
        </button>
        <div className="grid gap-6">
          {loading && (
            <p className="text-muted" role="status">
              Loading users…
            </p>
          )}
          {error && (
            <p className="text-danger" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-raised">
              {users.map((user) => (
                <li
                  className="swipe-reveal-track"
                  data-revealed={revealedId === user.id}
                  key={user.id}
                >
                  <button
                    className={`swipe-reveal-action grid place-items-center text-white md:hidden ${user.is_active ? 'bg-danger' : 'bg-accent'}`}
                    type="button"
                    aria-label={`${user.is_active ? 'Deactivate' : 'Reactivate'} ${user.display_name}`}
                    disabled={busy}
                    onClick={() => {
                      closeSwipe()
                      if (user.is_active) setPendingDeactivation(user)
                      else void changeStatus(user, true)
                    }}
                  >
                    {user.is_active ? (
                      <UserRoundX aria-hidden size={20} />
                    ) : (
                      <RotateCcw aria-hidden size={20} />
                    )}
                  </button>
                  <div
                    className="swipe-reveal-content grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-surface-raised p-4"
                    style={
                      dragOffset(user.id)
                        ? {
                            transform: `translateX(${dragOffset(user.id)}px)`,
                            transition: 'none',
                          }
                        : undefined
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit ${user.display_name}`}
                    onClick={(event) => {
                      if (
                        !isNestedInteractiveTarget(event) &&
                        !consumeActivation()
                      )
                        openEditor(user)
                    }}
                    onKeyDown={(event) => handleRowKeyDown(event, user)}
                    onPointerDown={onPointerDown(user.id)}
                    onPointerMove={onPointerMove(user.id)}
                    onPointerUp={onPointerUp(user.id)}
                    onPointerCancel={onPointerCancel}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold">
                          {user.display_name}
                        </p>
                        <span
                          className={
                            user.is_active
                              ? 'rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent'
                              : 'rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted'
                          }
                        >
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted">
                        {user.email}
                      </p>
                    </div>
                    {user.is_active ? (
                      <button
                        className="hidden rounded-lg p-2 text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger md:block"
                        type="button"
                        aria-label={`Deactivate ${user.display_name}`}
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation()
                          setPendingDeactivation(user)
                        }}
                      >
                        <UserRoundX aria-hidden size={18} />
                      </button>
                    ) : (
                      <button
                        className="hidden rounded-lg p-2 text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:block"
                        type="button"
                        aria-label={`Reactivate ${user.display_name}`}
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation()
                          void changeStatus(user, true)
                        }}
                      >
                        <RotateCcw aria-hidden size={18} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {users.length === 0 && (
                <li className="p-6 text-muted">No users found.</li>
              )}
            </ul>
          )}
        </div>
        <AdminUserDialog
          open={dialogOpen}
          user={editingUser}
          busy={busy}
          onClose={() => {
            if (!busy) setDialogOpen(false)
          }}
          onSave={saveUser}
        />
        <ConfirmDialog
          open={pendingDeactivation !== null}
          title="Deactivate user"
          question={`Deactivate ${pendingDeactivation?.display_name ?? 'this user'}?`}
          confirmLabel="Deactivate"
          busy={busy}
          onCancel={() => setPendingDeactivation(null)}
          onConfirm={() => {
            if (pendingDeactivation)
              void changeStatus(pendingDeactivation, false)
          }}
        />
      </section>
    </div>
  )
}

/** Renders the responsive administration header using the group-tab proportions. */
function PageHeader({ busy, onAdd }: { busy: boolean; onAdd(): void }) {
  return (
    <>
      <div className="sticky top-0 z-10 mb-5 flex items-start justify-between gap-4 bg-surface py-4 md:hidden">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-accent">
            System
          </p>
          <h1 className="truncate text-xl font-bold">User management</h1>
          <p className="text-xs text-muted">
            Manage account details and access.
          </p>
        </div>
      </div>
      <div className="sticky top-0 z-10 mb-3 hidden items-center justify-between bg-surface py-4 md:flex">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-accent">
            System
          </p>
          <h2 className="text-2xl font-bold">User management</h2>
          <p className="text-sm text-muted">
            Manage account details and access.
          </p>
        </div>
        <button
          className="grid size-10 place-items-center rounded-full bg-accent text-accent-contrast"
          type="button"
          aria-label="Add user"
          disabled={busy}
          onClick={onAdd}
        >
          <Plus aria-hidden size={20} />
        </button>
      </div>
    </>
  )
}

/** Keeps server-only management actions from running when the browser is offline. */
function serverAvailable(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}
