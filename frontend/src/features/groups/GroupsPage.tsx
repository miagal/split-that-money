// Lists server-visible groups and starts the server-only group creation flow.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { Link } from 'react-router-dom'
import {
  CarFront,
  CircleHelp,
  Handshake,
  House,
  PartyPopper,
  Plane,
  Plus,
  ShoppingBasket,
  TentTree,
  UtensilsCrossed,
} from 'lucide-react'
import type { GroupDto } from '../../api/contracts.ts'
import { Button } from '../../components/Button.tsx'
import { groupIconComponent } from '../../lib/icons.ts'
import { GroupDialog } from './GroupDialog.tsx'
import {
  canOpenGroupDialog,
  groupListEntryClass,
  isCurrentGroupListRequest,
  listFetchFailed,
  listFetchSucceeded,
  listWithCreatedGroup,
  newRowIds,
  shouldShowGroupList,
  type GroupListState,
} from './groups-page-rules.ts'
import {
  createGroup,
  fetchBalances,
  fetchGroups,
  groupOverviewPath,
} from './group-api.ts'
import { useToast } from '../feedback/ToastProvider.tsx'
import {
  GENERIC_ERROR_MESSAGE,
  toastMessage,
} from '../feedback/api-feedback.ts'
import { useAuth, useSyncActions } from '../../app/providers.tsx'
import { formatMoney } from '../../lib/money.ts'
import { groupListRowClass } from './group-view-rules.ts'
import { openMoneyStore } from '../sync/database.ts'

const lucideIcons: Record<
  string,
  ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
> = {
  House,
  Plane,
  ShoppingBasket,
  UtensilsCrossed,
  CarFront,
  TentTree,
  PartyPopper,
  Handshake,
  CircleHelp,
}

