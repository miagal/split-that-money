// Verifies the switch exposes checked state for assistive tech and toggles on click.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

type Node = { type: unknown; props: Record<string, any> }
const require = createRequire(import.meta.url)

/** Compiles and renders Switch with the given props. */
function renderSwitch(props: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  'aria-label': string
}): Node {
  const source = readFileSync(new URL('./Switch.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const exports: Record<string, any> = {}
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === 'react/jsx-runtime') {
        const jsx = (type: unknown, props: Record<string, unknown>) => ({
          type,
          props,
        })
        return { jsx, jsxs: jsx }
      }
      return require(name)
    },
  })
  return exports.Switch(props)
}

test('exposes role=switch and aria-checked for the current value', () => {
  const on = renderSwitch({
    checked: true,
    onCheckedChange: () => undefined,
    'aria-label': 'Dark mode',
  })
  assert.equal(on.props.role, 'switch')
  assert.equal(on.props['aria-checked'], true)
  assert.equal(on.props['aria-label'], 'Dark mode')
  assert.match(String(on.props.className), /bg-emerald-500/)

  const off = renderSwitch({
    checked: false,
    onCheckedChange: () => undefined,
    'aria-label': 'Dark mode',
  })
  assert.equal(off.props['aria-checked'], false)
  assert.match(String(off.props.className), /bg-muted/)
})

test('click notifies the inverted checked value', () => {
  const values: boolean[] = []
  const node = renderSwitch({
    checked: false,
    onCheckedChange: (checked) => {
      values.push(checked)
    },
    'aria-label': 'Dark mode',
  })
  node.props.onClick()
  assert.deepEqual(values, [true])
})
