// Exercises page event handlers with the existing TypeScript compiler and a small hook harness.
// Native pointer retargeting and browser layout still require a browser verification pass.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as groupRules from './group-view-rules.ts'
import * as groupsPageRules from './groups-page-rules.ts'
import * as balanceRules from '../balances/balances.ts'
import * as insightRules from '../insights/insights.ts'
import * as money from '../../lib/money.ts'
import * as names from '../../lib/names.ts'
import type { GroupDto, UserDto } from '../../api/contracts.ts'
import * as groupApi from './group-api.ts'
import { groupIconChoices } from './group-icon-choices.ts'
import * as memberSearchRules from './member-search-rules.ts'

type Node = { type: unknown; props: Record<string, any> }
const require = createRequire(import.meta.url)
const account: UserDto = {
  id: 'me',
  first_name: 'Alice',
  last_name: 'Example',
  display_name: 'Alice Example',
  email: 'alice@example.com',
  is_active: true,
  is_staff: false,
  is_superuser: false,
}
const julia: UserDto = {
  id: 'julia',
  first_name: 'Julia',
  last_name: 'Example',
  display_name: 'Julia Example',
  email: 'julia@example.com',
  is_active: true,
  is_staff: false,
  is_superuser: false,
}
const expense = {
  id: 'expense',
  title: 'Lunch',
  amount_cents: 1000,
  date: '2026-09-21',
  payer: 'me',
  deleted: false,
}
const group: GroupDto = {
  id: 'group',
  name: 'Trip',
  currency: 'EUR',
  icon: 'lucide:house',
  created_by: account.id,
  created_at: '2026-09-20T08:00:00.000Z',
  updated_at: '2026-09-20T08:00:00.000Z',
  archived_at: null,
  memberships: [
    {
      id: 'membership',
      user: account,
      role: 'admin',
      joined_at: '2026-09-20T08:00:00.000Z',
      left_at: null,
      is_active: true,
    },
    {
      id: 'julia-membership',
      user: julia,
      role: 'member',
      joined_at: '2026-09-20T08:05:00.000Z',
      left_at: null,
      is_active: true,
    },
  ],
}
const outgoingTransferExpense = {
  ...expense,
  payer: 'julia',
  amount_cents: 1250,
  shares: [{ user: 'me', amount_cents: 1250 }],
}
const incomingTransferExpense = {
  ...expense,
  payer: 'me',
  amount_cents: 1250,
  shares: [{ user: 'julia', amount_cents: 1250 }],
}

type PageHarnessOptions = {
  online?: boolean
  archived?: boolean
  session?: typeof account
  offlineCacheAvailable?: boolean
  cacheEpoch?: number
  isCacheEpochCurrent?: (epoch: number) => boolean
  syncReady?: boolean
  syncGroup?: (groupId: string) => Promise<unknown>
  registerGroup?: (groupId: string) => void
  unregisterGroup?: (groupId: string) => void
  fetchGroups?: typeof groupApi.fetchGroups
  fetchBalances?: typeof groupApi.fetchBalances
  moneyStore?: {
    getGroups?: () => Promise<(typeof group)[]>
    putGroups?: (rows: (typeof group)[]) => Promise<void>
    getGroup?: (groupId: string) => Promise<typeof group | undefined>
    getExpenses?: (groupId: string) => Promise<(typeof expense)[]>
    getSettlements?: (groupId: string) => Promise<unknown[]>
    close?: () => void
  }
}

