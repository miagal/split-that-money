// Manages the group-wide member directory plus permission-aware lifecycle actions.
// oxlint-disable react/set-state-in-effect -- A new search query must update result state after its request resolves.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Archive,
  LogOut,
  Pencil,
  RotateCcw,
  Trash2,
  TriangleAlert,
  UserMinus,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type {
  GroupIcon,
  MemberSearchResultDto,
  MembershipDto,
  UserDto,
} from '../../api/contracts.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Button } from '../../components/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { IconButton } from '../../components/IconButton.tsx'
import { IconPickerPopover } from '../../components/IconPickerPopover.tsx'
import { useAuth } from '../../app/providers.tsx'
import { isGroupIcon } from '../../lib/icons.ts'
import { useToast } from '../feedback/ToastProvider.tsx'
import { memberAddFeedback, toastMessage } from '../feedback/api-feedback.ts'
import {
  addMember,
  archiveGroup,
  deleteGroup,
  leaveGroup,
  removeMember,
  searchMemberAccounts,
  unarchiveGroup,
  updateGroup,
} from './group-api.ts'
import { groupIconChoices } from './group-icon-choices.ts'
import { useGroup } from './group-context.ts'
import {
  MEMBER_SEARCH_LIMIT,
  memberMatchesQuery,
  memberSearchPlan,
} from './member-search-rules.ts'

type GroupNameDraft = { groupId: string; sourceName: string; value: string }
type GroupIconDraft = {
  groupId: string
  sourceIcon: GroupIcon
  value: GroupIcon
}
type PendingLifecycleAction = 'archive' | 'leave' | 'delete' | null

const offlineMessage = 'Group settings need an internet connection.'

