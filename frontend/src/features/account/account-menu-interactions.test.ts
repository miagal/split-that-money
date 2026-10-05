// Exercises the real account menu's role visibility and navigation through its JSX handlers.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as routeRules from '../../app/router-rules.ts'

type Node = { type: unknown; props: Record<string, any> }
const require = createRequire(import.meta.url)
const user = {
  id: 'user',
  email: 'user@example.com',
  first_name: 'Test',
  last_name: 'User',
  display_name: 'Test User',
  is_active: true,
  is_staff: false,
  is_superuser: false,
}

/** Runs the actual component with stateful hooks and records its navigation. */
function menuHarness(
  roles: Pick<typeof user, 'is_staff' | 'is_superuser'>,
  options: boolean | { online?: boolean; sessionExpired?: boolean } = {},
) {
  const { online, sessionExpired } =
    typeof options === 'boolean'
      ? { online: options, sessionExpired: false }
      : {
          online: options.online ?? true,
          sessionExpired: options.sessionExpired ?? false,
        }
  const states: unknown[] = []
  const navigations: string[] = []
  const authCalls: string[] = []
  let sessionExpiredNoticeSeen = false
  let stateIndex = 0
  const react = {
    useState(initial: unknown) {
      const index = stateIndex++
      if (!(index in states)) states[index] = initial
      return [
        states[index],
        (value: unknown) => {
          states[index] =
            typeof value === 'function'
              ? (value as (old: unknown) => unknown)(states[index])
              : value
        },
      ]
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useEffect: () => undefined,
  }
  const source = readFileSync(
    new URL('./AccountMenu.tsx', import.meta.url),
    'utf8',
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const exports: Record<string, any> = {}
  const stubs: Record<string, unknown> = {
    react,
    'lucide-react': {
      Check: 'check-icon',
      CloudOff: 'cloud-off-icon',
      LogOut: () => null,
      RefreshCw: 'refresh-icon',
      Settings: () => null,
      Skull: 'skull-icon',
      TriangleAlert: 'warning-icon',
      Upload: 'upload-icon',
    },
    'react-router-dom': {
      useNavigate: () => (path: string) => navigations.push(path),
    },
    '../../app/providers.tsx': {
      useAuth: () => ({
        sessionExpired,
        sessionExpiredNoticeSeen,
        dismissSessionExpiredNotice: () => {
          sessionExpiredNoticeSeen = true
        },
        logout: async () => {
          authCalls.push('logout')
        },
        leaveToLogin: () => {
          authCalls.push('leaveToLogin')
        },
      }),
      useSyncStatus: () => 'idle',
      useSyncPendingChanges: () => 0,
    },
    './account-menu-rules.ts': {
      syncPendingLabel: () => null,
      syncPresentation: () => ({
        icon: 'check',
        tone: 'success',
        label: 'Up to date',
      }),
    },
    './theme.ts': {
      useTheme: () => ({ theme: 'light', setTheme: () => undefined }),
    },
    '../../app/router-rules.ts': routeRules,
    '../../components/Button.tsx': { Button: 'button' },
    '../../components/Dialog.tsx': { Dialog: 'dialog' },
    '../../components/Switch.tsx': {
      Switch: (props: Record<string, unknown>) => ({ type: 'switch', props }),
    },
  }
  runInNewContext(compiled, {
    exports,
    navigator: { onLine: online },
    require: (name: string) => stubs[name] ?? require(name),
  })
  return {
    render(): Node {
      stateIndex = 0
      return exports.AccountMenu({ user: { ...user, ...roles } })
    },
    navigations,
    authCalls,
  }
}

/** Collects the actual rendered element tree without invoking child components. */
function nodes(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(nodes)
  if (!root || typeof root !== 'object' || !('props' in root)) return []
  const node = root as Node
  return [node, ...Object.values(node.props).flatMap(nodes)]
}

/** Flattens the rendered JSX text for a visible-label assertion. */
function content(root: unknown): string {
  if (Array.isArray(root)) return root.map(content).join('')
  if (typeof root === 'string' || typeof root === 'number') return String(root)
  return root && typeof root === 'object' && 'props' in root
    ? content((root as Node).props.children)
    : ''
}

test('staff users do not see User management while offline', () => {
  const menu = menuHarness({ is_staff: true, is_superuser: false }, false)
  nodes(menu.render())
    .find((node) => node.props['aria-label'] === 'Open account menu')!
    .props.onClick()
  assert.equal(
    nodes(menu.render()).some((node) => content(node) === 'User management'),
    false,
  )
})

test('ordinary users can open Offline setup while offline and close the menu', () => {
  const menu = menuHarness({ is_staff: false, is_superuser: false }, false)
  nodes(menu.render())
    .find((node) => node.props['aria-label'] === 'Open account menu')!
    .props.onClick()
  const offlineSetup = nodes(menu.render()).find(
    (node) => content(node) === 'Offline setup',
  )
  assert.ok(offlineSetup)
  offlineSetup.props.onClick()
  assert.deepEqual(menu.navigations, ['/offline_setup'])
  assert.equal(
    nodes(menu.render()).some((node) => content(node) === 'Offline setup'),
    false,
  )
})

test('Log out always delegates to the unified logout and opens login', async () => {
  for (const online of [false, true]) {
    const menu = menuHarness(
      { is_staff: false, is_superuser: false },
      { online },
    )
    nodes(menu.render())
      .find((node) => node.props['aria-label'] === 'Open account menu')!
      .props.onClick()
    const logOut = nodes(menu.render()).find(
      (node) => content(node) === 'Log out',
    )
    assert.ok(logOut)
    await logOut.props.onClick()
    assert.deepEqual(menu.authCalls, ['logout'])
    assert.deepEqual(menu.navigations, ['/login'])
  }
})

test('an expired session shows the skull badge, menu notice and a one-time modal', () => {
  const menu = menuHarness(
    { is_staff: false, is_superuser: false },
    { sessionExpired: true },
  )
  const skullBadge = nodes(menu.render()).find(
    (node) => node.props['aria-label'] === 'Session expired',
  )
  assert.ok(skullBadge)
  assert.match(String(skullBadge.props.className), /size-5/)
  assert.match(String(skullBadge.props.className), /-bottom-1/)
  assert.match(String(skullBadge.props.className), /-right-1/)
  assert.match(String(skullBadge.props.className), /rounded-full/)
  assert.ok(
    nodes(menu.render()).some(
      (node) =>
        node.props.title === 'Session expired' && node.props.open === true,
    ),
  )
  const expiredEmail = nodes(menu.render()).find(
    (node) => content(node) === user.email,
  )
  assert.ok(expiredEmail)
  assert.match(String(expiredEmail.props.className), /font-bold/)
  nodes(menu.render())
    .find((node) => node.props['aria-label'] === 'Open account menu')!
    .props.onClick()
  const openMenu = nodes(menu.render())
  assert.equal(
    openMenu.some((node) => content(node) === 'Sync status'),
    false,
  )
  const expiredPill = openMenu.find(
    (node) =>
      content(node) === 'Session expired' &&
      String(node.props.className ?? '').includes('rounded-full'),
  )
  assert.ok(expiredPill)
  assert.match(String(expiredPill.props.className), /text-danger/)
  const expiredRow = openMenu.find(
    (node) =>
      String(node.props.className ?? '').includes('justify-start') &&
      nodes(node).includes(expiredPill),
  )
  assert.ok(expiredRow)
  const later = nodes(menu.render()).find((node) => content(node) === 'Later')
  assert.ok(later)
  later.props.onClick()
  assert.equal(
    nodes(menu.render()).some(
      (node) =>
        node.props.title === 'Session expired' && node.props.open === true,
    ),
    false,
  )
  assert.equal(
    nodes(menu.render()).some(
      (node) =>
        node.props.title === 'Session expired' && node.props.open === true,
    ),
    false,
  )
})

test('Re-login from the expired notice leaves to login', () => {
  const menu = menuHarness(
    { is_staff: false, is_superuser: false },
    { sessionExpired: true },
  )
  const reLogin = nodes(menu.render()).find(
    (node) => content(node) === 'Re-login',
  )
  assert.ok(reLogin)
  reLogin.props.onClick()
  assert.deepEqual(menu.authCalls, ['leaveToLogin'])
  assert.deepEqual(menu.navigations, ['/login'])
})

test('an expired session replaces Log out with Re-login', async () => {
  const menu = menuHarness(
    { is_staff: false, is_superuser: false },
    { sessionExpired: true },
  )
  nodes(menu.render())
    .find((node) => content(node) === 'Later')!
    .props.onClick()
  nodes(menu.render())
    .find((node) => node.props['aria-label'] === 'Open account menu')!
    .props.onClick()
  const rendered = nodes(menu.render())
  assert.equal(
    rendered.some((node) => content(node) === 'Log out'),
    false,
  )
  const reLogin = rendered.find(
    (node) =>
      node.type === 'button' &&
      content(node) === 'Re-login' &&
      String(node.props.className ?? '').includes('border-t'),
  )
  assert.ok(reLogin)
  await reLogin.props.onClick()
  assert.deepEqual(menu.authCalls, ['leaveToLogin'])
  assert.deepEqual(menu.navigations, ['/login'])
})

for (const [role, roles, visible] of [
  ['ordinary user', { is_staff: false, is_superuser: false }, false],
  ['staff user', { is_staff: true, is_superuser: false }, true],
  ['superuser', { is_staff: false, is_superuser: true }, true],
] as const) {
  test(`${role} ${visible ? 'sees' : 'does not see'} User management in the open account menu`, () => {
    const menu = menuHarness(roles)
    nodes(menu.render())
      .find((node) => node.props['aria-label'] === 'Open account menu')!
      .props.onClick()
    const buttons = nodes(menu.render()).filter(
      (node) => node.type === 'button',
    )
    assert.equal(
      buttons.some((button) => content(button) === 'User management'),
      visible,
    )
    if (visible) {
      buttons
        .find((button) => content(button) === 'User management')!
        .props.onClick()
      assert.deepEqual(menu.navigations, ['/admin/users'])
      assert.equal(
        nodes(menu.render()).some(
          (node) => content(node) === 'User management',
        ),
        false,
      )
    }
  })
}
