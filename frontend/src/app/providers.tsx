// oxlint-disable react/only-export-components -- The public session hook belongs with its one application provider.
// Defines app-wide development and session state providers without adding a global state library.
import {
  createContext,
  StrictMode,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { LoginDto, UserDto } from '../api/contracts.ts'
import {
  getPublicConfig,
  getSession,
  login as requestLogin,
  logout as requestLogout,
} from '../features/auth/auth-api.ts'
import {
  SESSION_BOOT_TIMEOUT_MS,
  serverSessionOutcome,
} from './auth-boot-rules.ts'
import {
  cachedSessionBoot,
  createDeviceSignOut,
  failedSessionBoot,
  loadingSessionBoot,
  persistSessionCache,
  resolvedSessionBoot,
  type SessionBootState,
} from './auth-state.ts'
import { ToastProvider } from '../features/feedback/ToastProvider.tsx'
import { ApiClient, AuthEpochError } from '../api/client.ts'
import {
  createSyncStatusController,
  SYNC_REQUEST_TIMEOUT_MS,
  syncRequestTimeoutMs,
  type SyncSnapshot,
  type SyncStatus,
  type SyncStatusController,
} from '../features/sync/sync.ts'
import {
  beginMoneyStoreTransition,
  enableMoneyStoreEpoch,
  moneyStoreEpochIsCurrent,
  openMoneyStore,
  type MoneyStore,
  type OutboxRow,
} from '../features/sync/database.ts'

type AppProvidersProps = {
  children: ReactNode
}

type AuthContextValue = {
  session: UserDto | null | undefined
  bootError: boolean
  sessionExpired: boolean
  sessionExpiredNoticeSeen: boolean
  offlineCacheAvailable: boolean
  cachedSessionAllowed: boolean
  cacheEpoch: number
  isCacheEpochCurrent(epoch: number): boolean
  retrySession: () => void
  login: (credentials: LoginDto) => Promise<UserDto>
  logout: () => Promise<void>
  leaveToLogin: () => void
  continueCachedSession: () => Promise<UserDto>
  signOutOnDevice: () => Promise<void>
  dismissSessionExpiredNotice: () => void
  markSessionExpired: () => void
  pendingChanges: () => Promise<number>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Wraps application content in shared development-time providers.
 *
 * @param props - The application subtree to render.
 * @returns The provider-wrapped application subtree.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <StrictMode>
      <ToastProvider>
        <AuthProvider>
          <SyncProvider>{children}</SyncProvider>
        </AuthProvider>
      </ToastProvider>
    </StrictMode>
  )
}

type SyncContextValue = {
  ready: boolean
  status: SyncStatus
  pendingChanges: number
  syncGroup(groupId: string): Promise<void>
  registerGroup(groupId: string): void
  unregisterGroup(groupId: string): void
  enqueue(
    row: Omit<OutboxRow, 'sequence' | 'sync_status'> & {
      sync_status?: OutboxRow['sync_status']
    },
  ): Promise<number>
}
const SyncContext = createContext<SyncContextValue>({
  ready: false,
  status: 'Synced',
  pendingChanges: 0,
  syncGroup: async () => undefined,
  registerGroup: () => undefined,
  unregisterGroup: () => undefined,
  enqueue: async () => 0,
})
const onlineIdleSnapshot: SyncSnapshot = { status: 'Synced', pending: 0 }
const offlineIdleSnapshot: SyncSnapshot = {
  status: 'Server not reachable',
  pending: 0,
}
const noSyncSubscription = () => () => undefined

/** Reads the badge snapshot used before the controller exists; an offline browser must not look synced. */
export const idleSyncSnapshotOf = (): SyncSnapshot =>
  typeof navigator !== 'undefined' && !navigator.onLine
    ? offlineIdleSnapshot
    : onlineIdleSnapshot

