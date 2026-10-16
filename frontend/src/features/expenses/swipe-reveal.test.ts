// Verifies the threshold that reveals the mobile expense-row delete action.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  swipeIsVerticalScroll,
  swipeOffset,
  swipeRevealState,
  swipeShouldCapture,
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

test('treats dominant vertical travel as scroll instead of a swipe', () => {
  assert.equal(
    swipeIsVerticalScroll({
      startX: 160,
      startY: 100,
      currentX: 162,
      currentY: 130,
    }),
    true,
  )
  assert.equal(
    swipeIsVerticalScroll({
      startX: 280,
      startY: 100,
      currentX: 200,
      currentY: 104,
    }),
    false,
  )
  assert.equal(
    swipeIsVerticalScroll({
      startX: 160,
      startY: 100,
      currentX: 160,
      currentY: 104,
    }),
    false,
  )
})

test('captures only after clear leftward swipe intent', () => {
  assert.equal(
    swipeShouldCapture({
      startX: 280,
      startY: 100,
      currentX: 260,
      currentY: 102,
    }),
    true,
  )
  assert.equal(
    swipeShouldCapture({
      startX: 280,
      startY: 100,
      currentX: 278,
      currentY: 100,
    }),
    false,
  )
  assert.equal(
    swipeShouldCapture({
      startX: 160,
      startY: 100,
      currentX: 140,
      currentY: 130,
    }),
    false,
  )
})