/** Owns the group member directory and the lifecycle controls available to the current member. */
export function SettingsPage() {
  const { group, refresh } = useGroup()
  const { session } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)
  const navigate = useNavigate()
  const [nameDraft, setNameDraft] = useState<GroupNameDraft>({
    groupId: group.id,
    sourceName: group.name,
    value: group.name,
  })
  const sourceIcon = group.icon ?? 'lucide:house'
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MemberSearchResultDto[]>([])
  const [searching, setSearching] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState('')
  const [selected, setSelected] = useState<MemberSearchResultDto | null>(null)
  const [memberErrors, setMemberErrors] = useState<Record<string, string[]>>({})
  const [pendingRemoval, setPendingRemoval] = useState<MembershipDto | null>(
    null,
  )
  const [pendingLifecycleAction, setPendingLifecycleAction] =
    useState<PendingLifecycleAction>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [iconDraft, setIconDraft] = useState<GroupIconDraft>({
    groupId: group.id,
    sourceIcon,
    value: sourceIcon,
  })
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [emoji, setEmoji] = useState('')
  const iconTriggerRef = useRef<HTMLButtonElement>(null)
  const skipMemberSearchRef = useRef(false)
  const name =
    nameDraft.groupId === group.id && nameDraft.sourceName === group.name
      ? nameDraft.value
      : group.name
  const icon =
    iconDraft.groupId === group.id && iconDraft.sourceIcon === sourceIcon
      ? iconDraft.value
      : sourceIcon
  const membership = group.memberships.find(
    (item) => item.user.id === session?.id,
  )
  const canManage = Boolean(
    session?.is_staff ||
    session?.is_superuser ||
    (membership?.is_active && membership.role === 'admin'),
  )
  const archived = group.archived_at !== null
  const lifecycleConfirmation =
    pendingLifecycleAction === 'archive'
      ? {
          title: 'Archive group',
          question: 'Do you really want to archive this group?',
          confirmLabel: 'Archive',
        }
      : pendingLifecycleAction === 'leave'
        ? {
            title: 'Leave group',
            question: 'Do you really want to leave this group?',
            confirmLabel: 'Leave',
          }
        : pendingLifecycleAction === 'delete'
          ? {
              title: 'Delete group',
              question:
                'Do you really want to permanently delete this archived group?',
              confirmLabel: 'Delete',
            }
          : null
  const email = query.trim()
  const visibleAccounts = results.filter((account) =>
    memberMatchesQuery(account.email, email),
  )
  const searchCovered =
    searchedQuery.length >= 2 &&
    email.toLowerCase().startsWith(searchedQuery.toLowerCase()) &&
    results.length < MEMBER_SEARCH_LIMIT
  const searchGroupId = canManage && email.length >= 2 ? group.id : undefined
  const searchEmail = searchGroupId ? email : undefined
  const rows = [
    ...group.memberships.filter(
      (item) => item.is_active && item.user.id === session?.id,
    ),
    ...group.memberships.filter(
      (item) => item.is_active && item.user.id !== session?.id,
    ),
    ...group.memberships.filter((item) => !item.is_active),
  ]

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    setIconDraft({ groupId: group.id, sourceIcon, value: sourceIcon })
    setIconPickerOpen(false)
  }, [group.id, sourceIcon])

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    if (!online || !navigator.onLine || !searchGroupId || !searchEmail) {
      skipMemberSearchRef.current = false
      setResults([])
      setSearching(false)
      setSearchedQuery('')
      return
    }
    if (skipMemberSearchRef.current) {
      skipMemberSearchRef.current = false
      return
    }
    let current = true
    setSearching(true)
    void searchMemberAccounts(searchGroupId, searchEmail)
      .then((accounts) => {
        if (!current) return
        setResults(accounts)
        setSearchedQuery(searchEmail)
      })
      .catch((reason) => {
        if (!current) return
        setResults([])
        setSearchedQuery('')
        toastRef.current.error(
          toastMessage(reason) ?? 'Could not save changes. Please try again.',
        )
      })
      .finally(() => {
        if (current) setSearching(false)
      })
    return () => {
      current = false
    }
  }, [online, searchEmail, searchGroupId])

  /** Runs a lifecycle write with the established feedback and refresh behavior. */
  async function run(
    action: () => Promise<unknown>,
    message: string,
    after?: () => void,
  ): Promise<void> {
    if (!navigator.onLine) {
      toast.error(offlineMessage)
      return
    }
    setBusy(true)
    try {
      await action()
      toast.success(message)
      after?.()
      await refresh()
    } catch (reason) {
      toast.error(
        toastMessage(reason) ?? 'Could not save changes. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  /** Updates the member search field without refetching when the visible accounts stay the same. */
  function changeMemberQuery(value: string): void {
    setQuery(value)
    const next = value.trim()
    if (next === email) return
    setMemberErrors({})
    const plan = memberSearchPlan(searchedQuery, next, results)
    skipMemberSearchRef.current = plan.action !== 'fetch'
    if (plan.action === 'idle') {
      setResults([])
      setSearchedQuery('')
      setSelected(null)
      return
    }
    if (plan.action === 'reuse' || plan.action === 'filter') {
      if (selected && !memberMatchesQuery(selected.email, next))
        setSelected(null)
      return
    }
    setResults(plan.results)
    if (selected && !plan.results.some((account) => account.id === selected.id))
      setSelected(null)
  }

  /** Adds the separately selected account to this group, then refreshes the directory. */
  async function addSelected(): Promise<void> {
    if (!selected) return
    if (!navigator.onLine) {
      toast.error(offlineMessage)
      return
    }
    setBusy(true)
    setMemberErrors({})
    try {
      await addMember(group.id, { email: selected.email })
      toast.success('Person added.')
      setQuery('')
      setResults([])
      setSearchedQuery('')
      setSelected(null)
      await refresh()
    } catch (reason) {
      const feedback = memberAddFeedback(reason)
      if ('fields' in feedback) setMemberErrors(feedback.fields)
      else toast.error(feedback.message)
    } finally {
      setBusy(false)
    }
  }

  /** Removes the membership explicitly confirmed in the destructive confirmation dialog. */
  async function confirmRemoval(): Promise<void> {
    if (!pendingRemoval) return
    await run(
      () => removeMember(group.id, pendingRemoval.user.id),
      `${fullName(pendingRemoval.user)} removed.`,
      () => setPendingRemoval(null),
    )
  }

  /** Runs the selected group lifecycle action only after its confirmation is accepted. */
  async function confirmLifecycleAction(): Promise<void> {
    if (!pendingLifecycleAction) return
    const action = pendingLifecycleAction
    const write =
      action === 'archive'
        ? () => archiveGroup(group.id)
        : action === 'leave'
          ? () => leaveGroup(group.id)
          : () => deleteGroup(group.id)
    const message =
      action === 'archive'
        ? 'Group archived.'
        : action === 'leave'
          ? 'You left the group.'
          : 'Group deleted.'
    await run(write, message, () => {
      setPendingLifecycleAction(null)
      if (action !== 'archive') navigate('/groups')
    })
  }

  return (
    <section className="grid gap-5">
      {!online && (
        <p className="text-sm text-muted" role="status">
          {offlineMessage}
        </p>
      )}
      {!canManage && (
        <aside
          className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground"
          role="note"
        >
          <TriangleAlert
            aria-hidden
            size={18}
            className="mt-0.5 shrink-0 text-amber-600"
          />
          <p>Some settings are only available to group admins.</p>
        </aside>
      )}
      <section className="rounded-2xl border border-border bg-surface-raised p-4 md:p-5">
        <h2 className="text-lg font-bold">Group name</h2>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (
              name.trim() &&
              (name.trim() !== group.name || icon !== sourceIcon)
            )
              void run(
                () => updateGroup(group.id, { name: name.trim(), icon }),
                'Group updated.',
              )
          }}
        >
          <IconButton
            ref={iconTriggerRef}
            aria-label="Choose group icon"
            aria-haspopup="dialog"
            aria-expanded={iconPickerOpen}
            disabled={!online || busy || !canManage || archived}
            onClick={() => {
              setEmoji(
                icon.startsWith('emoji:') ? icon.slice('emoji:'.length) : '',
              )
              setIconPickerOpen(true)
            }}
          >
            {icon.startsWith('emoji:') ? (
              <span aria-hidden>{icon.slice('emoji:'.length)}</span>
            ) : (
              (() => {
                const Icon = groupIconChoices.find(
                  (choice) => `lucide:${choice.value}` === icon,
                )?.Icon
                return Icon ? <Icon aria-hidden size={20} /> : null
              })()
            )}
          </IconButton>
          <input
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3"
            value={name}
            onChange={(event) =>
              setNameDraft({
                groupId: group.id,
                sourceName: group.name,
                value: event.target.value,
              })
            }
            disabled={!online || !canManage || archived}
            aria-label="Group name"
          />
          <Button
            type="submit"
            aria-label="Save group"
            className="icon-label-button"
            disabled={
              !online ||
              busy ||
              !canManage ||
              archived ||
              !name.trim() ||
              (name.trim() === group.name && icon === sourceIcon)
            }
          >
            <Pencil aria-hidden size={16} />
            <span>Rename</span>
          </Button>
        </form>
        <IconPickerPopover
          open={iconPickerOpen}
          anchorRef={iconTriggerRef}
          onClose={() => setIconPickerOpen(false)}
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
                  onClick={() => {
                    setIconDraft({
                      groupId: group.id,
                      sourceIcon,
                      value: `lucide:${value}` as GroupIcon,
                    })
                    setIconPickerOpen(false)
                  }}
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
                onChange={(event) => {
                  const value = event.target.value
                  setEmoji(value)
                  const selected = `emoji:${value}`
                  if (isGroupIcon(selected)) {
                    setIconDraft({
                      groupId: group.id,
                      sourceIcon,
                      value: selected as GroupIcon,
                    })
                    setIconPickerOpen(false)
                  }
                }}
              />
              <span className="font-normal text-muted">
                Use exactly one emoji.
              </span>
            </label>
          </div>
        </IconPickerPopover>
      </section>
      <section className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
        <div className="p-4 md:p-5">
          <h2 className="text-lg font-bold">Members</h2>
          {canManage && (
            <div className="mt-4 grid gap-3">
              <label className="grid gap-2 font-semibold">
                Email address
                <input
                  className="h-10 rounded-lg border border-border bg-surface px-3 font-normal"
                  type="email"
                  value={query}
                  onChange={(event) => changeMemberQuery(event.target.value)}
                  disabled={!online || busy || archived}
                  autoComplete="email"
                />
                {memberErrors.email?.map((message) => (
                  <span
                    className="text-sm font-normal text-danger"
                    role="alert"
                    key={message}
                  >
                    {message}
                  </span>
                ))}
              </label>
              {email.length >= 2 &&
                !searching &&
                searchCovered &&
                visibleAccounts.length === 0 && (
                  <p className="text-sm text-muted">No active account found.</p>
                )}
              {visibleAccounts.length > 0 && (
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {visibleAccounts.map((account) => (
                    <li key={account.id}>
                      <button
                        className={[
                          'flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface',
                          selected?.id === account.id ? 'bg-accent/10' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        type="button"
                        onClick={() => {
                          setSelected(account)
                          setMemberErrors({})
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {fullName(account)}
                          </span>
                          <span className="block truncate text-sm text-muted">
                            {account.email}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <Button
                  disabled={!online || busy || archived}
                  onClick={() => void addSelected()}
                >
                  Add member
                </Button>
              )}
            </div>
          )}
        </div>
        <ul className="list-enter divide-y divide-border border-t border-border">
          {rows.map((row) => {
            const former = !row.is_active
            const label = fullName(row.user)
            return (
              <li
                className={[
                  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 md:p-5',
                  former ? 'opacity-60' : '',
                ].join(' ')}
                key={row.id}
              >
                <Avatar member={row.user} label={label} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{label}</p>
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                      {row.role === 'admin' ? 'Admin' : 'Member'}
                    </span>
                    {former && (
                      <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
                        Left
                      </span>
                    )}
                  </div>
                  <MemberEmail email={row.user.email} />
                </div>
                {canManage && row.is_active && row.user.id !== session?.id && (
                  <button
                    className="rounded-lg p-2 text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                    type="button"
                    aria-label={`Remove ${label}`}
                    disabled={!online || busy}
                    onClick={() => setPendingRemoval(row)}
                  >
                    <UserMinus aria-hidden size={18} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
      <section className="rounded-2xl border border-border bg-surface-raised p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Group lifecycle</h2>
          <div className="flex flex-wrap gap-3">
            {canManage && !archived && (
              <Button
                variant="secondary"
                aria-label="Archive"
                className="icon-label-button"
                disabled={!online || busy}
                onClick={() => setPendingLifecycleAction('archive')}
              >
                <Archive aria-hidden size={16} />
                <span>Archive</span>
              </Button>
            )}
            {canManage && archived && (
              <>
                <Button
                  variant="secondary"
                  aria-label="Unarchive"
                  className="icon-label-button"
                  disabled={!online || busy}
                  onClick={() =>
                    void run(() => unarchiveGroup(group.id), 'Group restored.')
                  }
                >
                  <RotateCcw aria-hidden size={16} />
                  <span>Unarchive</span>
                </Button>
                <Button
                  variant="danger"
                  aria-label="Delete group"
                  className="icon-label-button"
                  disabled={!online || busy}
                  onClick={() => setPendingLifecycleAction('delete')}
                >
                  <Trash2 aria-hidden size={16} />
                  <span>Delete group</span>
                </Button>
              </>
            )}
            {membership?.is_active && (
              <Button
                variant="secondary"
                aria-label="Leave group"
                className="icon-label-button"
                disabled={!online || busy}
                onClick={() => setPendingLifecycleAction('leave')}
              >
                <LogOut aria-hidden size={16} />
                <span>Leave group</span>
              </Button>
            )}
          </div>
        </div>
      </section>
      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove member"
        question={`Do you really want to remove ${pendingRemoval ? fullName(pendingRemoval.user) : ''} from this group?`}
        confirmLabel="Remove"
        busy={busy}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => void confirmRemoval()}
      />
      <ConfirmDialog
        open={lifecycleConfirmation !== null}
        title={lifecycleConfirmation?.title ?? ''}
        question={lifecycleConfirmation?.question ?? ''}
        confirmLabel={lifecycleConfirmation?.confirmLabel ?? ''}
        busy={busy}
        onCancel={() => setPendingLifecycleAction(null)}
        onConfirm={() => void confirmLifecycleAction()}
      />
    </section>
  )
}

/** Returns the account's complete first-and-last-name label for the member directory. */
function fullName(
  user: Pick<UserDto, 'first_name' | 'last_name' | 'display_name'>,
): string {
  return `${user.first_name} ${user.last_name}`.trim() || user.display_name
}

/** Animates a member email only when it is actually clipped and motion is allowed. */
function MemberEmail({ email }: { email: string }) {
  const trackRef = useRef<HTMLParagraphElement>(null)
  const [overflow, setOverflow] = useState(0)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () =>
      setOverflow(
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : Math.max(track.scrollWidth - track.clientWidth, 0),
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [email])

  return (
    <p
      ref={trackRef}
      className="account-menu-email-track mt-1 text-sm text-muted"
    >
      {overflow > 0 ? (
        <span
          className="account-menu-email-marquee"
          style={
            { '--account-menu-email-shift': `-${overflow}px` } as CSSProperties
          }
        >
          {email}
        </span>
      ) : (
        email
      )}
    </p>
  )
}