/** Renders the authenticated group landing page. */
export function GroupsPage() {
  const [list, setList] = useState<GroupListState<GroupDto>>({
    groups: [],
    error: null,
  })
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  )
  const toast = useToast()
  const { offlineCacheAvailable, cacheEpoch, isCacheEpochCurrent } = useAuth()
  const syncActions = useSyncActions()
  const toastRef = useRef(toast)
  const refreshGeneration = useRef(0)
  const syncActionsRef = useRef(syncActions)
  const initialPaintDoneRef = useRef(false)
  const seenIdsRef = useRef(new Set<string>())

  useEffect(() => {
    toastRef.current = toast
  }, [toast])
  useEffect(() => {
    syncActionsRef.current = syncActions
  }, [syncActions])

  /** Loads visible groups without allowing a successful create to erase a failed-list error. */
  const loadGroups = useCallback(
    async (createdGroup?: GroupDto): Promise<void> => {
      const requestGeneration = ++refreshGeneration.current
      let paintedFromCache = false
      if (offlineCacheAvailable) {
        try {
          const store = await openMoneyStore()
          try {
            const cached = await store.getGroups()
            if (
              !isCurrentGroupListRequest(
                requestGeneration,
                refreshGeneration.current,
              )
            )
              return
            if (!isCacheEpochCurrent(cacheEpoch)) return
            if (cached.length > 0) {
              paintedFromCache = true
              setList((current) =>
                listFetchSucceeded(current, cached, createdGroup),
              )
              setLoading(false)
            }
          } finally {
            store.close()
          }
        } catch {
          // Network revalidation below still owns the recoverable error path.
        }
      }
      try {
        const rows = await fetchGroups()
        if (
          !isCurrentGroupListRequest(
            requestGeneration,
            refreshGeneration.current,
          )
        )
          return
        setList((current) => listFetchSucceeded(current, rows, createdGroup))
        const writeEpoch = cacheEpoch
        if (offlineCacheAvailable) {
          void openMoneyStore()
            .then(async (store) => {
              try {
                if (
                  isCurrentGroupListRequest(
                    requestGeneration,
                    refreshGeneration.current,
                  ) &&
                  isCacheEpochCurrent(writeEpoch)
                )
                  await store.putGroups(rows)
              } finally {
                store.close()
              }
            })
            .catch(() => undefined)
        }
      } catch (reason) {
        if (
          !isCurrentGroupListRequest(
            requestGeneration,
            refreshGeneration.current,
          )
        )
          return
        if (paintedFromCache) return
        if (
          !isCurrentGroupListRequest(
            requestGeneration,
            refreshGeneration.current,
          )
        )
          return
        const message = toastMessage(reason) ?? GENERIC_ERROR_MESSAGE
        toastRef.current.error(message)
        setList((current) => listFetchFailed(current))
      } finally {
        if (
          isCurrentGroupListRequest(
            requestGeneration,
            refreshGeneration.current,
          )
        )
          setLoading(false)
      }
    },
    [cacheEpoch, isCacheEpochCurrent, offlineCacheAvailable],
  )

  /** Starts a user-requested list refresh with an immediate loading state. */
  const refreshGroups = useCallback(
    async (createdGroup?: GroupDto): Promise<void> => {
      setLoading(true)
      await loadGroups(createdGroup)
    },
    [loadGroups],
  )

  useEffect(() => {
    async function loadInitialGroups(): Promise<void> {
      await loadGroups()
    }
    void loadInitialGroups()
    return () => {
      refreshGeneration.current += 1
    }
  }, [loadGroups])

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  const groupIdsKey = useMemo(
    () => list.groups.map((row) => row.id).join(':'),
    [list.groups],
  )

  useEffect(() => {
    if (!syncActions.ready || groupIdsKey === '') return
    const ids = groupIdsKey.split(':')
    ids.forEach((groupId) => {
      syncActionsRef.current.registerGroup(groupId)
      void syncActionsRef.current.syncGroup(groupId)
    })
    return () =>
      ids.forEach((groupId) => syncActionsRef.current.unregisterGroup(groupId))
  }, [groupIdsKey, syncActions.ready])

  /** Creates a group and retries a previously failed visible-group refresh. */
  async function handleCreate(
    input: Parameters<typeof createGroup>[0],
  ): Promise<void> {
    const group = await createGroup(input)
    setList((current) => listWithCreatedGroup(current, group))
    toast.success('Group created.')
    if (list.error) void refreshGroups(group)
  }

  const canCreate = canOpenGroupDialog(online, loading)
  const initialLoadComplete = !loading
  const showList = shouldShowGroupList(initialLoadComplete, Boolean(list.error))
  // oxlint-disable react/refs -- This render-time ref bookkeeping is required so new rows get list-enter on their first visible render without effect state.
  const enteringIds = newRowIds(
    seenIdsRef.current,
    list.groups,
    initialPaintDoneRef.current,
  )
  list.groups.forEach((group) => seenIdsRef.current.add(group.id))
  if (initialLoadComplete) initialPaintDoneRef.current = true
  // oxlint-enable react/refs
  return (
    <section className="mx-auto grid max-w-5xl gap-6 px-3 py-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Your groups</h1>
          <p className="mt-1 text-muted">Shared money, kept simple.</p>
        </div>
        {online && (
          <Button onClick={() => setDialogOpen(true)} disabled={!canCreate}>
            <Plus aria-hidden size={19} className="mr-2 inline" />
            New group
          </Button>
        )}
      </div>
      {!online && (
        <p className="text-sm text-muted" role="status">
          New groups need an internet connection.
        </p>
      )}
      {list.error && (
        <p className="text-danger" role="alert">
          {list.error}
        </p>
      )}
      {showList && (
        <div
          className={`grid gap-2 ${groupListEntryClass(initialLoadComplete)}`}
        >
          {list.groups.map((group) => (
            <GroupListRow
              key={group.id}
              group={group}
              className={enteringIds.has(group.id) ? 'list-enter' : ''}
            />
          ))}
          {list.groups.length === 0 && (
            <p className="empty-state">
              Create your first group to start splitting expenses.
            </p>
          )}
        </div>
      )}
      <GroupDialog
        open={dialogOpen}
        online={online}
        onClose={() => setDialogOpen(false)}
        onCreate={handleCreate}
      />
    </section>
  )
}

/** Renders one route link with leading identity, compact details, and a trailing balance. */
function GroupListRow({
  group,
  className = '',
}: {
  group: GroupDto
  className?: string
}) {
  const component = groupIconComponent(group.icon)
  const Icon = lucideIcons[component] ?? CircleHelp
  const emoji =
    group.icon.startsWith('emoji:') && component !== 'CircleHelp'
      ? component
      : null
  const activeCount = group.memberships.filter(
    (membership) => membership.is_active,
  ).length
  const { session } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    void fetchBalances(group.id)
      .then((result) => {
        if (active)
          setBalance(
            result.balances.find((row) => row.user_id === session?.id)
              ?.amount_cents ?? 0,
          )
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [group.id, session?.id])

  return (
    <Link
      className={`${groupListRowClass()} ${className}`.trim()}
      to={groupOverviewPath(group.id)}
    >
      <span className="grid size-10 place-items-center rounded-lg bg-accent/10 text-accent">
        {emoji ?? <Icon aria-hidden size={21} />}
      </span>
      <div className="min-w-0">
        <h2 className="truncate font-bold">{group.name}</h2>
        <p className="truncate text-sm text-muted">
          {activeCount} active {activeCount === 1 ? 'member' : 'members'} ·{' '}
          {group.currency}
        </p>
      </div>
      <div className="min-w-0 text-right">
        <p className="text-xs text-muted">Your balance</p>
        <p className="truncate font-semibold tabular-nums">
          {balance === null ? '—' : formatMoney(balance, group.currency)}
        </p>
      </div>
    </Link>
  )
}