/** Evaluates the actual page and hook handlers while replacing only their runtime boundaries. */
function pageHarness(
  file: string,
  initialStates: unknown[] = [],
  mobile = true,
  options: PageHarnessOptions = {},
) {
  const scopes = new Map<
    unknown,
    {
      states: any[]
      refs: any[]
      callbacks: { value: unknown; deps?: unknown[] }[]
      effects: { deps?: unknown[]; cleanup?: () => void }[]
    }
  >()
  let scope = {
    states: initialStates as any[],
    refs: [] as any[],
    callbacks: [] as { value: unknown; deps?: unknown[] }[],
    effects: [] as { deps?: unknown[]; cleanup?: () => void }[],
  }
  let stateIndex = 0
  let refIndex = 0
  let callbackIndex = 0
  let effectIndex = 0
  let pendingEffects: (() => void)[] = []
  let flushingEffects = false
  let effectStateUpdates = 0
  let headerAction: Node | null = null
  const navigator = { onLine: options.online ?? true }
  const listeners = new Map<string, () => void>()
  const resizeObservers = new Set<() => void>()
  const messages: { kind: string; message: string }[] = []
  let syncStatus = 'Synced'
  let localReads = 0
  let refreshes = 0
  const registeredGroups: string[] = []
  const syncedGroups: string[] = []
  const unregisteredGroups: string[] = []
  const toast = {
    error: (message: string) => messages.push({ kind: 'error', message }),
    success: (message: string) => messages.push({ kind: 'success', message }),
  }
  const store = {
    getGroups: async () => [],
    putGroups: async (_rows: (typeof group)[]) => undefined,
    getGroup: async (_groupId: string) => undefined,
    getExpenses: async (_groupId: string) => {
      localReads += 1
      return []
    },
    getSettlements: async (_groupId: string) => [],
    close() {},
    ...options.moneyStore,
  }
  const auth = {
    session: options.session ?? account,
    offlineCacheAvailable: options.offlineCacheAvailable ?? false,
    cacheEpoch: options.cacheEpoch ?? 0,
    isCacheEpochCurrent: options.isCacheEpochCurrent ?? (() => true),
  }
  const groupApiStubs = {
    ...groupApi,
    fetchGroups: options.fetchGroups ?? groupApi.fetchGroups,
    fetchBalances: options.fetchBalances ?? groupApi.fetchBalances,
  }
  function effect(callback: () => void | (() => void), deps?: unknown[]) {
    const index = effectIndex++
    const previous = scope.effects[index]
    if (
      previous &&
      deps?.every((value, i) => Object.is(value, previous.deps?.[i]))
    )
      return
    const record = { deps, cleanup: previous?.cleanup }
    scope.effects[index] = record
    pendingEffects.push(() => {
      record.cleanup?.()
      record.cleanup = callback() || undefined
    })
  }
  const react = {
    useState(initial: unknown) {
      const index = stateIndex++
      const states = scope.states
      if (!(index in states))
        states[index] = typeof initial === 'function' ? initial() : initial
      return [
        states[index],
        (value: unknown) => {
          if (flushingEffects) effectStateUpdates += 1
          states[index] =
            typeof value === 'function' ? value(states[index]) : value
        },
      ]
    },
    useRef(initial: unknown) {
      const index = refIndex++
      return (scope.refs[index] ??= { current: initial })
    },
    useEffect: effect,
    useLayoutEffect: effect,
    useMemo: (callback: () => unknown) => callback(),
    useCallback(callback: unknown, deps?: unknown[]) {
      const index = callbackIndex++
      const previous = scope.callbacks[index]
      if (
        previous &&
        deps?.every((value, dependencyIndex) =>
          Object.is(value, previous.deps?.[dependencyIndex]),
        )
      )
        return previous.value
      scope.callbacks[index] = { value: callback, deps }
      return callback
    },
  }
  const stubs: Record<string, unknown> = {
    react,
    '../../app/providers.tsx': {
      useAuth: () => auth,
      useSyncActions: () => ({
        ready: options.syncReady ?? false,
        enqueue: async () => 0,
        syncGroup: async (groupId: string) => {
          syncedGroups.push(groupId)
          return options.syncGroup?.(groupId) ?? 'Synced'
        },
        registerGroup: (groupId: string) => {
          registeredGroups.push(groupId)
          options.registerGroup?.(groupId)
        },
        unregisterGroup: (groupId: string) => {
          unregisteredGroups.push(groupId)
          options.unregisterGroup?.(groupId)
        },
      }),
      useSyncStatus: () => syncStatus,
    },
    '../feedback/ToastProvider.tsx': { useToast: () => toast },
    '../feedback/api-feedback.ts': { toastMessage: () => undefined },
    './group-context.ts': {
      useGroup: () => ({
        group: {
          ...group,
          archived_at: options.archived ? '2026-09-22' : null,
        },
        refresh: async () => {
          refreshes++
        },
        setHeaderAction: (action: Node | null) => {
          headerAction = action
        },
      }),
    },
    '../groups/group-context.ts': {
      useGroup: () => ({
        group,
        setHeaderAction: (action: Node | null) => {
          headerAction = action
        },
      }),
    },
    './group-view-rules.ts': groupRules,
    './groups-page-rules.ts': groupsPageRules,
    '../groups/groups-page-rules.ts': groupsPageRules,
    '../groups/group-view-rules.ts': groupRules,
    './balances.ts': balanceRules,
    '../balances/balances.ts': balanceRules,
    './insights.ts': insightRules,
    '../../lib/money.ts': money,
    '../../lib/names.ts': names,
    './group-api.ts': groupApiStubs,
    './group-icon-choices.ts': { groupIconChoices },
    './member-search-rules.ts': memberSearchRules,
    '../sync/database.ts': { openMoneyStore: async () => store },
    'react-router-dom': { useNavigate: () => () => {}, Link: 'a' },
  }
  /** Transpiles TSX without introducing a separate renderer or compiler dependency. */
  function load(path: URL): Record<string, any> {
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText
    const exports = {}
    runInNewContext(compiled, {
      exports,
      navigator,
      ResizeObserver: class {
        constructor(callback: () => void) {
          this.callback = callback
          resizeObservers.add(callback)
        }
        callback: () => void
        observe() {}
        disconnect() {
          resizeObservers.delete(this.callback)
        }
      },
      window: {
        matchMedia: () => ({ matches: mobile }),
        addEventListener: (name: string, callback: () => void) =>
          listeners.set(name, callback),
        removeEventListener: (name: string) => listeners.delete(name),
      },
      require: (name: string) => {
        if (name in stubs) return stubs[name]
        if (name === './swipe-reveal.ts') return load(new URL(name, path))
        if (name === 'react/jsx-runtime' || name === 'lucide-react')
          return require(name)
        return new Proxy(
          {},
          {
            get: (_target, key) =>
              key === '__esModule' ? true : () => undefined,
          },
        )
      },
    })
    return exports
  }
  const component = Object.values(load(new URL(file, import.meta.url)))[0]
  scopes.set(component, scope)
  return {
    render(child?: Node): Node {
      const target = child?.type ?? component
      scope = scopes.get(target) ?? {
        states: [],
        refs: [],
        callbacks: [],
        effects: [],
      }
      scopes.set(target, scope)
      stateIndex = 0
      refIndex = 0
      callbackIndex = 0
      effectIndex = 0
      pendingEffects = []
      return (target as (props?: unknown) => Node)(child?.props)
    },
    flushEffects() {
      const effects = pendingEffects
      pendingEffects = []
      effectStateUpdates = 0
      flushingEffects = true
      try {
        effects.forEach((run) => run())
      } finally {
        flushingEffects = false
      }
      return effectStateUpdates
    },
    setOnline(online: boolean) {
      navigator.onLine = online
      listeners.get(online ? 'online' : 'offline')?.()
    },
    resize() {
      resizeObservers.forEach((callback) => callback())
    },
    setSyncStatus(next: string) {
      syncStatus = next
    },
    get localReads() {
      return localReads
    },
    messages,
    get headerAction() {
      return headerAction
    },
    get refreshes() {
      return refreshes
    },
    get registeredGroups() {
      return registeredGroups
    },
    get syncedGroups() {
      return syncedGroups
    },
    get unregisteredGroups() {
      return unregisteredGroups
    },
  }
}

