// Renders LoginPage through the same hook harness as other pages so resume, sign-out, and auth toasts run without a browser.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { ApiError } from '../../api/client.ts'
import type { UserDto } from '../../api/contracts.ts'

type Node = { type: unknown; props: Record<string, any> }
const require = createRequire(import.meta.url)
const cachedUser: UserDto = {
  id: 'u1',
  email: 'alex@example.com',
  first_name: 'Alex',
  last_name: 'Example',
  display_name: 'Alex Example',
  is_active: true,
  is_staff: false,
  is_superuser: false,
}

type LoginHarness = ReturnType<typeof loginHarness>

/** Renders the real login page with auth, storage, and navigation replaced at the boundary. */
function loginHarness(
  options: {
    online?: boolean
    cachedUser?: UserDto | null
    getPublicConfig?: () => Promise<{ ALLOW_SELF_REGISTRATION: boolean }>
    login?: () => Promise<UserDto>
    cachedSessionAllowed?: boolean
    signOutOnDevice?: () => Promise<void>
    pending?: number
    storePending?: number
    pendingCountError?: Error
  } = {},
) {
  const states: unknown[] = []
  const refs: { current: unknown }[] = []
  const effects: { deps?: unknown[]; cleanup?: () => void }[] = []
  let stateIndex = 0
  let refIndex = 0
  let effectIndex = 0
  let pendingEffects: (() => void)[] = []
  const navigations: string[] = []
  const messages: { kind: string; message: string }[] = []
  let logins = 0
  let continues = 0
  let deviceSignOuts = 0
  const storeOpens: unknown[] = []
  const navigator = { onLine: options.online ?? true }
  const listeners = new Map<string, Set<() => void>>()
  const toast = {
    error: (message: string) => messages.push({ kind: 'error', message }),
    success: (message: string) => messages.push({ kind: 'success', message }),
  }
  function effect(callback: () => void | (() => void), deps?: unknown[]) {
    const index = effectIndex++
    const previous = effects[index]
    if (
      previous &&
      deps &&
      previous.deps &&
      deps.length === previous.deps.length &&
      deps.every((value, i) => Object.is(value, previous.deps?.[i]))
    )
      return
    const record = { deps, cleanup: previous?.cleanup }
    effects[index] = record
    pendingEffects.push(() => {
      record.cleanup?.()
      record.cleanup = callback() || undefined
    })
  }
  const react = {
    useState(initial: unknown) {
      const index = stateIndex++
      if (!(index in states))
        states[index] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
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
    useRef(initial: unknown) {
      const index = refIndex++
      return (refs[index] ??= { current: initial })
    },
    useEffect: effect,
  }
  const compiled = ts.transpileModule(
    readFileSync(new URL('./LoginPage.tsx', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText
  const exports: Record<string, () => Node> = {}
  const jsx = (type: unknown, props: Record<string, unknown>) => ({
    type,
    props,
  })
  const stubs: Record<string, unknown> = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-router-dom': {
      useNavigate: () => (path: string) => navigations.push(path),
    },
    '../../app/providers.tsx': {
      useAuth: () => ({
        cachedSessionAllowed: options.cachedSessionAllowed ?? true,
        login: async () => {
          logins += 1
          return options.login ? options.login() : cachedUser
        },
        continueCachedSession: async () => {
          continues += 1
          return cachedUser
        },
        signOutOnDevice: async () => {
          deviceSignOuts += 1
          await options.signOutOnDevice?.()
        },
        pendingChanges: async () => options.pending ?? 0,
      }),
    },
    '../../components/ConfirmDialog.tsx': {
      ConfirmDialog: ({
        open,
        title,
        question,
        confirmLabel,
        onCancel,
        onConfirm,
      }: {
        open: boolean
        title: string
        question: string
        confirmLabel: string
        onCancel: () => void
        onConfirm: () => void
      }) =>
        open
          ? jsx('confirm-dialog', {
              children: [
                jsx('h2', { children: title }),
                jsx('p', { children: question }),
                jsx('button', {
                  type: 'button',
                  onClick: onCancel,
                  children: 'Cancel',
                }),
                jsx('button', {
                  type: 'button',
                  onClick: onConfirm,
                  children: confirmLabel,
                }),
              ],
            })
          : null,
    },
    '../feedback/ToastProvider.tsx': { useToast: () => toast },
    './auth-api.ts': {
      getPublicConfig:
        options.getPublicConfig ??
        (async () => ({ ALLOW_SELF_REGISTRATION: false })),
      register: async () => undefined,
    },
    'lucide-react': {
      LogIn: () => null,
      LogOut: () => null,
    },
    '../sync/database.ts': {
      openMoneyStore: async (storeOptions?: {
        allowDuringTransition?: boolean
      }) => {
        storeOpens.push(storeOptions)
        return {
          getCachedSession: async () => options.cachedUser ?? null,
          pendingCount: async () => {
            if (options.pendingCountError) throw options.pendingCountError
            return options.storePending ?? 0
          },
          close() {},
        }
      },
    },
  }
  runInNewContext(compiled, {
    exports,
    navigator,
    window: {
      addEventListener(name: string, callback: () => void) {
        const set = listeners.get(name) ?? new Set<() => void>()
        set.add(callback)
        listeners.set(name, set)
      },
      removeEventListener(name: string, callback: () => void) {
        listeners.get(name)?.delete(callback)
      },
    },
    require: (name: string) => stubs[name] ?? require(name),
  })
  return {
    render(): Node {
      stateIndex = 0
      refIndex = 0
      effectIndex = 0
      pendingEffects = []
      return exports.LoginPage()
    },
    flushEffects() {
      const queued = pendingEffects
      pendingEffects = []
      queued.forEach((run) => run())
    },
    setOnline(online: boolean) {
      navigator.onLine = online
      listeners
        .get(online ? 'online' : 'offline')
        ?.forEach((callback) => callback())
    },
    navigations,
    messages,
    get logins() {
      return logins
    },
    get continues() {
      return continues
    },
    get deviceSignOuts() {
      return deviceSignOuts
    },
    storeOpens,
  }
}

/** Returns the children a node would paint, including function components the fake renderer does not call. */
function painted(node: Node): unknown {
  return typeof node.type === 'function'
    ? node.type(node.props)
    : node.props.children
}

/** Returns every JSX node in a rendered child tree. */
function nodes(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(nodes)
  if (!root || typeof root !== 'object' || !('props' in root)) return []
  const node = root as Node
  return [node, ...nodes(painted(node))]
}

/** Flattens rendered JSX content for instruction-level assertions. */
function content(root: unknown): string {
  if (Array.isArray(root)) return root.map(content).join('')
  if (typeof root === 'string' || typeof root === 'number') return String(root)
  return root && typeof root === 'object' && 'props' in root
    ? content(painted(root as Node))
    : ''
}

/** Lets mount effects finish reading the cache and public config. */
async function shown(page: LoginHarness): Promise<Node> {
  page.render()
  page.flushEffects()
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
  return page.render()
}

/** Lets async click handlers finish their state updates before the next assertion. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

test('reads the cached session while the money-store epoch is still disabled', async () => {
  const page = loginHarness({ online: false, cachedUser })
  await shown(page)
  assert.equal(page.storeOpens.length, 1)
  assert.equal(
    (page.storeOpens[0] as { allowDuringTransition?: boolean } | undefined)
      ?.allowDuringTransition,
    true,
  )
})

test('offers a cached account even when the browser has a network but the server is unreachable', async () => {
  const offline = content(
    await shown(loginHarness({ online: false, cachedUser })),
  )
  assert.match(offline, /split that money/)
  assert.match(offline, /Welcome back/)
  assert.match(offline, /You're offline\. Your groups stay on this device\./)
  assert.match(offline, /AE/)
  assert.match(offline, /Alex Example/)
  assert.match(offline, /alex@example.com/)
  assert.match(offline, /Continue/)
  assert.match(offline, /Sign out/)
  assert.equal(offline.includes('Saved account'), false)
  assert.equal(offline.includes('Sign in'), false)

  const online = content(
    await shown(loginHarness({ online: true, cachedUser })),
  )
  assert.equal(online.includes('Sign in'), false)
  assert.match(online, /Saved account/)
  assert.match(online, /Continue/)
  assert.match(online, /Sign out/)
  assert.equal(online.includes("You're offline."), false)
})

test('continue restores the cached session and leaves login', async () => {
  const page = loginHarness({ online: false, cachedUser })
  const button = nodes(await shown(page)).find(
    (node) => node.type === 'button' && content(node) === 'Continue',
  )
  assert.ok(button)
  await button.props.onClick()
  assert.equal(page.continues, 1)
  assert.deepEqual(page.navigations, ['/groups'])
})

test('device sign-out drops the resume card and shows the password form', async () => {
  const page = loginHarness({ online: false, cachedUser })
  const signOut = nodes(await shown(page)).find(
    (node) =>
      node.type === 'button' && content(node) === 'Sign out',
  )
  assert.ok(signOut)
  assert.match(String(signOut.props.className), /text-danger/)
  await signOut.props.onClick()
  const confirm = nodes(page.render()).find(
    (node) =>
      node.type === 'button' &&
      content(node) === 'Sign out' &&
      node.props.children === 'Sign out',
  )
  assert.ok(confirm)
  await confirm.props.onClick()
  await settle()
  const text = content(page.render())
  assert.match(text, /Sign in/)
  assert.equal(
    text.includes("You're offline. Your groups stay on this device."),
    false,
  )
  assert.equal(page.deviceSignOuts, 1)
})

test('prefills the cached email in the password form after device sign-out', async () => {
  const page = loginHarness({
    online: true,
    cachedUser,
    pendingCountError: new Error('pending count failed'),
  })
  const signOut = nodes(await shown(page)).find(
    (node) => node.type === 'button' && content(node) === 'Sign out',
  )
  assert.ok(signOut)
  await signOut.props.onClick()
  const confirm = nodes(page.render()).find(
    (node) =>
      node.type === 'button' &&
      content(node) === 'Sign out' &&
      node.props.children === 'Sign out',
  )
  assert.ok(confirm)
  await confirm.props.onClick()
  await settle()
  const email = nodes(page.render()).find(
    (node) => node.type === 'input' && node.props.type === 'email',
  )
  assert.ok(email)
  assert.equal(email.props.value, cachedUser.email)
})

test('sign out on this device asks for confirmation naming pending changes', async () => {
  const page = loginHarness({
    online: false,
    cachedUser,
    pending: 2,
    storePending: 0,
  })
  const signOut = nodes(await shown(page)).find(
    (node) => node.type === 'button' && content(node) === 'Sign out',
  )
  assert.ok(signOut)
  await signOut.props.onClick()
  assert.equal(page.deviceSignOuts, 0)
  const confirm = page.render()
  assert.match(content(confirm), /Sign out on this device\?/)
  assert.match(
    content(confirm),
    /2 unsynced changes will be deleted\. This cannot be undone\./,
  )
  const confirmButton = nodes(confirm).find(
    (node) =>
      node.type === 'button' &&
      content(node) === 'Sign out' &&
      node.props.children === 'Sign out',
  )
  assert.ok(confirmButton)
  await confirmButton.props.onClick()
  assert.equal(page.deviceSignOuts, 1)
})

test('a signed-out device never offers its stale cached identity', async () => {
  const page = loginHarness({
    online: false,
    cachedUser,
    cachedSessionAllowed: false,
  })
  const text = content(await shown(page))
  assert.equal(text.includes('Continue'), false)
  assert.equal(text.includes('alex@example.com'), false)
  assert.match(text, /Sign in/)
})

test('a storage-clear failure is reported without an unhandled sign-out rejection', async () => {
  const page = loginHarness({
    online: false,
    cachedUser,
    signOutOnDevice: async () => {
      throw new Error('Storage write failed')
    },
  })
  const button = nodes(await shown(page)).find(
    (node) => node.type === 'button' && content(node) === 'Sign out',
  )
  assert.ok(button)
  await button.props.onClick()
  const confirm = nodes(page.render()).find(
    (node) =>
      node.type === 'button' &&
      content(node) === 'Sign out' &&
      node.props.children === 'Sign out',
  )
  assert.ok(confirm)
  await confirm.props.onClick()
  await settle()
  assert.equal(page.messages.length, 1)
  assert.equal(page.messages[0].kind, 'error')
})

test('coming back online keeps the saved account without the password form', async () => {
  const page = loginHarness({ online: false, cachedUser })
  assert.match(content(await shown(page)), /Continue/)
  page.setOnline(true)
  const text = content(page.render())
  assert.match(text, /Continue/)
  assert.equal(text.includes('Sign in'), false)
})

test('offline sign-in asks for a connection and does not call login', async () => {
  const page = loginHarness({ online: false })
  const form = nodes(await shown(page)).find((node) => node.type === 'form')
  assert.ok(form)
  await form.props.onSubmit({ preventDefault() {} })
  assert.equal(page.logins, 0)
  assert.deepEqual(page.messages, [
    { kind: 'error', message: 'You need a connection to sign in.' },
  ])
})

test('public config transport failure does not toast', async () => {
  const page = loginHarness({
    getPublicConfig: () => Promise.reject(new TypeError('Failed to fetch')),
  })
  await shown(page)
  assert.deepEqual(page.messages, [])
})

test('public config server errors still toast', async () => {
  const page = loginHarness({
    getPublicConfig: () =>
      Promise.reject(
        new ApiError(500, 'server_error', 'Something went wrong.'),
      ),
  })
  await shown(page)
  assert.deepEqual(page.messages, [
    { kind: 'error', message: 'Something went wrong.' },
  ])
})

test('online sign-in uses the connection message when the request never reaches the server', async () => {
  const page = loginHarness({
    online: true,
    login: () => Promise.reject(new TypeError('Failed to fetch')),
  })
  const form = nodes(await shown(page)).find((node) => node.type === 'form')
  assert.ok(form)
  await form.props.onSubmit({ preventDefault() {} })
  assert.equal(page.logins, 1)
  assert.deepEqual(page.messages, [
    { kind: 'error', message: 'You need a connection to sign in.' },
  ])
})

test('online sign-in keeps field errors inline and server errors in a toast', async () => {
  const fieldPage = loginHarness({
    online: true,
    login: () =>
      Promise.reject(
        new ApiError(400, 'invalid', 'Invalid.', {
          email: ['Enter a valid email address.'],
        }),
      ),
  })
  const fieldForm = nodes(await shown(fieldPage)).find(
    (node) => node.type === 'form',
  )
  assert.ok(fieldForm)
  await fieldForm.props.onSubmit({ preventDefault() {} })
  assert.deepEqual(fieldPage.messages, [])
  assert.match(content(fieldPage.render()), /Enter a valid email address\./)

  const serverPage = loginHarness({
    online: true,
    login: () =>
      Promise.reject(
        new ApiError(500, 'server_error', 'Something went wrong.'),
      ),
  })
  const serverForm = nodes(await shown(serverPage)).find(
    (node) => node.type === 'form',
  )
  assert.ok(serverForm)
  await serverForm.props.onSubmit({ preventDefault() {} })
  assert.deepEqual(serverPage.messages, [
    { kind: 'error', message: 'Something went wrong.' },
  ])
})
