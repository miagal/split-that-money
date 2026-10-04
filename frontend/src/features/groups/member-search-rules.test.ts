// Verifies when member-account search can reuse visible results instead of refetching.
import assert from 'node:assert/strict'
import test from 'node:test'
import { MEMBER_SEARCH_LIMIT, memberSearchPlan } from './member-search-rules.ts'

const available = { id: '1', email: 'available@example.com' }
const example = { id: '2', email: 'example@test.com' }
const extra = { id: '3', email: 'extra@test.com' }
const exo = { id: '4', email: 'exo@test.com' }

test('does not search until two trimmed characters are present', () => {
  assert.deepEqual(memberSearchPlan('', 'a', []), { action: 'idle' })
  assert.deepEqual(memberSearchPlan('av', ' ', [available]), { action: 'idle' })
})

test('reuses the same visible accounts when a longer query still matches all of them', () => {
  assert.deepEqual(memberSearchPlan('av', 'ava', [available]), {
    action: 'reuse',
  })
  assert.deepEqual(memberSearchPlan('av', 'AVA', [available]), {
    action: 'reuse',
  })
})

test('reuses an empty result so the missing-account message can stay on screen', () => {
  assert.deepEqual(memberSearchPlan('xy', 'xyz', []), { action: 'reuse' })
})

test('filters a complete shorter list when some accounts drop out', () => {
  assert.deepEqual(memberSearchPlan('ex', 'exa', [example, extra]), {
    action: 'filter',
    results: [example],
  })
})

test('refetches a capped list when some visible accounts drop out', () => {
  const capped = [example, extra, exo]
  assert.equal(capped.length, MEMBER_SEARCH_LIMIT)
  assert.deepEqual(memberSearchPlan('ex', 'exa', capped), {
    action: 'fetch',
    results: [example],
  })
})

test('reuses the fetched result when deleting back to that same query', () => {
  assert.deepEqual(memberSearchPlan('xy', 'xy', []), { action: 'reuse' })
  assert.deepEqual(memberSearchPlan('av', 'av', [available]), {
    action: 'reuse',
  })
})

test('refetches when the query shrinks below the fetched query or is no longer a prefix', () => {
  assert.deepEqual(memberSearchPlan('ava', 'av', [available]), {
    action: 'fetch',
    results: [available],
  })
  assert.deepEqual(memberSearchPlan('av', 'ot', [available]), {
    action: 'fetch',
    results: [],
  })
})
