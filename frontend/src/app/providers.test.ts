// Exercises session boot, menu logout, and device sign-out through the real auth provider.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test, { type TestContext } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import type { UserDto } from '../api/contracts.ts'

const require = createRequire(import.meta.url)
const user: UserDto = {
  id: 'u1',
  email: 'alex@example.com',
  first_name: 'Alex',
  last_name: 'Example',
  display_name: 'Alex Example',
  is_active: true,
  is_staff: false,
  is_superuser: false,
}
type AuthValue = {
  session: UserDto | null | undefined
  bootError: boolean
  sessionExpired: boolean
  offlineCacheAvailable: boolean
  cachedSessionAllowed: boolean
  sessionExpiredNoticeSeen: boolean
  leaveToLogin(): void
  continueCachedSession(): Promise<UserDto>
  signOutOnDevice(): Promise<void>
  dismissSessionExpiredNotice(): void
  markSessionExpired(): void
  login(credentials: { email: string; password: string }): Promise<UserDto>
  logout(): Promise<void>
}
type Element = {
  type: (props: { children: unknown }) => Element
  props: { children: Element; value: AuthValue }
}
type Hook = { value?: unknown; deps?: unknown[]; cleanup?: () => void }

/** Replaces only browser storage, API calls, and IndexedDB I/O while running the real auth provider. */
function authHarness(
  t: TestContext,
  options: {
    getSession: () => Promise<UserDto | null>
    cachedUser?: UserDto | null
    failClear?: boolean
    loginUser?: UserDto
    logout?: () => Promise<void>
    pendingCount?: () => Promise<number>
  },
) {
  const values = new Map<string, string>()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  let cachedUser = options.cachedUser ?? null
  const outbox = [{ entityId: 'offline-expense', sync_status: 'pending' }]
  const hooks: Hook[] = []
  let hookIndex = 0
  let pendingEffects: (() => void)[] = []
  const listeners = new Map<string, Set<() => void>>()
  const react = {
    StrictMode: 'StrictMode',
    createContext: () => ({}),
    useState(initial: unknown) {
      const index = hookIndex++
      if (!hooks[index])
        hooks[index] = {
          value: typeof initial === 'function' ? initial() : initial,
        }
      return [
        hooks[index].value,
        (value: unknown) => {
          hooks[index].value =
            typeof value === 'function' ? value(hooks[index].value) : value
        },
      ]
    },
    useRef(initial: unknown) {
      const index = hookIndex++
      hooks[index] ??= { value: { current: initial } }
      return hooks[index].value
    },
    useCallback(callback: unknown, deps: unknown[]) {
      const index = hookIndex++
      if (
        !hooks[index] ||
        deps.some(
          (value, position) => !Object.is(value, hooks[index].deps?.[position]),
        )
      )
        hooks[index] = { value: callback, deps }
      return hooks[index].value
    },
    useEffect(callback: () => void | (() => void), deps: unknown[]) {
      const index = hookIndex++
      const previous = hooks[index]
      if (
        previous &&
        deps.every((value, position) =>
          Object.is(value, previous.deps?.[position]),
        )
      )
        return
      hooks[index] = { deps }
      pendingEffects.push(() => {
        previous?.cleanup?.()
        hooks[index].cleanup = callback() || undefined
      })
    },
  }
  const jsx = (type: unknown, props: unknown) => ({ type, props })
  const exports: {
    AppProviders?: (props: { children: null }) => Element
    idleSyncSnapshotOf?: () => { status: string; pending: number }
  } = {}
  const navigator = { onLine: true }
  const database = require('../features/sync/database.ts')
  const store = {
    getCachedSession: async () => cachedUser,
    setCachedSession: async (value: UserDto) => {
      cachedUser = value
    },
    clearAccountData: async () => {
      if (options.failClear) throw new Error('Storage write failed')
      cachedUser = null
      outbox.length = 0
    },
    pendingCount: options.pendingCount ?? (async () => outbox.length),
    close() {},
  }
  const stubs: Record<string, unknown> = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '../features/feedback/ToastProvider.tsx': {
      ToastProvider: 'ToastProvider',
    },
    '../features/auth/auth-api.ts': {
      getSession: options.getSession,
      getPublicConfig: async () => ({
        ALLOW_SELF_REGISTRATION: true,
        SHELL_NETWORK_TIMEOUT_SECONDS: 3,
        SYNC_REQUEST_TIMEOUT_SECONDS: 8,
      }),
      login: async () => options.loginUser ?? user,
      logout: options.logout ?? (async () => undefined),
    },
    '../features/sync/database.ts': {
      ...database,
      openMoneyStore: async () => store,
    },
  }
  const source = readFileSync(
    new URL('./providers.tsx', import.meta.url),
    'utf8',
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  runInNewContext(compiled, {
    exports,
    navigator,
    window: {
      addEventListener(name: string, callback: () => void) {
        const callbacks = listeners.get(name) ?? new Set<() => void>()
        callbacks.add(callback)
        listeners.set(name, callbacks)
      },
      removeEventListener(name: string, callback: () => void) {
        listeners.get(name)?.delete(callback)
      },
    },
    require: (name: string) => stubs[name] ?? require(name),
  })
  const provider = exports.AppProviders!({ children: null }).props.children
    .props.children.type
  function render(): AuthValue {
    hookIndex = 0
    return provider({ children: null }).props.value
  }
  return {
    render,
    async settle(): Promise<AuthValue> {
      render()
      const effects = pendingEffects
      pendingEffects = []
      effects.forEach((effect) => effect())
      for (let turn = 0; turn < 16; turn += 1) await Promise.resolve()
      return render()
    },
    dispatch(name: string) {
      listeners.get(name)?.forEach((listener) => listener())
    },
    coldBoot() {
      hooks.length = 0
      pendingEffects = []
      listeners.clear()
    },
    get cachedUser() {
      return cachedUser
    },
    idleSyncSnapshotOf: exports.idleSyncSnapshotOf!,
    navigator,
    outbox,
  }
}

