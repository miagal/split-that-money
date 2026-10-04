// oxlint-disable react/only-export-components -- This route module intentionally exports browser configuration beside route components.
// Defines public and guarded routes, keeping authentication redirects independent from page features.
import { type ReactNode } from 'react'
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useNavigate,
} from 'react-router-dom'
import { AccountMenu } from '../features/account/AccountMenu.tsx'
import { PullToReload } from '../components/PullToReload.tsx'
import { LoginPage } from '../features/auth/LoginPage.tsx'
import { GroupsPage } from '../features/groups/GroupsPage.tsx'
import { GroupLayout } from '../features/groups/GroupLayout.tsx'
import { OverviewPage } from '../features/groups/OverviewPage.tsx'
import { SettingsPage } from '../features/groups/SettingsPage.tsx'
import { BalancesPage } from '../features/balances/BalancesPage.tsx'
import { ExpensesPage } from '../features/expenses/ExpensesPage.tsx'
import { InsightsPage } from '../features/insights/InsightsPage.tsx'
import { AdminUsersPage } from '../features/admin/AdminUsersPage.tsx'
import { OfflineSetupPage } from '../features/offline-setup/OfflineSetupPage.tsx'
import {
  groupTabPaths,
  type GroupTabPath,
} from '../features/groups/group-view-rules.ts'
import { useAuth } from './providers.tsx'
import { canAccessAdmin, nextPathForSession } from './router-rules.ts'

export { nextPathForSession } from './router-rules.ts'

/**
 * Prevents public login content from appearing once the session boot has resolved as authenticated.
 *
 * @returns The standalone login page or the authenticated landing redirect.
 */
function PublicLoginRoute() {
  const { session, bootError, retrySession } = useAuth()
  if (bootError) return <RouteBootError onRetry={retrySession} />
  if (session === undefined) return <RouteLoading />
  return session ? (
    <Navigate to={nextPathForSession(session, '/login')} replace />
  ) : (
    <LoginPage />
  )
}

/**
 * Supplies the minimal authenticated shell for a confirmed network or cached session and protects nested routes.
 *
 * @returns The guarded application shell or a login redirect.
 */
function AuthenticatedRoute() {
  const {
    session,
    bootError,
    retrySession,
    cacheEpoch,
    offlineCacheAvailable,
  } = useAuth()
  if (bootError) return <RouteBootError onRetry={retrySession} />
  if (session === undefined) return <RouteLoading />
  if (!session)
    return <Navigate to={nextPathForSession(null, '/groups')} replace />

  return (
    <main className="app-shell flex h-svh flex-col overflow-hidden bg-surface text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <span className="flex items-center gap-2 font-bold">
          <img src="/icon.svg" alt="" className="size-6" />
          split that money
        </span>
        <AccountMenu user={session} />
      </header>
      <PullToReload className="app-scroll-region min-h-0 flex-1 overflow-y-auto">
        <Outlet
          key={`${session.id}:${cacheEpoch}:${offlineCacheAvailable ? 'ready' : 'transition'}`}
        />
      </PullToReload>
    </main>
  )
}

/** Redirects ordinary signed-in users away from the system-admin page. */
function AdminUsersRoute() {
  const { session } = useAuth()
  const online = typeof navigator === 'undefined' || navigator.onLine
  return canAccessAdmin(session ?? null) && online ? (
    <AdminUsersPage />
  ) : (
    <Navigate to="/groups" replace />
  )
}

/**
 * Holds a blank surface while session boot is unresolved so guarded content never flashes.
 *
 * @returns An empty full-viewport placeholder matching the app background.
 */
function RouteLoading() {
  return <main className="min-h-svh bg-surface" />
}

/**
 * Keeps a failed session check distinct from an unauthenticated redirect and lets the user retry.
 *
 * @param props - Callback that repeats the current-user request.
 * @returns A session-boot error screen.
 */
export function RouteBootError({ onRetry }: { onRetry: () => void }) {
  const { leaveToLogin } = useAuth()
  const navigate = useNavigate()

  /** Shows login without deleting the device cache, so this document can still continue offline. */
  function returnToLogin(): void {
    leaveToLogin()
    navigate('/login', { replace: true })
  }

  return (
    <main className="grid min-h-svh place-items-center bg-surface px-6 text-foreground">
      <section className="grid max-w-sm gap-4 text-center">
        <h1 className="text-2xl font-bold">We couldn’t load your account.</h1>
        <button
          className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast"
          type="button"
          onClick={onRetry}
        >
          Try again
        </button>
        <button
          className="rounded-lg border border-border px-4 py-2 font-semibold"
          type="button"
          onClick={returnToLogin}
        >
          Go to login
        </button>
      </section>
    </main>
  )
}

const groupChildPages = {
  overview: <OverviewPage />,
  expenses: <ExpensesPage />,
  balances: <BalancesPage />,
  insights: <InsightsPage />,
  settings: <SettingsPage />,
} satisfies Record<GroupTabPath, ReactNode>

const routes = [
  { path: '/login', element: <PublicLoginRoute /> },
  { path: '/offline_setup', element: <OfflineSetupPage /> },
  {
    element: <AuthenticatedRoute />,
    children: [
      { path: '/groups', element: <GroupsPage /> },
      { path: '/admin/users', element: <AdminUsersRoute /> },
      {
        path: '/groups/:groupId',
        element: <GroupLayout />,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          ...groupTabPaths().map((path) => ({
            path,
            element: groupChildPages[path],
          })),
        ],
      },
      { path: '*', element: <Navigate to="/groups" replace /> },
    ],
  },
]

// Native pure-rule tests import this module outside a browser; only the application needs a history router.
export const router =
  typeof window === 'undefined' ? undefined : createBrowserRouter(routes)
