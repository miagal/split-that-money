// Verifies that wire icon values resolve only through the curated display-icon contract.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  expenseIconComponent,
  groupIconComponent,
  isGroupIcon,
} from './icons.ts'

test('resolves supported group icons and emoji graphemes', () => {
  assert.equal(groupIconComponent('lucide:plane'), 'Plane')
  assert.equal(groupIconComponent('emoji:👨‍👩‍👧‍👦'), '👨‍👩‍👧‍👦')
  assert.equal(groupIconComponent('emoji:🏠🏠'), 'CircleHelp')
  assert.equal(groupIconComponent('emoji:not-an-emoji'), 'CircleHelp')
})

test('uses CircleHelp only for a deliberate no-expense-icon value', () => {
  assert.equal(expenseIconComponent(null), 'CircleHelp')
  assert.equal(expenseIconComponent('coffee'), 'Coffee')
})

test('accepts only supported group icon values', () => {
  assert.equal(isGroupIcon('emoji:🏕️'), true)
  assert.equal(isGroupIcon('lucide:coffee'), false)
  assert.equal(isGroupIcon('lucide:toString'), false)
})
