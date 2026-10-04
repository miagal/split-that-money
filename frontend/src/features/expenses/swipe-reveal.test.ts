// Verifies the threshold that reveals the mobile expense-row delete action.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  swipeOffset,
  swipeRevealState,
  swipeShouldSuppressActivation,
} from './swipe-reveal.ts'

test('moves a touch row with leftward travel without revealing more than the delete action', () => {
  assert.equal(swipeOffset({ startX: 280, currentX: 220 }), -60)
  assert.equal(swipeOffset({ startX: 280, currentX: 0 }), -72)
  assert.equal(swipeOffset({ startX: 180, currentX: 280 }), 0)
})

test('swipe reveals after leftward travel reaches one quarter of the row width', () => {
  assert.equal(
    swipeRevealState({ startX: 280, currentX: 180, width: 320 }),
    'revealed',
  )
})

test('swipe stays closed for rightward and short leftward travel', () => {
  assert.equal(
    swipeRevealState({ startX: 180, currentX: 280, width: 320 }),
    'closed',
  )
  assert.equal(
    swipeRevealState({ startX: 280, currentX: 201, width: 320 }),
    'closed',
  )
})

test('suppresses row activation only after a revealed swipe', () => {
  assert.equal(swipeShouldSuppressActivation('revealed'), true)
  assert.equal(swipeShouldSuppressActivation('closed'), false)
})
