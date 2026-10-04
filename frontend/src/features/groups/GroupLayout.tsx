// Loads a routed group and renders its responsive navigation shell.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CarFront,
  CircleHelp,
  Handshake,
  House,
  PartyPopper,
  Plane,
  ShoppingBasket,
  TentTree,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { GroupDto } from '../../api/contracts.ts'
import { ApiError, isTransportFailure } from '../../api/client.ts'
import { useAuth, useSyncActions } from '../../app/providers.tsx'
import { groupIconComponent, type IconComponent } from '../../lib/icons.ts'
import { fetchGroup } from './group-api.ts'
import { GroupTabs } from './GroupTabs.tsx'
import {
  currentTabLabel,
  desktopSidebarClass,
  groupErrorKind,
  shouldShowGroupLoadingPlaceholder,
} from './group-view-rules.ts'
import { canStartInitialGroupSync } from '../sync/sync.ts'
import { GroupContext } from './group-context.ts'
import { openMoneyStore } from '../sync/database.ts'

/** Loads one group and owns its sidebar, tab navigation, and responsive actions. */
export function GroupLayout() {
  const { groupId } = useParams<{ groupId: string }>()
  const id = groupId ?? ''
  return <GroupLayoutContent key={id} id={id} />
}

/** Owns group-specific state so changing the route parameter starts with a fresh loading state. */
function GroupLayoutContent({ id }: { id: string }) {
  const [group, setGroup] = useState<GroupDto | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [headerAction, setHeaderAction] = useState<ReactNode | null>(null)
  const syncActions = useSyncActions()
  const { offlineCacheAvailable, cacheEpoch, isCacheEpochCurrent } = useAuth()
  const syncActionsRef = useRef(syncActions)
  const loadGeneration = useRef(0)
  const location = useLocation()
  const load = useCallback(async () => {
    if (!id) return
    const requestGeneration = ++loadGeneration.current
    let paintedFromCache = false
    // Prefer a local row first so pull-refresh can keep the group shell while the network revalidates.
    if (offlineCacheAvailable) {
      try {
        const store = await openMoneyStore()
        try {
          const cached = await store.getGroup(id)
          if (
            requestGeneration === loadGeneration.current &&
            isCacheEpochCurrent(cacheEpoch) &&
            cached
          ) {
            paintedFromCache = true
            setGroup(cached)
            setError(null)
            setLoading(false)
          }
        } finally {
          store.close()
        }
      } catch {
        // Network load below still owns the recoverable error path.
      }
    }
    try {
      const fetched = await fetchGroup(id)
      if (requestGeneration !== loadGeneration.current) return
      setGroup(fetched)
      setError(null)
      const writeEpoch = cacheEpoch
      if (offlineCacheAvailable) {
        void openMoneyStore()
          .then(async (store) => {
            try {
              if (
                requestGeneration === loadGeneration.current &&
                isCacheEpochCurrent(writeEpoch)
              )
                await store.putGroups([fetched])
            } finally {
              store.close()
            }
          })
          .catch(() => undefined)
      }
    } catch (reason) {
      if (offlineCacheAvailable && isTransportFailure(reason)) {
        try {
          const store = await openMoneyStore()
          try {
            const cached = await store.getGroup(id)
            if (requestGeneration !== loadGeneration.current) return
            if (!isCacheEpochCurrent(cacheEpoch)) return
            if (cached) {
              setGroup(cached)
              setError(null)
              return
            }
          } finally {
            store.close()
          }
        } catch {
          // The existing recoverable error view handles unavailable local storage too.
        }
      }
      if (requestGeneration !== loadGeneration.current) return
      // A warm local shell stays up unless the server confirms the group is gone or forbidden.
      if (paintedFromCache) {
        if (
          reason instanceof ApiError &&
          (reason.status === 403 || reason.status === 404)
        ) {
          setGroup(null)
          setError(reason)
        }
        return
      }
      setError(reason)
    } finally {
      if (requestGeneration === loadGeneration.current) setLoading(false)
    }
  }, [cacheEpoch, id, isCacheEpochCurrent, offlineCacheAvailable])
  const refresh = useCallback(async () => {
    setLoading(true)
    await load()
  }, [load])

  useEffect(() => {
    async function loadInitialGroup(): Promise<void> {
      await load()
    }
    void loadInitialGroup()
    return () => {
      loadGeneration.current += 1
    }
  }, [load])
  useEffect(() => {
    syncActionsRef.current = syncActions
  }, [syncActions])
  useEffect(() => {
    if (!canStartInitialGroupSync(id, syncActions.ready)) return
    syncActionsRef.current.registerGroup(id)
    void syncActionsRef.current.syncGroup(id)
    return () => syncActionsRef.current.unregisterGroup(id)
  }, [id, syncActions.ready])

  if (shouldShowGroupLoadingPlaceholder(loading, group)) return null
  if (error || !group) return <GroupError error={error} onRetry={refresh} />
  const activeMembers = group.memberships.filter(
    (membership) => membership.is_active,
  ).length
  const icon = groupIconComponent(group.icon)
  return (
    <GroupContext value={{ group, refresh, setHeaderAction }}>
      <div className="mx-auto grid max-w-7xl gap-4 px-3 py-4 pb-24 sm:gap-6 sm:p-8 md:grid-cols-[15rem_1fr] md:pb-8">
        <aside className={desktopSidebarClass()}>
          <Link
            className="mb-5 inline-flex items-center gap-2 text-sm text-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            to="/groups"
          >
            <ArrowLeft aria-hidden size={16} />
            All groups
          </Link>
          <div className="mb-6 flex items-center gap-3">
            <GroupMark icon={icon} />
            <div className="min-w-0">
              <h1 className="truncate font-bold">{group.name}</h1>
              <p className="text-xs text-muted">
                {activeMembers} active members · {group.currency}
              </p>
            </div>
          </div>
          <GroupTabs groupId={id} />
        </aside>
        <div className="min-w-0">
          <div className="sticky top-0 z-10 mb-5 flex items-start justify-between gap-4 bg-surface py-4 md:hidden">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-accent">
                {currentTabLabel(location.pathname)}
              </p>
              <h1 className="truncate text-xl font-bold">{group.name}</h1>
              <p className="text-xs text-muted">
                {activeMembers} active members · {group.currency}
              </p>
            </div>
          </div>
          <div className="sticky top-0 z-10 mb-3 hidden items-center justify-between bg-surface py-4 md:flex">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-accent">
                {currentTabLabel(location.pathname)}
              </p>
              <h2 className="text-2xl font-bold">{group.name}</h2>
              <p className="text-sm text-muted">
                {activeMembers} active members · {group.currency}
              </p>
            </div>
            {headerAction}
          </div>
          <div className="md:hidden">
            <GroupTabs groupId={id} />
          </div>
          <Outlet />
        </div>
      </div>
    </GroupContext>
  )
}

