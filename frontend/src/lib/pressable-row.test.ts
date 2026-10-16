import assert from 'node:assert/strict'
import test from 'node:test'
import {
  blurAfterPress,
  blurOnTouchScroll,
  moneyListRowClass,
  pressableMoneyRowClass,
  pressableRowClass,
} from './pressable-row.ts'

test('exports stable layout and tap-highlight classes for money rows', () => {
  assert.match(pressableRowClass, /webkit-tap-highlight-color/)
  assert.match(pressableMoneyRowClass, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/)
  assert.match(pressableMoneyRowClass, /webkit-tap-highlight-color/)
  assert.match(moneyListRowClass, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/)
})

test('blur helpers tolerate missing events and blur the current target', () => {
  let blurred = 0
  const target = {
    blur: () => {
      blurred += 1
    },
  }
  blurAfterPress()
  blurAfterPress({ currentTarget: target })
  blurOnTouchScroll({ currentTarget: target })
  assert.equal(blurred, 2)
})