function SyncProvider({ children }: AppProvidersProps) {
  const {
    cacheEpoch,
    offlineCacheAvailable,
    isCacheEpochCurrent,
    markSessionExpired,
  } = useAuth()
  const [controller, setController] = useState<
    SyncStatusController | undefined
  >(undefined)
  const [storeFailed, setStoreFailed] = useState(false)
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noSyncSubscription,
    controller?.getSnapshot ?? idleSyncSnapshotOf,
  )

  useEffect(() => {
    if (!offlineCacheAvailable) return
    let store: MoneyStore | undefined
    let current: SyncStatusController | undefined
    let active = true
    const onOnline = () => {
      void current?.online()
    }
    const onOffline = () => current?.offline()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    void Promise.all([
      openMoneyStore(),
      getPublicConfig()
        .then((config) =>
          syncRequestTimeoutMs(config.SYNC_REQUEST_TIMEOUT_SECONDS),
        )
        .catch(() => SYNC_REQUEST_TIMEOUT_MS),
    ])
      .then(([opened, requestTimeoutMs]) => {
        if (!active) {
          opened.close()
          return
        }
        store = opened
        current = createSyncStatusController(
          opened,
          new ApiClient(),
          () => active && isCacheEpochCurrent(cacheEpoch),
          markSessionExpired,
          requestTimeoutMs,
        )
        setStoreFailed(false)
        setController(current)
      })
      .catch(() => {
        if (active) setStoreFailed(true)
      })
    return () => {
      active = false
      setController(undefined)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      store?.close()
    }
  }, [
    cacheEpoch,
    isCacheEpochCurrent,
    markSessionExpired,
    offlineCacheAvailable,
  ])

  const contextValue: SyncContextValue = {
    ready: offlineCacheAvailable && controller !== undefined,
    status: storeFailed ? 'Needs attention' : snapshot.status,
    pendingChanges: snapshot.pending,
    syncGroup: (groupId) => controller?.sync(groupId) ?? Promise.resolve(),
    registerGroup: (groupId) => controller?.registerGroup(groupId),
    unregisterGroup: (groupId) => controller?.unregisterGroup(groupId),
    enqueue: (row) => controller?.enqueue(row) ?? Promise.resolve(0),
  }
  return <SyncContext value={contextValue}>{children}</SyncContext>
}

export function useSyncStatus(): SyncStatus {
  return useContext(SyncContext).status
}

export function useSyncPendingChanges(): number {
  return useContext(SyncContext).pendingChanges
}

export function useSyncActions(): Pick<
  SyncContextValue,
  'ready' | 'enqueue' | 'syncGroup' | 'registerGroup' | 'unregisterGroup'
> {
  return useContext(SyncContext)
}

/**
 * Boots the existing Django session and exposes session mutations to routed features.
 *
 * @param props - The routed application subtree that may consume authentication state.
 * @returns The context provider around authenticated and public routes.
 */