function GroupError({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => Promise<void>
}) {
  const kind = groupErrorKind(
    error instanceof ApiError ? error.status : undefined,
  )
  return (
    <section className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">
        {kind === 'forbidden'
          ? 'Access denied'
          : kind === 'missing'
            ? 'Group not found'
            : 'Could not load group'}
      </h1>
      <p className="mt-2 text-muted">
        {kind === 'forbidden'
          ? 'You do not have access to this group.'
          : kind === 'missing'
            ? 'This group may have been removed or the link is invalid.'
            : 'The group could not be loaded. Check your connection and try again.'}
      </p>
      {kind === 'recoverable' && (
        <button
          className="mt-5 rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast"
          type="button"
          onClick={() => void onRetry()}
        >
          Try again
        </button>
      )}
      <Link
        className="mt-5 ml-3 inline-block text-accent underline"
        to="/groups"
      >
        Back to groups
      </Link>
    </section>
  )
}

function GroupMark({ icon }: { icon: IconComponent }) {
  const icons: Record<string, LucideIcon> = {
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
  const Icon = icons[icon] ?? CircleHelp
  return (
    <span className="grid size-10 place-items-center rounded-lg bg-accent/10 text-accent">
      {Icon === CircleHelp && icon !== 'CircleHelp' ? (
        icon
      ) : (
        <Icon aria-hidden size={20} />
      )}
    </span>
  )
}