test('a non-member system admin cannot open money actions', () => {
  const systemAdmin = { ...account, id: 'system-admin' }
  for (const [file, label] of [
    ['./OverviewPage.tsx', 'Add expense'],
    ['../expenses/ExpensesPage.tsx', 'Add expense'],
    ['../balances/BalancesPage.tsx', 'Record payment'],
  ] as const) {
    const page = pageHarness(file, [], true, { session: systemAdmin })
    page.render()
    page.flushEffects()
    assert.equal(
      page.headerAction,
      null,
      `${label} must not appear in the desktop header`,
    )
    assert.equal(
      nodes(page.render()).some((node) => node.props['aria-label'] === label),
      false,
      `${label} must not appear on mobile`,
    )
  }
})

test('group money pages load cached rows while a sync is still running', async () => {
  for (const file of [
    './OverviewPage.tsx',
    '../expenses/ExpensesPage.tsx',
    '../balances/BalancesPage.tsx',
    '../insights/InsightsPage.tsx',
  ]) {
    const page = pageHarness(file)
    page.setSyncStatus('Syncing')
    page.render()
    page.flushEffects()
    await new Promise(setImmediate)
    assert.equal(
      page.localReads,
      1,
      `${file} must read local rows during Syncing`,
    )
  }
})

test('Expenses reloads local rows when an initial group sync finishes', async () => {
  const page = pageHarness('../expenses/ExpensesPage.tsx')
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  assert.equal(page.localReads, 1)
  page.setSyncStatus('Syncing')
  page.render()
  page.flushEffects()
  page.setSyncStatus('Synced')
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  assert.equal(page.localReads, 3)
})

test('Groups renders cached groups before fetchGroups resolves', async () => {
  const cachedGroup = { ...group, id: 'cached', name: 'Cabin' }
  const page = pageHarness('./GroupsPage.tsx', [], true, {
    offlineCacheAvailable: true,
    cacheEpoch: 1,
    fetchGroups: () => new Promise(() => undefined),
    fetchBalances: async () => ({ balances: [] }),
    moneyStore: { getGroups: async () => [cachedGroup] },
  })

  page.render()
  page.flushEffects()
  await new Promise(setImmediate)

  assert.ok(
    nodes(page.render()).some((node) => node.props.group?.name === 'Cabin'),
  )
})

