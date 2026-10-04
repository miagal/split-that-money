// Verifies pure group route construction before the API adapter exists.
import assert from 'node:assert/strict'
import test from 'node:test'
import { groupOverviewPath, memberSearchPath } from './group-api.ts'

test('builds the UUID group overview route', () => {
  assert.equal(groupOverviewPath('123'), '/groups/123/overview')
})

test('builds the encoded member search path', () => {
  assert.equal(
    memberSearchPath('group id', 'ava+test@example.com'),
    'groups/group%20id/members/search/?email=ava%2Btest%40example.com',
  )
})
