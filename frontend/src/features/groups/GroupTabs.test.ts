import assert from 'node:assert/strict'
import test from 'node:test'
import * as groupViewRules from './group-view-rules.ts'

test('removes the tab transition for reduced-motion users', () => {
  assert.equal(groupViewRules.transitionDuration(true), '0ms')
  assert.equal(groupViewRules.transitionDuration(false), '280ms')
})

test('keeps the mobile tab animation limited to its width', () => {
  assert.equal(
    groupViewRules.mobileTabTransitionClass(),
    'transition-[flex] duration-[280ms] motion-reduce:transition-none',
  )
})

test('group tabs use the five retained labels and omit the retired People route', () => {
  assert.deepEqual(
    groupViewRules.groupTabs.map(({ label }) => label),
    ['Overview', 'Expenses', 'Balances', 'Insights', 'Settings'],
  )
  assert.deepEqual(groupViewRules.groupTabPaths(), [
    'overview',
    'expenses',
    'balances',
    'insights',
    'settings',
  ])
})
