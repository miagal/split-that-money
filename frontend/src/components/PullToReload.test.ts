// Verifies native touch listeners on the scroll wrapper handle pulls starting in nested content.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)

test('nested-content pull reloads at the threshold while dialog pulls are ignored', () => {
  class FakeElement {
    private readonly inDialog: boolean
    constructor(inDialog = false) {
      this.inDialog = inDialog
    }
    closest(selector: string) {
      return selector === 'dialog' && this.inDialog ? this : null
    }
  }
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const options = new Map<string, AddEventListenerOptions>()
  const region = {
    scrollTop: 0,
    addEventListener(
      name: string,
      listener: (event: Record<string, unknown>) => void,
      option: AddEventListenerOptions,
    ) {
      listeners.set(name, listener)
      options.set(name, option)
    },
    removeEventListener(name: string) {
      listeners.delete(name)
    },
  }
  const source = readFileSync(
    new URL('./PullToReload.tsx', import.meta.url),
    'utf8',
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const effects: Array<() => void> = []
  let refCount = 0
  let reloads = 0
  const exports: Record<
    string,
    (props: { children: string; className: string }) => unknown
  > = {}
  runInNewContext(compiled, {
    exports,
    Element: FakeElement,
    window: {
      location: {
        reload: () => {
          reloads++
        },
      },
    },
    require: (name: string) =>
      ({
        react: {
          useRef: (value: unknown) => ({
            current: refCount++ === 0 ? region : value,
          }),
          useState: (value: unknown) => [value, () => undefined],
          useEffect: (effect: () => void) => {
            effects.push(effect)
          },
        },
        'react/jsx-runtime': {
          jsx: (_type: unknown, props: unknown) => props,
          jsxs: (_type: unknown, props: unknown) => props,
        },
      })[name] ?? require(name),
  })
  exports.PullToReload({
    children: 'nested content',
    className: 'app-scroll-region',
  })
  effects.forEach((effect) => effect())

  assert.equal(options.get('touchmove')?.passive, false)
  const touch = (identifier: number, clientY: number) => ({
    identifier,
    clientY,
  })
  let prevented = 0
  const send = (name: string, clientY: number, target = new FakeElement()) =>
    listeners.get(name)?.({
      target,
      touches: [touch(7, clientY)],
      changedTouches: [touch(7, clientY)],
      preventDefault: () => {
        prevented++
      },
    })
  send('touchstart', 100)
  send('touchmove', 172)
  assert.equal(prevented, 1)
  send('touchend', 172)
  send('touchend', 172)
  assert.equal(reloads, 1)

  // The dialog may scroll while the page wrapper stays at its top.
  const dialogContent = new FakeElement(true)
  send('touchstart', 100, dialogContent)
  send('touchmove', 172, dialogContent)
  send('touchend', 172, dialogContent)
  assert.equal(prevented, 1)
  assert.equal(reloads, 1)

  send('touchstart', 200)
  send('touchmove', 190)
  send('touchend', 190)
  assert.equal(prevented, 1)
  assert.equal(reloads, 1)

  region.scrollTop = 10
  send('touchstart', 100)
  region.scrollTop = 0
  send('touchmove', 200)
  send('touchend', 200)
  assert.equal(prevented, 1)
  assert.equal(reloads, 1)

  send('touchstart', 100)
  send('touchmove', 172)
  send('touchcancel', 172)
  send('touchend', 172)
  assert.equal(prevented, 2)
  assert.equal(reloads, 1)
})
