// Verifies that shared money rules preserve integer-cent accuracy at form and split boundaries.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  distributeCents,
  formatGermanMoney,
  formatMoney,
  normalizeAmountInput,
  parseMoneyToCents,
} from './money.ts'

test('distributes remainder cents in stable UUID order', () => {
  assert.deepEqual(distributeCents(10, ['b', 'a', 'c']), { a: 4, b: 3, c: 3 })
})

test('rejects non-positive and over-precise decimal amounts', () => {
  assert.equal(parseMoneyToCents('0'), null)
  assert.equal(parseMoneyToCents('-1'), null)
  assert.equal(parseMoneyToCents('12.345'), null)
  assert.equal(parseMoneyToCents('12.30'), 1230)
})

test('replaces every comma with a decimal point before parsing', () => {
  assert.equal(normalizeAmountInput('12,30'), '12.30')
  assert.equal(parseMoneyToCents('12,30'), 1230)
  assert.equal(parseMoneyToCents('12,3'), 1230)
})

test('rejects fractional and unsafe cents before formatting money', () => {
  assert.throws(() => formatMoney(12.5, 'USD'), RangeError)
  assert.throws(
    () => formatMoney(Number.MAX_SAFE_INTEGER + 1, 'USD'),
    RangeError,
  )
})

test('formats safe integer cents with the German currency convention', () => {
  assert.equal(formatGermanMoney(123456, 'EUR'), '1.234,56\u00a0€')
  assert.throws(() => formatGermanMoney(12.5, 'EUR'), RangeError)
  assert.throws(
    () => formatGermanMoney(Number.MAX_SAFE_INTEGER + 1, 'EUR'),
    RangeError,
  )
})
