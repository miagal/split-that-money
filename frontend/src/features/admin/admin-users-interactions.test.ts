// Exercises the actual admin page and modal handlers with a small stateful JSX harness.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import type { UserDto } from '../../api/contracts.ts'
import * as api from './admin-user-api.ts'
import * as feedback from '../feedback/api-feedback.ts'

type Node = { type: unknown; props: Record<string, any> }
type Request = { url: string; method: string; body?: unknown }
const require = createRequire(import.meta.url)
const activeUser: UserDto = {
  id: 'active',
  email: 'person@example.com',
  first_name: 'Person',
  last_name: 'Example',
  display_name: 'Person Example',
  is_active: true,
  is_staff: false,
  is_superuser: false,
}
const inactiveUser: UserDto = {
  id: 'inactive',
  email: 'former@example.com',
  first_name: 'Former',
  last_name: 'User',
  display_name: 'Former User',
  is_active: false,
  is_staff: false,
  is_superuser: false,
}

/** Runs real page and modal functions while simulating React's state and effect slots. */
function adminUsersHarness(
  users: UserDto[] = [],
  failure?: { url: string; fields?: Record<string, string[]> },
) {
  const scopes = new Map<
    unknown,
    { states: unknown[]; effects: { deps?: unknown[] }[] }
  >()
  let scope = { states: [] as unknown[], effects: [] as { deps?: unknown[] }[] }
  let stateIndex = 0
  let effectIndex = 0
  let pendingEffects: (() => void)[] = []
  const requests: Request[] = []
  const messages: { kind: string; message: string }[] = []
  const toast = {
    success: (message: string) => messages.push({ kind: 'success', message }),
    error: (message: string) => messages.push({ kind: 'error', message }),
  }
  const react = {
    useState(initial: unknown) {
      const index = stateIndex++
      const states = scope.states
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
    useEffect(callback: () => void, deps?: unknown[]) {
      const index = effectIndex++
      const previous = scope.effects[index]
      if (
        previous &&
        deps?.every((value, i) => Object.is(value, previous.deps?.[i]))
      )
        return
      scope.effects[index] = { deps }
      pendingEffects.push(callback)
    },
    useCallback: (callback: unknown) => callback,
  }
  const stubs: Record<string, unknown> = {
    react,
    '../../app/providers.tsx': { useAuth: () => ({ session: activeUser }) },
    '../feedback/ToastProvider.tsx': { useToast: () => toast },
    '../feedback/api-feedback.ts': feedback,
    './admin-user-api.ts': api,
    '../../components/Button.tsx': { Button: 'Button' },
    '../../components/Dialog.tsx': { Dialog: 'Dialog' },
    '../../components/ConfirmDialog.tsx': { ConfirmDialog: 'ConfirmDialog' },
    'react-router-dom': { Link: 'Link' },
    '../expenses/swipe-reveal.ts': {
      isNestedInteractiveTarget: () => false,
      useSwipeReveal: () => ({
        revealedId: null,
        dragOffset: () => 0,
        close: () => undefined,
        consumeActivation: () => false,
        onPointerDown: () => () => undefined,
        onPointerMove: () => () => undefined,
        onPointerUp: () => () => undefined,
        onPointerCancel: () => undefined,
      }),
    },
    '../groups/group-view-rules.ts': { desktopSidebarClass: () => '' },
  }
  /** Compiles the real TSX without a rendering dependency. */
  function load(path: URL): Record<string, any> {
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText
    const exports: Record<string, any> = {}
    runInNewContext(compiled, {
      exports,
      require: (name: string) => {
        if (name in stubs) return stubs[name]
        if (name === './AdminUserDialog.tsx') return load(new URL(name, path))
        if (name === 'react/jsx-runtime' || name === 'lucide-react')
          return require(name)
        throw new Error(`Unexpected dependency: ${name}`)
      },
    })
    return exports
  }
  const page = load(
    new URL('./AdminUsersPage.tsx', import.meta.url),
  ).AdminUsersPage
  scopes.set(page, scope)
  return {
    render(child?: Node): Node {
      const target = child?.type ?? page
      scope = scopes.get(target) ?? { states: [], effects: [] }
      scopes.set(target, scope)
      stateIndex = 0
      effectIndex = 0
      pendingEffects = []
      return (target as (props?: unknown) => Node)(child?.props)
    },
    flushEffects() {
      const effects = pendingEffects
      pendingEffects = []
      effects.forEach((run) => run())
    },
    requests,
    messages,
    fetch: async (url: string, init: RequestInit = {}) => {
      if (url === '/api/config/public/')
        return Response.json({ ALLOW_SELF_REGISTRATION: false })
      const method = init.method ?? 'GET'
      requests.push({
        url,
        method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (failure?.url === url)
        return Response.json(
          {
            code: 'invalid',
            message: 'Invalid request.',
            fields: failure.fields,
          },
          { status: 400 },
        )
      return method === 'GET'
        ? Response.json(users)
        : new Response(null, { status: 204 })
    },
  }
}

/** Finds actual JSX elements without executing their child components. */
function nodes(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(nodes)
  if (!root || typeof root !== 'object' || !('props' in root)) return []
  const node = root as Node
  return [node, ...nodes(node.props.children)]
}

/** Flattens visible JSX text for observable copy assertions. */
function content(root: unknown): string {
  if (Array.isArray(root)) return root.map(content).join('')
  if (typeof root === 'string' || typeof root === 'number') return String(root)
  return root && typeof root === 'object' && 'props' in root
    ? content((root as Node).props.children)
    : ''
}

test('Add user opens an empty form and Save creates the account', async (t) => {
  const page = adminUsersHarness()
  t.mock.method(globalThis, 'fetch', page.fetch)
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  nodes(page.render())
    .find((node) => node.props['aria-label'] === 'Add user')!
    .props.onClick()
  const dialog = nodes(page.render()).find((node) => 'onSave' in node.props)!
  assert.equal(dialog.props.open, true)
  assert.equal(dialog.props.user, null)
  assert.equal(
    nodes(page.render(dialog)).find((node) => node.props.title === 'Add user')
      ?.props.open,
    true,
  )
  await dialog.props.onSave({
    email: 'new@example.com',
    first_name: 'New',
    last_name: 'User',
    password: 'secret123',
  })
  assert.deepEqual(
    page.requests.find((request) => request.method === 'POST'),
    {
      url: '/api/admin/users/',
      method: 'POST',
      body: {
        email: 'new@example.com',
        first_name: 'New',
        last_name: 'User',
        password: 'secret123',
      },
    },
  )
  assert.equal(
    page.requests.filter((request) => request.method === 'GET').length,
    2,
  )
})

test('editing sends profile fields and resets password only when typed', async (t) => {
  const page = adminUsersHarness([activeUser])
  t.mock.method(globalThis, 'fetch', page.fetch)
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  nodes(page.render())
    .find((node) => node.props['aria-label'] === 'Edit Person Example')!
    .props.onClick()
  const dialog = nodes(page.render()).find((node) => 'onSave' in node.props)!
  assert.equal(
    nodes(page.render(dialog)).find((node) => node.props.title === 'Edit user')
      ?.props.open,
    true,
  )
  await dialog.props.onSave({
    email: 'person@example.com',
    first_name: 'Person',
    last_name: 'Example',
    password: '',
  })
  assert.equal(
    page.requests.filter((request) => request.url.endsWith('/reset-password/'))
      .length,
    0,
  )
  await dialog.props.onSave({
    email: 'person@example.com',
    first_name: 'Person',
    last_name: 'Example',
    password: 'new-password',
  })
  assert.deepEqual(
    page.requests.filter((request) => request.url.endsWith('/reset-password/')),
    [
      {
        url: '/api/admin/users/active/reset-password/',
        method: 'POST',
        body: { password: 'new-password' },
      },
    ],
  )
  assert.ok(
    page.requests
      .filter((request) => request.method === 'PATCH')
      .every((request) => !('password' in (request.body as object))),
  )
})

test('deactivate waits for confirmation and reactivate writes directly', async (t) => {
  const page = adminUsersHarness([activeUser, inactiveUser])
  t.mock.method(globalThis, 'fetch', page.fetch)
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  nodes(page.render())
    .find((node) => node.props['aria-label'] === 'Deactivate Person Example')!
    .props.onClick({ stopPropagation() {} })
  assert.equal(
    page.requests.filter((request) => request.method !== 'GET').length,
    0,
  )
  const confirm = nodes(page.render()).find(
    (node) => node.props.title === 'Deactivate user',
  )!
  assert.equal(confirm.props.open, true)
  confirm.props.onConfirm()
  await new Promise(setImmediate)
  assert.ok(
    page.requests.some(
      (request) => request.url === '/api/admin/users/active/deactivate/',
    ),
  )
  nodes(page.render())
    .find((node) => node.props['aria-label'] === 'Reactivate Former User')!
    .props.onClick({ stopPropagation() {} })
  await new Promise(setImmediate)
  assert.ok(
    page.requests.some(
      (request) => request.url === '/api/admin/users/inactive/reactivate/',
    ),
  )
})

test('the shared modal requires a new password and keeps the edit placeholder empty', async (t) => {
  const page = adminUsersHarness([activeUser])
  t.mock.method(globalThis, 'fetch', page.fetch)
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  nodes(page.render())
    .find((node) => node.props['aria-label'] === 'Add user')!
    .props.onClick()
  let dialog = nodes(page.render()).find((node) => 'onSave' in node.props)!
  page.render(dialog)
  page.flushEffects()
  let form = nodes(page.render(dialog)).find((node) => node.type === 'form')!
  assert.ok(
    nodes(form)
      .filter((node) => node.type === 'input')
      .every((node) => node.props.value === ''),
  )
  assert.equal(
    nodes(form).find((node) => node.props.type === 'password')!.props.required,
    true,
  )
  await form.props.onSubmit({ preventDefault() {} })
  assert.equal(
    page.requests.filter((request) => request.method !== 'GET').length,
    0,
  )
  dialog.props.onClose()
  nodes(page.render())
    .find((node) => node.props['aria-label'] === 'Edit Person Example')!
    .props.onClick()
  dialog = nodes(page.render()).find((node) => 'onSave' in node.props)!
  page.render(dialog)
  page.flushEffects()
  form = nodes(page.render(dialog)).find((node) => node.type === 'form')!
  const password = nodes(form).find((node) => node.props.type === 'password')!
  assert.equal(password.props.value, '')
  assert.equal(password.props.placeholder, '••••••••')
  assert.equal(password.props.required, false)
  assert.equal(
    nodes(form).find((node) => node.props.autoComplete === 'given-name')?.props
      .value,
    'Person',
  )
})

test('API field errors appear in the form', async (t) => {
  const page = adminUsersHarness([], {
    url: '/api/admin/users/',
    fields: { email: ['Already registered.'] },
  })
  t.mock.method(globalThis, 'fetch', page.fetch)
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  nodes(page.render())
    .find((node) => node.props['aria-label'] === 'Add user')!
    .props.onClick()
  const dialog = nodes(page.render()).find((node) => 'onSave' in node.props)!
  page.render(dialog)
  page.flushEffects()
  const fields = nodes(page.render(dialog)).filter(
    (node) => node.type === 'input',
  )
  for (const [type, value] of [
    ['email', 'taken@example.com'],
    ['text', 'New'],
    ['password', 'secret123'],
  ])
    fields
      .find((node) => node.props.type === type)!
      .props.onChange({ target: { value } })
  await nodes(page.render(dialog))
    .find((node) => node.type === 'form')!
    .props.onSubmit({ preventDefault() {} })
  assert.ok(
    nodes(page.render(dialog)).some(
      (node) => content(node) === 'Already registered.',
    ),
  )
})

test('status API failures use a toast and keep the confirmation open', async (t) => {
  const page = adminUsersHarness([activeUser], {
    url: '/api/admin/users/active/deactivate/',
  })
  t.mock.method(globalThis, 'fetch', page.fetch)
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  nodes(page.render())
    .find((node) => node.props['aria-label'] === 'Deactivate Person Example')!
    .props.onClick()
  nodes(page.render())
    .find((node) => node.props.title === 'Deactivate user')!
    .props.onConfirm()
  await new Promise(setImmediate)
  assert.equal(page.messages.at(-1)?.kind, 'error')
  assert.equal(
    nodes(page.render()).find((node) => node.props.title === 'Deactivate user')
      ?.props.open,
    true,
  )
})
