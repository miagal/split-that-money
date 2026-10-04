// Verifies a failed account load can return to login without wiping the device cache.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

type Node = { type: unknown; props: Record<string, unknown> }
const require = createRequire(import.meta.url)

/** Renders the route error screen with its auth and navigation dependencies represented as JSX nodes. */
function renderRouteBootError(
  leaveToLogin: () => void,
  navigate: (path: string, options: { replace: boolean }) => void,
): Node {
  const source = readFileSync(new URL('./router.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const exports: Record<string, (props: { onRetry: () => void }) => Node> = {}
  const jsx = (type: unknown, props: Record<string, unknown>) => ({
    type,
    props,
  })
  runInNewContext(compiled, {
    exports,
    require: (name: string) =>
      ({
        'react/jsx-runtime': { jsx, jsxs: jsx },
        'react-router-dom': {
          Navigate: 'Navigate',
          Outlet: 'Outlet',
          createBrowserRouter: () => undefined,
          useNavigate: () => navigate,
        },
        '../components/PullToReload.tsx': { PullToReload: 'PullToReload' },
        '../features/account/AccountMenu.tsx': { AccountMenu: 'AccountMenu' },
        '../features/auth/LoginPage.tsx': { LoginPage: 'LoginPage' },
        '../features/groups/GroupsPage.tsx': { GroupsPage: 'GroupsPage' },
        '../features/groups/GroupLayout.tsx': { GroupLayout: 'GroupLayout' },
        '../features/groups/OverviewPage.tsx': { OverviewPage: 'OverviewPage' },
        '../features/groups/SettingsPage.tsx': { SettingsPage: 'SettingsPage' },
        '../features/balances/BalancesPage.tsx': {
          BalancesPage: 'BalancesPage',
        },
        '../features/expenses/ExpensesPage.tsx': {
          ExpensesPage: 'ExpensesPage',
        },
        '../features/insights/InsightsPage.tsx': {
          InsightsPage: 'InsightsPage',
        },
        '../features/admin/AdminUsersPage.tsx': {
          AdminUsersPage: 'AdminUsersPage',
        },
        '../features/offline-setup/OfflineSetupPage.tsx': {
          OfflineSetupPage: 'OfflineSetupPage',
        },
        '../features/groups/group-view-rules.ts': { groupTabPaths: () => [] },
        './providers.tsx': { useAuth: () => ({ leaveToLogin }) },
        './router-rules.ts': {
          canAccessAdmin: () => false,
          nextPathForSession: () => '/login',
        },
      })[name] ?? require(name),
  })
  return exports.RouteBootError({ onRetry: () => undefined })
}

/** Returns every JSX node in a rendered child tree. */
function nodes(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(nodes)
  if (!root || typeof root !== 'object' || !('props' in root)) return []
  const node = root as Node
  return [node, ...nodes(node.props.children)]
}

/** Flattens JSX children into their visible text. */
function content(root: unknown): string {
  if (Array.isArray(root)) return root.map(content).join('')
  if (typeof root === 'string' || typeof root === 'number') return String(root)
  return root && typeof root === 'object' && 'props' in root
    ? content((root as Node).props.children)
    : ''
}

test('returns a failed account load to login without clearing the device cache', async () => {
  const calls: string[] = []
  const screen = renderRouteBootError(
    () => {
      calls.push('leaveToLogin')
    },
    (path, options) => {
      calls.push(`${path}:${options.replace}`)
    },
  )
  const loginButton = nodes(screen).find(
    (node) => content(node) === 'Go to login',
  )

  assert.ok(loginButton)
  await (loginButton.props.onClick as () => void | Promise<void>)()
  assert.equal(calls.join(','), 'leaveToLogin,/login:true')
})
