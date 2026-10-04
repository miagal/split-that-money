// Exercises the production focus loop when a parent and nested confirmation both hear Tab.
import assert from 'node:assert/strict'
import test from 'node:test'
import { cycleFocus } from './dialog-focus.ts'

test('nested confirmation owns forward and backward Tab, including boundary wrapping', () => {
  const document = { activeElement: null as unknown }
  function control() {
    const element = {
      tabIndex: 0,
      hasAttribute: () => false,
      closest: () => null,
      focus: () => {
        document.activeElement = element
      },
    }
    return element
  }
  const parentControls = [control(), control()]
  const pickerControls = [control(), control(), control()]
  function dialog(controls: ReturnType<typeof control>[]) {
    return {
      ownerDocument: document,
      querySelectorAll: () => controls,
      contains: (element: unknown) =>
        controls.includes(element as ReturnType<typeof control>),
    } as unknown as HTMLDialogElement
  }
  const parent = dialog(parentControls)
  const picker = dialog(pickerControls)
  for (const parentFirst of [true, false]) {
    for (const shiftKey of [false, true]) {
      pickerControls[1].focus()
      let prevented = false
      const event = {
        shiftKey,
        preventDefault: () => {
          prevented = true
        },
      } as KeyboardEvent
      const listeners = parentFirst
        ? ([
            [parent, true],
            [picker, false],
          ] as const)
        : ([
            [picker, false],
            [parent, true],
          ] as const)
      for (const [surface, nested] of listeners)
        cycleFocus(event, surface, nested)
      assert.equal(
        prevented,
        false,
        'the parent must not swallow ordinary native Tab movement',
      )
      assert.equal(document.activeElement, pickerControls[1])

      pickerControls[shiftKey ? 0 : 2].focus()
      for (const [surface, nested] of listeners)
        cycleFocus(event, surface, nested)
      assert.equal(prevented, true)
      assert.equal(document.activeElement, pickerControls[shiftKey ? 2 : 0])
    }
  }
})

test('moves focus from a dialog surface to its first or last control', () => {
  const document = { activeElement: null as unknown }
  function control() {
    const element = {
      tabIndex: 0,
      hasAttribute: () => false,
      closest: () => null,
      focus: () => {
        document.activeElement = element
      },
    }
    return element
  }
  const controls = [control(), control()]
  const dialog = {
    ownerDocument: document,
    querySelectorAll: () => controls,
    contains: (element: unknown) =>
      element === dialog ||
      controls.includes(element as ReturnType<typeof control>),
    focus: () => {
      document.activeElement = dialog
    },
  } as unknown as HTMLDialogElement

  for (const [shiftKey, expected] of [
    [false, controls[0]],
    [true, controls[1]],
  ] as const) {
    dialog.focus()
    let prevented = false
    cycleFocus(
      {
        shiftKey,
        preventDefault: () => {
          prevented = true
        },
      } as KeyboardEvent,
      dialog,
      false,
    )
    assert.equal(prevented, true)
    assert.equal(document.activeElement, expected)
  }
})
