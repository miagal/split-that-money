// Verifies the mobile route back to the user's group overview from offline setup.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

type Node = { type: unknown; props: Record<string, unknown> }
const require = createRequire(import.meta.url)

/** Renders the real page with navigation and icon dependencies represented as JSX nodes. */
function renderOfflineSetupPage(): Node {
  const source = readFileSync(
    new URL('./OfflineSetupPage.tsx', import.meta.url),
    'utf8',
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const exports: Record<string, () => Node> = {}
  const jsx = (type: unknown, props: Record<string, unknown>) => ({
    type,
    props,
  })
  runInNewContext(compiled, {
    exports,
    require: (name: string) =>
      ({
        'react/jsx-runtime': { jsx, jsxs: jsx },
        'react-router-dom': { Link: 'Link' },
        'lucide-react': { Download: 'Download', House: 'House' },
      })[name] ?? require(name),
  })
  return exports.OfflineSetupPage()
}

/** Returns every JSX node in a rendered child tree. */
function nodes(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(nodes)
  if (!root || typeof root !== 'object' || !('props' in root)) return []
  const node = root as Node
  return [node, ...nodes(node.props.children)]
}

/** Flattens rendered JSX content for instruction-level assertions. */
function content(root: unknown): string {
  if (Array.isArray(root)) return root.map(content).join('')
  if (typeof root === 'string' || typeof root === 'number') return String(root)
  return root && typeof root === 'object' && 'props' in root
    ? content((root as Node).props.children)
    : ''
}

test('offers the mobile home action back to all groups', () => {
  const homeLink = nodes(renderOfflineSetupPage()).find(
    (node) => node.props.to === '/groups',
  )

  assert.ok(homeLink)
  assert.equal(
    homeLink.props.className,
    'grid size-11 place-items-center rounded-full border border-border bg-surface-raised shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  )
  assert.equal(homeLink.props['aria-label'], 'All groups')
  const homeIcon = homeLink.props.children as Node
  assert.equal(homeIcon.type, 'House')
  assert.equal(homeIcon.props['aria-hidden'], true)
  assert.equal(homeIcon.props.size, 19)
  const homeContainer = nodes(renderOfflineSetupPage()).find(
    (node) => node.props.className === 'fixed bottom-4 left-4 z-20 md:hidden',
  )
  assert.ok(homeContainer)
})

test('lists the public setup steps from the main app through restart', () => {
  const page = renderOfflineSetupPage()
  const pageText = content(page)

  const steps = nodes(page).find((node) => node.type === 'ol')
  assert.equal(steps?.props.start, 0)
  assert.deepEqual(
    nodes(page)
      .filter(
        (node) =>
          node.props.className ===
          'mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-contrast',
      )
      .map((node) => node.props.children),
    ['0', '1', '2', '3', '4', '5'],
  )
  assert.match(
    pageText,
    /To add this app to your Home Screen and use it offline, your phone needs a trusted HTTPS connection\./,
  )
  assert.match(
    pageText,
    /Open Offline setup \(this page\) from the Home Screen shortcut/,
  )
  assert.match(
    pageText,
    /If you’re unsure, search the web for the current iOS or Android instructions\./,
  )
  const downloadLink = nodes(renderOfflineSetupPage()).find(
    (node) => node.props.href === '/caddy-root.crt',
  )
  assert.ok(downloadLink)
  assert.equal(
    nodes(downloadLink.props.children).some((node) => node.type === 'Download'),
    true,
  )
})