test('Groups registers and syncs every listed group once sync becomes ready', async () => {
  const firstGroup = { ...group, id: 'alpha', name: 'Alpha' }
  const secondGroup = { ...group, id: 'bravo', name: 'Bravo' }
  const page = pageHarness('./GroupsPage.tsx', [], true, {
    syncReady: true,
    fetchGroups: async () => [firstGroup, secondGroup],
    fetchBalances: async () => ({ balances: [] }),
  })

  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  page.render()
  page.flushEffects()

  assert.deepEqual(page.registeredGroups, ['alpha', 'bravo'])
  assert.deepEqual(page.syncedGroups, ['alpha', 'bravo'])

  page.render()
  page.flushEffects()

  assert.deepEqual(page.registeredGroups, ['alpha', 'bravo'])
  assert.deepEqual(page.syncedGroups, ['alpha', 'bravo'])
})

test('resolved list pages avoid local state updates from post-render row animation bookkeeping', async () => {
  const groupsPage = pageHarness('./GroupsPage.tsx', [], true, {
    fetchGroups: async () => [group],
    fetchBalances: async () => ({ balances: [] }),
  })

  groupsPage.render()
  groupsPage.flushEffects()
  await new Promise(setImmediate)
  groupsPage.render()
  assert.equal(groupsPage.flushEffects(), 0)

  const expensesPage = pageHarness('../expenses/ExpensesPage.tsx', [], true, {
    moneyStore: {
      getExpenses: async () => [{ ...expense }],
      getSettlements: async () => [],
    },
  })

  expensesPage.render()
  expensesPage.flushEffects()
  await new Promise(setImmediate)
  expensesPage.render()
  assert.equal(expensesPage.flushEffects(), 0)
})