function AuthProvider({ children }: AppProvidersProps) {
  const [sessionBoot, setSessionBoot] =
    useState<SessionBootState>(loadingSessionBoot)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [sessionExpiredNoticeSeen, setSessionExpiredNoticeSeen] =
    useState(false)
  const [offlineCacheAvailable, setOfflineCacheAvailable] = useState(false)
  const [cacheEpoch, setCacheEpoch] = useState(0)
  const [device] = useState(createDeviceSignOut)
  const [signedOut, setSignedOut] = useState(() => device.isSignedOut())
  const sessionRequestGeneration = useRef(0)
  const cacheEpochRef = useRef(0)

  const isCacheEpochCurrent = useCallback(
    (epoch: number): boolean =>
      cacheEpochRef.current === epoch && moneyStoreEpochIsCurrent(epoch),
    [],
  )

  /** Shows the expired-session state when a sync request finds no server session. */
  const markSessionExpired = useCallback(
    (): void => setSessionExpired(true),
    [],
  )

  /** Invalidates every current cache/sync operation before an account change may write local data. */
  const invalidateCacheEpoch = useCallback((): number => {
    const epoch = beginMoneyStoreTransition()
    cacheEpochRef.current = epoch
    setOfflineCacheAvailable(false)
    setCacheEpoch(epoch)
    return epoch
  }, [])

  /** Enables the current cache epoch after a cached or server-confirmed account is safe to use. */
  const enableCacheEpoch = useCallback((): void => {
    enableMoneyStoreEpoch(cacheEpochRef.current)
    setOfflineCacheAvailable(true)
  }, [])

  /** Persists a server-confirmed session; only a stored identity lifts a device sign-out. */
  const cacheResolvedSession = useCallback(
    (
      session: UserDto | null,
      requestGeneration: number,
      epoch: number,
    ): Promise<void> => {
      const isCurrent = () =>
        requestGeneration === sessionRequestGeneration.current &&
        epoch === cacheEpochRef.current
      return openMoneyStore({ allowDuringTransition: true })
        .then(async (store) => {
          try {
            return await persistSessionCache(store, session, isCurrent)
          } finally {
            store.close()
          }
        })
        .then((stored) => {
          if (!stored || !isCurrent()) return
          device.clear()
          setSignedOut(false)
          enableCacheEpoch()
        })
    },
    [device, enableCacheEpoch],
  )

  /**
   * Shows the cached account at once and lets the server only correct it.
   *
   * @returns Nothing.
   */
  const loadSession = useCallback(async (): Promise<void> => {
    const requestGeneration = ++sessionRequestGeneration.current
    const isCurrent = () =>
      requestGeneration === sessionRequestGeneration.current
    if (device.isSignedOut()) {
      invalidateCacheEpoch()
      setSessionBoot(resolvedSessionBoot(null))
      return
    }
    let cached: UserDto | null
    try {
      cached = await readCachedUser()
    } catch {
      if (isCurrent()) setSessionBoot(failedSessionBoot())
      return
    }
    if (!isCurrent()) return
    if (cached) {
      enableCacheEpoch()
      setSessionBoot(cachedSessionBoot(cached))
    }
    let session: UserDto | null
    try {
      session = await getSession({ timeoutMs: SESSION_BOOT_TIMEOUT_MS })
    } catch {
      if (isCurrent() && !cached) setSessionBoot(failedSessionBoot())
      return
    }
    if (!isCurrent()) return
    const outcome = serverSessionOutcome(cached, session)
    if (outcome === 'expired') setSessionExpired(true)
    else if (outcome === 'none') setSessionBoot(resolvedSessionBoot(null))
    else if (outcome === 'same' && session) {
      // A successful current-user response means this session is not expired.
      setSessionExpired(false)
      setSessionBoot(resolvedSessionBoot(session))
      void openMoneyStore()
        .then((store) =>
          store.setCachedSession(session).finally(() => store.close()),
        )
        .catch(() => undefined)
    } else if (session) {
      setSessionExpired(false)
      const epoch = invalidateCacheEpoch()
      setSessionBoot(resolvedSessionBoot(session))
      void cacheResolvedSession(session, requestGeneration, epoch).catch(
        () => undefined,
      )
    }
  }, [cacheResolvedSession, device, enableCacheEpoch, invalidateCacheEpoch])

  /**
   * Restarts session boot after a recoverable transport failure.
   *
   * @returns Nothing.
   */
  const retrySession = useCallback(() => {
    setSessionBoot(loadingSessionBoot())
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Boot must start once on mount before any route renders data.
    void loadSession()
    return () => {
      sessionRequestGeneration.current += 1
    }
  }, [loadSession])

  /**
   * Starts a session and clears the expired flag before the cached account is refreshed.
   *
   * @param credentials - Login credentials passed to the feature API adapter.
   * @returns The authenticated user returned by the backend.
   * @throws {AuthEpochError} When a newer session request superseded this login.
   */
  async function login(credentials: LoginDto): Promise<UserDto> {
    const requestGeneration = ++sessionRequestGeneration.current
    const epoch = invalidateCacheEpoch()
    const user = await requestLogin(credentials)
    if (requestGeneration !== sessionRequestGeneration.current)
      throw new AuthEpochError()
    setSessionExpired(false)
    setSessionBoot(resolvedSessionBoot(user))
    void cacheResolvedSession(user, requestGeneration, epoch).catch(
      () => undefined,
    )
    return user
  }

  /**
   * Marks the expired-session modal seen for this app start.
   *
   * Menu remounts must not open it again. The skull badge is separate and stays.
   *
   * @returns Nothing.
   */
  function dismissSessionExpiredNotice(): void {
    setSessionExpiredNoticeSeen(true)
  }

  /**
   * Drops the in-memory session so login can render without touching device data.
   *
   * @returns Nothing.
   */
  function leaveToLogin(): void {
    sessionRequestGeneration.current += 1
    setOfflineCacheAvailable(false)
    setSessionBoot(resolvedSessionBoot(null))
  }

  /**
   * Restores the cached user for this document without a network session check.
   *
   * @returns The cached user now treated as the in-memory session.
   * @throws {Error} When this device is signed out or no cached user is stored.
   */
  async function continueCachedSession(): Promise<UserDto> {
    if (device.isSignedOut())
      throw new Error('This device has been signed out.')
    const user = await readCachedUser()
    if (!user) throw new Error('No cached session is available.')
    enableCacheEpoch()
    setSessionBoot(cachedSessionBoot(user))
    return user
  }

  /**
   * Durably locks the cached account, then clears local data and tries a server logout.
   *
   * @returns A promise resolved after the local clear finishes, whether or not the server logout succeeds.
   * @throws {Error} When the device sign-out marker cannot be persisted.
   */
  async function signOutOnDevice(): Promise<void> {
    const epoch = invalidateCacheEpoch()
    const requestGeneration = ++sessionRequestGeneration.current
    const marked = device.mark()
    setSignedOut(true)
    setSessionExpired(false)
    setSessionBoot(resolvedSessionBoot(null))
    if (!marked) throw new Error('Could not persist device sign-out.')
    try {
      await cacheResolvedSession(null, requestGeneration, epoch)
    } finally {
      void requestLogout({ timeoutMs: SESSION_BOOT_TIMEOUT_MS }).catch(
        () => undefined,
      )
    }
  }

  /**
   * Signs out fully only after a resolved logout when nothing would be lost.
   *
   * Any rejection keeps device data. Only a resolved logout may check pending
   * changes, and only a readable empty outbox may clear the device.
   *
   * @returns A promise resolved after the soft leave or the device sign-out finishes.
   */
  async function logout(): Promise<void> {
    try {
      await requestLogout({ timeoutMs: SESSION_BOOT_TIMEOUT_MS })
      if ((await pendingChanges()) > 0) {
        leaveToLogin()
        return
      }
    } catch {
      leaveToLogin()
      return
    }
    await signOutOnDevice()
  }

  return (
    <AuthContext
      value={{
        session: sessionBoot.session,
        bootError: sessionBoot.bootError,
        sessionExpired,
        sessionExpiredNoticeSeen,
        offlineCacheAvailable,
        cachedSessionAllowed: !signedOut,
        cacheEpoch,
        isCacheEpochCurrent,
        retrySession,
        login,
        logout,
        leaveToLogin,
        continueCachedSession,
        signOutOnDevice,
        dismissSessionExpiredNotice,
        markSessionExpired,
        pendingChanges,
      }}
    >
      {children}
    </AuthContext>
  )
}

/**
 * Reads the cached user even while an account transition has disabled normal store access.
 *
 * @returns The stored user, or null when the cache has no session.
 */
async function readCachedUser(): Promise<UserDto | null> {
  const store = await openMoneyStore({ allowDuringTransition: true })
  try {
    return await store.getCachedSession()
  } finally {
    store.close()
  }
}

/**
 * Counts unsynced changes that a device sign-out would delete.
 *
 * @returns The number of pending outbox rows.
 */
async function pendingChanges(): Promise<number> {
  const store = await openMoneyStore({ allowDuringTransition: true })
  try {
    return await store.pendingCount()
  } finally {
    store.close()
  }
}

/**
 * Reads the routed application's current authentication state and session actions.
 *
 * @returns The active session state plus expiry marking, notice dismissal, pending changes, login, logout, soft-leave, and device sign-out actions.
 * @throws {Error} When used outside the root provider boundary.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AppProviders.')
  return context
}