test('a cached account opens immediately and stays when the server is unreachable', async (t) => {
  const page = authHarness(t, {
    getSession: () => new Promise(() => undefined),
    cachedUser: user,
  })
  const auth = await page.settle()
  assert.deepEqual(auth.session, user)
  assert.equal(auth.offlineCacheAvailable, true)
  assert.equal(auth.bootError, false)
})

test('an unclean exit does not lock the next offline start', async (t) => {
  const page = authHarness(t, {
    getSession: async () => {
      throw new TypeError('Failed to fetch')
    },
    cachedUser: user,
  })
  await page.settle()
  page.coldBoot()
  const auth = await page.settle()
  assert.deepEqual(auth.session, user)
  assert.equal(auth.bootError, false)
})

test('without a cached account an unreachable server shows the boot error', async (t) => {
  const page = authHarness(t, {
    getSession: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  assert.equal((await page.settle()).bootError, true)
})

test('an expired server session keeps the account and its pending changes', async (t) => {
  const page = authHarness(t, {
    getSession: async () => null,
    cachedUser: user,
  })
  const auth = await page.settle()
  assert.deepEqual(auth.session, user)
  assert.equal(auth.sessionExpired, true)
  assert.equal(page.outbox.length, 1)
  await auth.login({ email: user.email, password: 'test-password' })
  const signedIn = await page.settle()
  assert.equal(signedIn.sessionExpired, false)
  assert.equal(page.outbox.length, 1)
})

test('a different server user replaces the cached account', async (t) => {
  const otherUser = { ...user, id: 'u2', email: 'blair@example.com' }
  const page = authHarness(t, {
    getSession: async () => otherUser,
    cachedUser: user,
  })
  assert.deepEqual((await page.settle()).session, otherUser)
  assert.deepEqual(page.cachedUser, otherUser)
  assert.equal(page.outbox.length, 0)
})

test('menu logout keeps local data when the server is unreachable', async (t) => {
  const page = authHarness(t, {
    getSession: async () => user,
    cachedUser: user,
    logout: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  await page.settle()
  await page.render().logout()
  const auth = await page.settle()
  assert.equal(auth.session, null)
  assert.equal(auth.cachedSessionAllowed, true)
  assert.deepEqual(page.cachedUser, user)
})

test('menu logout keeps local data when logout is rejected', async (t) => {
  const page = authHarness(t, {
    getSession: async () => user,
    cachedUser: user,
    logout: async () => {
      throw new Error('Logout was not confirmed')
    },
  })
  page.outbox.length = 0
  await page.settle()
  await page.render().logout()
  const auth = await page.settle()
  assert.equal(auth.cachedSessionAllowed, true)
  assert.deepEqual(page.cachedUser, user)
})

test('menu logout keeps local data while changes are pending', async (t) => {
  const page = authHarness(t, {
    getSession: async () => user,
    cachedUser: user,
  })
  await page.settle()
  await page.render().logout()
  assert.equal((await page.settle()).cachedSessionAllowed, true)
  assert.equal(page.outbox.length, 1)
})

test('menu logout keeps local data when the pending count rejects', async (t) => {
  const page = authHarness(t, {
    getSession: async () => user,
    cachedUser: user,
    pendingCount: async () => {
      throw new Error('outbox unreadable')
    },
  })
  await page.settle()
  await page.render().logout()
  const auth = await page.settle()
  assert.equal(auth.session, null)
  assert.equal(auth.cachedSessionAllowed, true)
  assert.deepEqual(page.cachedUser, user)
})

test('menu logout clears local data once the server confirms and nothing is pending', async (t) => {
  const page = authHarness(t, {
    getSession: async () => user,
    cachedUser: user,
  })
  page.outbox.length = 0
  await page.settle()
  await page.render().logout()
  assert.equal((await page.settle()).cachedSessionAllowed, false)
  assert.equal(page.cachedUser, null)
})

test('continueCachedSession rejects when an interrupted start has no cached account', async (t) => {
  const page = authHarness(t, {
    getSession: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  const auth = await page.settle()
  assert.equal(auth.bootError, true)
  auth.leaveToLogin()
  await page.settle()
  await assert.rejects(page.render().continueCachedSession())
})

test('dismissing the expired-session notice stays seen on a later read', async (t) => {
  const page = authHarness(t, {
    getSession: async () => null,
    cachedUser: user,
  })
  const auth = await page.settle()
  assert.equal(auth.sessionExpiredNoticeSeen, false)
  auth.dismissSessionExpiredNotice()
  auth.leaveToLogin()
  assert.equal(page.render().sessionExpiredNoticeSeen, true)
})

test('device sign-out removes the cached identity and prevents offline continuation', async (t) => {
  const page = authHarness(t, {
    getSession: async () => null,
    cachedUser: user,
  })
  await page.settle()
  await page.render().signOutOnDevice()
  assert.equal(page.cachedUser, null)
  assert.equal(page.outbox.length, 0)
  await assert.rejects(page.render().continueCachedSession(), /signed out/)
})

test('device sign-out cannot revive the old identity when clearing IndexedDB fails', async (t) => {
  let sessionRequests = 0
  const page = authHarness(t, {
    getSession: async () => {
      sessionRequests += 1
      return user
    },
    cachedUser: user,
    failClear: true,
  })
  await page.settle()
  await assert.rejects(page.render().signOutOnDevice(), /Storage write failed/)
  await assert.rejects(page.render().continueCachedSession())
  assert.equal(page.render().session, null)
  assert.equal(page.render().offlineCacheAvailable, false)
  assert.equal(page.render().cachedSessionAllowed, false)
  page.coldBoot()
  assert.equal((await page.settle()).session, null)
  assert.equal(sessionRequests, 1)
  await assert.rejects(page.render().continueCachedSession(), /signed out/)
  await page.render().login({ email: user.email, password: 'test-password' })
  assert.equal((await page.settle()).cachedSessionAllowed, true)
  assert.equal(page.outbox.length, 1)
})

test('signing in as a different user clears the previous account outbox', async (t) => {
  const otherUser = { ...user, id: 'u2', email: 'blair@example.com' }
  const page = authHarness(t, {
    getSession: async () => user,
    cachedUser: user,
    loginUser: otherUser,
  })
  await page.settle()
  await page
    .render()
    .login({ email: otherUser.email, password: 'test-password' })
  assert.deepEqual((await page.settle()).session, otherUser)
  assert.deepEqual(page.cachedUser, otherUser)
  assert.equal(page.outbox.length, 0)
})

test('a signed-out device ignores an old server cookie until an explicit new login', async (t) => {
  let sessionRequests = 0
  const page = authHarness(t, {
    getSession: async () => {
      sessionRequests += 1
      return user
    },
    cachedUser: user,
  })
  localStorage.setItem(
    'split-that-money-device-sign-out',
    'signed-out:previous-document',
  )
  assert.equal((await page.settle()).session, null)
  assert.equal(sessionRequests, 0)
  assert.equal(page.render().cachedSessionAllowed, false)
  await assert.rejects(page.render().continueCachedSession(), /signed out/)
  await page.render().login({ email: user.email, password: 'test-password' })
  const signedIn = await page.settle()
  assert.equal(signedIn.offlineCacheAvailable, true)
  assert.equal(signedIn.cachedSessionAllowed, true)
  assert.deepEqual(signedIn.session, user)
  assert.equal(page.outbox.length, 1)
})

test('a sync that finds no session shows the expired state', async (t) => {
  const page = authHarness(t, {
    getSession: async () => user,
    cachedUser: user,
  })
  const value = await page.settle()
  assert.equal(value.sessionExpired, false)
  value.markSessionExpired()
  assert.equal(page.render().sessionExpired, true)
})

test('before the sync controller exists an offline browser shows the server as not reachable', (t) => {
  const page = authHarness(t, { getSession: async () => user })
  assert.equal(page.idleSyncSnapshotOf().status, 'Synced')
  assert.equal(page.idleSyncSnapshotOf(), page.idleSyncSnapshotOf())
  page.navigator.onLine = false
  assert.equal(page.idleSyncSnapshotOf().status, 'Server not reachable')
  assert.equal(page.idleSyncSnapshotOf(), page.idleSyncSnapshotOf())
})