test('Groups and Expenses keep new-row tracking render-time and ref-based', () => {
  const groupsPage = readFileSync(
    new URL('./GroupsPage.tsx', import.meta.url),
    'utf8',
  )
  const expensesPage = readFileSync(
    new URL('../expenses/ExpensesPage.tsx', import.meta.url),
    'utf8',
  )
  const rules = readFileSync(
    new URL('./groups-page-rules.ts', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(rules, /consumeNewRowIds/)
  assert.match(
    groupsPage,
    /newRowIds\(\s*seenIdsRef\.current,\s*list\.groups,\s*initialPaintDoneRef\.current,?\s*\)/,
  )
  assert.match(groupsPage, /const seenIdsRef = useRef\(new Set<string>\(\)\)/)
  assert.match(
    expensesPage,
    /newRowIds\(\s*seenExpenseIdsRef\.current,\s*visibleExpenses,\s*initialExpensePaintDoneRef\.current,?\s*\)/,
  )
  assert.match(
    expensesPage,
    /const seenExpenseIdsRef = useRef\(new Set<string>\(\)\)/,
  )
})

test('balance and latest-activity lists use the shared half-second entry motion', () => {
  const overview = readFileSync(
    new URL('./OverviewPage.tsx', import.meta.url),
    'utf8',
  )
  const balancesPage = readFileSync(
    new URL('../balances/BalancesPage.tsx', import.meta.url),
    'utf8',
  )
  const styles = readFileSync(
    new URL('../../styles/index.css', import.meta.url),
    'utf8',
  )

  assert.match(overview, /list-enter[\s\S]*Settle up/)
  assert.match(overview, /list-enter[\s\S]*Latest activity/)
  assert.match(balancesPage, /list-enter[\s\S]*Suggested transfers/)
  assert.ok((balancesPage.match(/list-enter/g) ?? []).length >= 2)
  assert.match(
    styles,
    /\.list-enter\s*\{\s*animation: list-enter 500ms ease-out both;/,
  )
})

test('Overview animates settle-up and activity headings with their lists', () => {
  const source = readFileSync(
    new URL('./OverviewPage.tsx', import.meta.url),
    'utf8',
  )
  assert.match(
    source,
    /initialListLoadComplete && \(\s*<div className="list-enter grid content-start gap-3">[\s\S]*Settle up/,
  )
  assert.match(
    source,
    /initialListLoadComplete && \(\s*<div className="list-enter">[\s\S]*Latest activity/,
  )
})

test('local list pages stay empty until their first read resolves, then use the shared entry motion', () => {
  for (const file of [
    './OverviewPage.tsx',
    '../expenses/ExpensesPage.tsx',
    '../balances/BalancesPage.tsx',
    '../insights/InsightsPage.tsx',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.match(
      source,
      /\[initialListLoadComplete, setInitialListLoadComplete\] = useState\(false\)/,
    )
    assert.match(source, /initialListLoadComplete &&/)
  }

  const settings = readFileSync(
    new URL('./SettingsPage.tsx', import.meta.url),
    'utf8',
  )
  assert.match(
    settings,
    /<ul className="list-enter divide-y divide-border border-t border-border">/,
  )
})

test('Expenses animates the Settlements heading with its resolved content', () => {
  const source = readFileSync(
    new URL('../expenses/ExpensesPage.tsx', import.meta.url),
    'utf8',
  )
  assert.match(
    source,
    /initialListLoadComplete && \(\s*<div className="list-enter">\s*<h3 className="mb-3 text-lg font-bold">Settlements<\/h3>/,
  )
})

test('empty data states share the dashed neutral card treatment', () => {
  const sources = [
    ['./OverviewPage.tsx', ['You are all settled.', 'No local activity yet.']],
    [
      '../expenses/ExpensesPage.tsx',
      ['No expenses yet.', 'No settlements yet.'],
    ],
    ['../balances/BalancesPage.tsx', ['Everyone is settled.']],
    [
      './GroupsPage.tsx',
      ['Create your first group to start splitting expenses.'],
    ],
    ['../insights/InsightsPage.tsx', ['No expenses to analyse yet.']],
  ] as const

  for (const [file, messages] of sources) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    for (const message of messages) {
      if (file === './GroupsPage.tsx') {
        assert.match(source, /groupListEntryClass\(/)
        assert.match(
          source,
          new RegExp(`empty-state[\\s\\S]*${message.replaceAll('.', '\\.')}`),
        )
        continue
      }
      assert.match(
        source,
        new RegExp(
          `(?:empty-state list-enter|list-enter[\\s\\S]*empty-state)[\\s\\S]*${message.replaceAll('.', '\\.')}`,
        ),
      )
    }
  }

  const styles = readFileSync(
    new URL('../../styles/index.css', import.meta.url),
    'utf8',
  )
  assert.match(
    styles,
    /\.empty-state\s*\{\s*@apply rounded-xl border border-dashed border-border p-5 text-muted;\s*\}/,
  )
})

/** Finds rendered elements without executing child components outside the page under test. */
function nodes(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(nodes)
  if (!root || typeof root !== 'object' || !('props' in root)) return []
  const node = root as Node
  return [node, ...nodes(node.props.children)]
}

/** Flattens actual JSX text, including text split across interpolated child arrays. */
function content(root: unknown): string {
  if (Array.isArray(root)) return root.map(content).join('')
  if (typeof root === 'string' || typeof root === 'number') return String(root)
  return root && typeof root === 'object' && 'props' in root
    ? content((root as Node).props.children)
    : ''
}

for (const key of ['Enter', ' ']) {
  test(`desktop Delete ${JSON.stringify(key)} keeps the editor closed and opens confirmation`, () => {
    const page = pageHarness('../expenses/ExpensesPage.tsx', [
      null,
      null,
      [expense],
      [],
      undefined,
      false,
      undefined,
      false,
      20,
      true,
    ])
    let tree = nodes(page.render())
    const row = tree.find((node) => node.props['aria-label'] === 'Edit Lunch')!
    const button = nodes(row).find(
      (node) => node.props['aria-label'] === 'Delete Lunch',
    )!
    const target = { closest: () => target }
    let prevented = false
    row.props.onKeyDown({
      key,
      target,
      currentTarget: {},
      preventDefault() {
        prevented = true
      },
    })
    assert.equal(
      prevented,
      false,
      'row must preserve native button keyboard activation',
    )
    button.props.onClick({ stopPropagation() {} })
    tree = nodes(page.render())
    assert.equal(
      tree.find((node) => 'onRequestDelete' in node.props)!.props.open,
      false,
    )
    assert.equal(
      tree.find((node) => node.props.title === 'Delete expense')!.props.open,
      true,
    )
  })
}

test('desktop Delete mouse pointer does not get captured by the row', () => {
  const page = pageHarness('../expenses/ExpensesPage.tsx', [
    null,
    null,
    [expense],
    [],
    undefined,
    false,
    undefined,
    false,
    20,
    true,
  ])
  const row = nodes(page.render()).find(
    (node) => node.props['aria-label'] === 'Edit Lunch',
  )!
  const target = { closest: () => target }
  let captured = false
  row.props.onPointerDown({
    pointerType: 'mouse',
    target,
    currentTarget: {
      setPointerCapture() {
        captured = true
      },
    },
  })
  assert.equal(captured, false)
  row.props.onClick({ target, currentTarget: {} })
  assert.equal(
    nodes(page.render()).find((node) => 'onRequestDelete' in node.props)!.props
      .open,
    false,
  )
  nodes(row)
    .find((node) => node.props['aria-label'] === 'Delete Lunch')!
    .props.onClick({ stopPropagation() {} })
  assert.equal(
    nodes(page.render()).find((node) => node.props.title === 'Delete expense')!
      .props.open,
    true,
  )
})

test('only phone touch swipes capture the row and suppress the following edit click', () => {
  for (const mobile of [true, false]) {
    const page = pageHarness(
      '../expenses/ExpensesPage.tsx',
      [null, null, [expense], [], undefined, false, undefined, false, 20, true],
      mobile,
    )
    const row = nodes(page.render()).find(
      (node) => node.props['aria-label'] === 'Edit Lunch',
    )!
    let captured = false
    const target = {
      closest: () => target,
      setPointerCapture() {
        captured = true
      },
      hasPointerCapture: () => captured,
      releasePointerCapture() {
        captured = false
      },
      getBoundingClientRect: () => ({ width: 320 }),
    }
    const event = {
      pointerType: 'touch',
      pointerId: 1,
      clientX: 280,
      target,
      currentTarget: target,
    }
    row.props.onPointerDown(event)
    assert.equal(captured, mobile)
    row.props.onPointerUp({ ...event, clientX: 100 })
    assert.equal(captured, false)
    assert.equal(
      nodes(page.render()).find(
        (node) => node.type === 'li' && 'data-revealed' in node.props,
      )!.props['data-revealed'],
      mobile,
    )
    row.props.onClick(event)
    assert.equal(
      nodes(page.render()).find((node) => 'onRequestDelete' in node.props)!
        .props.open,
      !mobile,
    )
  }
})

test('a row keyboard activation still opens the editor', () => {
  const page = pageHarness('../expenses/ExpensesPage.tsx', [
    null,
    null,
    [expense],
    [],
    undefined,
    false,
    undefined,
    false,
    20,
    true,
  ])
  const row = nodes(page.render()).find(
    (node) => node.props['aria-label'] === 'Edit Lunch',
  )!
  const target = { closest: () => target }
  row.props.onKeyDown({
    key: 'Enter',
    target,
    currentTarget: target,
    preventDefault() {},
  })
  assert.equal(
    nodes(page.render()).find((node) => 'onRequestDelete' in node.props)!.props
      .open,
    true,
  )
})

test('Overview opens the shared-header Expense action', () => {
  const page = pageHarness('./OverviewPage.tsx')
  page.render()
  page.flushEffects()
  assert.equal(page.headerAction?.props['aria-label'], 'Add expense')
  page.headerAction!.props.onClick()
  assert.equal(
    nodes(page.render()).find(
      (node) =>
        node.props.groupId === group.id && !('initialFrom' in node.props),
    )!.props.open,
    true,
  )
})

test('Overview opens outgoing suggested payments with their prefilled values', () => {
  const page = pageHarness('./OverviewPage.tsx', [
    [outgoingTransferExpense],
    [],
    false,
    false,
    undefined,
    true,
  ])
  const action = nodes(page.render()).find(
    (node) => node.props['aria-label'] === 'Pay Julia',
  )
  assert.ok(action, 'outgoing payment must be a labelled action')
  assert.ok(
    content(action).includes('Suggested payment'),
    'outgoing payment needs its clarifying label',
  )
  action.props.onClick()
  const dialog = nodes(page.render()).find(
    (node) => node.props.groupId === group.id && node.props.open,
  )!
  assert.equal(dialog.props.initialFrom, 'me')
  assert.equal(dialog.props.initialTo, 'julia')
  assert.equal(dialog.props.initialAmountCents, 1250)
})

test('Overview omits incoming suggested-payment text and its action', () => {
  const page = pageHarness('./OverviewPage.tsx', [
    [incomingTransferExpense],
    [],
    false,
    false,
    undefined,
    true,
  ])
  const tree = nodes(page.render())
  assert.equal(
    tree.some((node) => content(node).includes('Julia pays You')),
    false,
  )
  assert.equal(
    tree.some((node) => node.props['aria-label'] === 'Pay You'),
    false,
  )
})

test('Balances opens only outgoing suggested payments with their prefilled values', () => {
  const page = pageHarness('../balances/BalancesPage.tsx', [
    [outgoingTransferExpense],
    [],
    false,
    undefined,
    true,
  ])
  page.render()
  page.flushEffects()
  assert.equal(page.headerAction?.props['aria-label'], 'Record payment')
  const action = nodes(page.render()).find(
    (node) => node.props['aria-label'] === 'Pay Julia',
  )
  assert.ok(action, 'outgoing payment must be a labelled action')
  action.props.onClick()
  const dialog = nodes(page.render()).find(
    (node) => node.props.groupId === group.id && node.props.open,
  )!
  assert.equal(dialog.props.initialFrom, 'me')
  assert.equal(dialog.props.initialTo, 'julia')
  assert.equal(dialog.props.initialAmountCents, 1250)
})

test('Balances leaves incoming suggested payments informational', () => {
  const page = pageHarness('../balances/BalancesPage.tsx', [
    [incomingTransferExpense],
    [],
    false,
    undefined,
    true,
  ])
  const row = nodes(page.render()).find(
    (node) => node.type === 'li' && content(node).includes('Julia pays You'),
  )
  assert.ok(row, 'the incoming suggested transfer must be visible')
  assert.equal(
    nodes(row).some(
      (node) =>
        node.type === 'button' ||
        node.props.role === 'button' ||
        node.props.onClick ||
        node.props.onKeyDown ||
        node.props.tabIndex !== undefined,
    ),
    false,
  )
})

test('Settings keeps suggestions when whitespace leaves the effective search unchanged', () => {
  const candidate = {
    ...account,
    id: 'candidate',
    email: 'available@example.com',
  }
  const page = pageHarness('./SettingsPage.tsx', [
    { groupId: 'group', sourceName: 'Trip', value: 'Trip' },
    false,
    'av',
    [candidate],
    false,
    'av',
    candidate,
  ])
  const input = nodes(page.render()).find(
    (node) => node.type === 'input' && node.props.type === 'email',
  )!
  input.props.onChange({ target: { value: 'av ' } })
  let tree = nodes(page.render())
  assert.ok(
    tree.some((node) => node.props.children === 'available@example.com'),
  )
  assert.ok(tree.some((node) => node.props.children === 'Add member'))
  tree
    .find((node) => node.type === 'input' && node.props.type === 'email')!
    .props.onChange({ target: { value: 'other' } })
  tree = nodes(page.render())
  assert.ok(
    !tree.some((node) => node.props.children === 'available@example.com'),
  )
  assert.ok(!tree.some((node) => node.props.children === 'Add member'))
})

test('Settings does not reload member suggestions when a longer query keeps the same accounts', async (t) => {
  const candidate = {
    ...account,
    id: 'candidate',
    email: 'available@example.com',
  }
  const requests: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url)
    return Response.json([candidate])
  })
  const page = pageHarness('./SettingsPage.tsx')
  const typeEmail = (value: string) => {
    nodes(page.render())
      .find((node) => node.type === 'input' && node.props.type === 'email')!
      .props.onChange({ target: { value } })
    page.render()
    page.flushEffects()
  }
  typeEmail('av')
  await new Promise(setImmediate)
  assert.deepEqual(requests, ['/api/groups/group/members/search/?email=av'])
  typeEmail('ava')
  await new Promise(setImmediate)
  assert.deepEqual(requests, ['/api/groups/group/members/search/?email=av'])
  assert.ok(
    nodes(page.render()).some(
      (node) => node.props.children === 'available@example.com',
    ),
  )
})

test('Settings keeps the missing-account message when a longer query still has no matches', async (t) => {
  const requests: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url)
    return Response.json([])
  })
  const page = pageHarness('./SettingsPage.tsx')
  const typeEmail = (value: string) => {
    nodes(page.render())
      .find((node) => node.type === 'input' && node.props.type === 'email')!
      .props.onChange({ target: { value } })
    page.render()
    page.flushEffects()
  }
  typeEmail('xy')
  await new Promise(setImmediate)
  page.render()
  assert.deepEqual(requests, ['/api/groups/group/members/search/?email=xy'])
  assert.ok(
    nodes(page.render()).some(
      (node) => content(node) === 'No active account found.',
    ),
  )
  typeEmail('xyz')
  await new Promise(setImmediate)
  assert.deepEqual(requests, ['/api/groups/group/members/search/?email=xy'])
  assert.ok(
    nodes(page.render()).some(
      (node) => content(node) === 'No active account found.',
    ),
  )
})

test('Settings does not reload the missing-account message when characters are deleted', async (t) => {
  const requests: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url)
    return Response.json([])
  })
  const page = pageHarness('./SettingsPage.tsx')
  const typeEmail = (value: string) => {
    nodes(page.render())
      .find((node) => node.type === 'input' && node.props.type === 'email')!
      .props.onChange({ target: { value } })
    page.render()
    page.flushEffects()
  }
  typeEmail('xy')
  await new Promise(setImmediate)
  typeEmail('xyz')
  await new Promise(setImmediate)
  typeEmail('xy')
  await new Promise(setImmediate)
  assert.deepEqual(requests, ['/api/groups/group/members/search/?email=xy'])
  assert.ok(
    nodes(page.render()).some(
      (node) => content(node) === 'No active account found.',
    ),
  )
})

