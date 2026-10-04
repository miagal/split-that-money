// Verifies that only complete, valid values cross the group creation dialog boundary.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emojiInputValue,
  groupCreateInput,
  iconPickerSelection,
} from './group-dialog-rules.ts'

test('normalizes a valid group creation request', () => {
  assert.deepEqual(
    groupCreateInput({
      name: '  Summer trip  ',
      currency: 'EUR',
      icon: 'lucide:plane',
    }),
    {
      name: 'Summer trip',
      currency: 'EUR',
      icon: 'lucide:plane',
    },
  )
})

test('rejects an empty group name', () => {
  assert.equal(
    groupCreateInput({ name: '   ', currency: 'EUR', icon: 'lucide:house' }),
    null,
  )
})

test('accepts one emoji but rejects malformed icon values', () => {
  assert.deepEqual(
    groupCreateInput({ name: 'Camping', currency: 'USD', icon: 'emoji:🏕️' }),
    {
      name: 'Camping',
      currency: 'USD',
      icon: 'emoji:🏕️',
    },
  )
  assert.equal(
    groupCreateInput({ name: 'Camping', currency: 'USD', icon: 'emoji:🏕️🏕️' }),
    null,
  )
  assert.equal(
    groupCreateInput({
      name: 'Camping',
      currency: 'USD',
      icon: 'lucide:coffee',
    }),
    null,
  )
})

test('commits a picker selection and closes the picker', () => {
  assert.deepEqual(
    iconPickerSelection({ current: 'lucide:house', selected: 'lucide:plane' }),
    {
      value: 'lucide:plane',
      open: false,
    },
  )
})

test('dismisses a picker without changing its current value', () => {
  assert.deepEqual(
    iconPickerSelection({ current: 'emoji:🏕️', selected: null }),
    {
      value: 'emoji:🏕️',
      open: false,
    },
  )
})

test('keeps only an empty value or one valid emoji in the picker input', () => {
  assert.equal(emojiInputValue('🏕️'), '🏕️')
  assert.equal(emojiInputValue('a'), '')
  assert.equal(emojiInputValue('🏕️a'), '')
})