test('Settings waits for a connection before member search and resumes the same query online', async (t) => {
  const requests: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url)
    return Response.json([])
  })
  const page = pageHarness(
    './SettingsPage.tsx',
    [{ groupId: 'group', sourceName: 'Trip', value: 'Trip' }, false, 'av'],
    true,
    { online: false },
  )
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  assert.deepEqual(requests, [])
  assert.ok(
    nodes(page.render()).some(
      (node) =>
        node.props.role === 'status' &&
        /internet connection/.test(content(node)),
    ),
  )
  page.setOnline(true)
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  assert.deepEqual(requests, ['/api/groups/group/members/search/?email=av'])
  assert.equal(page.messages.length, 0)
  page.setOnline(false)
  const input = nodes(page.render()).find(
    (node) => node.type === 'input' && node.props.type === 'email',
  )!
  input.props.onChange({ target: { value: 'ava' } })
  page.render()
  page.flushEffects()
  await new Promise(setImmediate)
  assert.equal(requests.length, 1)
})

for (const online of [false, true]) {
  for (const [action, path, method, body, archived] of [
    [
      'Rename',
      '/api/groups/group/',
      'PATCH',
      { name: 'New trip', icon: 'lucide:house' },
      false,
    ],
    ['Archive', '/api/groups/group/archive/', 'POST', undefined, false],
    ['Unarchive', '/api/groups/group/unarchive/', 'POST', undefined, true],
    ['Delete group', '/api/groups/group/', 'DELETE', undefined, true],
    ['Leave group', '/api/groups/group/leave/', 'POST', undefined, false],
    [
      'Add member',
      '/api/groups/group/members/',
      'POST',
      { email: 'available@example.com' },
      false,
    ],
    [
      'Remove member',
      '/api/groups/group/members/julia/remove/',
      'POST',
      undefined,
      false,
    ],
  ] as const) {
    test(`Settings ${action} ${online ? 'keeps its server write and refresh online' : 'does not request or refresh offline'}`, async (t) => {
      const requests: { url: string; method: string; body?: unknown }[] = []
      t.mock.method(
        globalThis,
        'fetch',
        async (url: string, init: RequestInit) => {
          requests.push({
            url,
            method: init.method ?? 'GET',
            body: init.body ? JSON.parse(String(init.body)) : undefined,
          })
          return new Response(null, { status: 204 })
        },
      )
      const candidate = {
        ...account,
        id: 'candidate',
        email: 'available@example.com',
      }
      const page = pageHarness(
        './SettingsPage.tsx',
        [
          { groupId: 'group', sourceName: 'Trip', value: 'New trip' },
          false,
          '',
          [],
          false,
          '',
          candidate,
          {},
          group.memberships[1],
        ],
        true,
        { online, archived },
      )
      const tree = nodes(page.render())
      if (action === 'Rename')
        tree
          .find((node) => node.type === 'form')!
          .props.onSubmit({ preventDefault() {} })
      else if (action === 'Remove member')
        tree.find((node) => node.props.title === action)!.props.onConfirm()
      else {
        const button = tree.find(
          (node) => node.props.onClick && content(node) === action,
        )!
        assert.ok(button, `${action} action must exist`)
        button.props.onClick()
        if (
          action === 'Archive' ||
          action === 'Delete group' ||
          action === 'Leave group'
        ) {
          assert.deepEqual(requests, [], `${action} must wait for confirmation`)
          const title = action === 'Archive' ? 'Archive group' : action
          const dialog = nodes(page.render()).find(
            (node) => node.props.title === title,
          )!
          assert.equal(dialog.props.open, true)
          dialog.props.onConfirm()
        }
      }
      await new Promise(setImmediate)
      assert.deepEqual(
        requests,
        online
          ? [
              { url: '/api/config/public/', method: 'GET', body: undefined },
              { url: path, method, body },
            ]
          : [],
      )
      assert.equal(page.refreshes, online ? 1 : 0)
      assert.equal(page.messages.length, 1)
      assert.equal(page.messages[0].kind, online ? 'success' : 'error')
      if (!online) assert.match(page.messages[0].message, /internet connection/)
    })
  }
}

test('Settings blocks an already rendered online action if connectivity drops before the click', async (t) => {
  const requests: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url)
    return new Response(null, { status: 204 })
  })
  const page = pageHarness('./SettingsPage.tsx')
  const action = nodes(page.render()).find(
    (node) => node.props.onClick && content(node) === 'Archive',
  )!
  page.setOnline(false)
  action.props.onClick()
  assert.deepEqual(requests, [])
  const dialog = nodes(page.render()).find(
    (node) => node.props.title === 'Archive group',
  )!
  assert.equal(dialog.props.open, true)
  dialog.props.onConfirm()
  await new Promise(setImmediate)
  assert.deepEqual(requests, [])
  assert.equal(page.messages[0].kind, 'error')
  assert.match(page.messages[0].message, /internet connection/)
})
