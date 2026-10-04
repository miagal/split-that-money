// Verifies when the group list may safely open the server-backed creation dialog.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canOpenGroupDialog,
  groupListEntryClass,
  isCurrentGroupListRequest,
  listFetchFailed,
  listFetchSucceeded,
  listWithCreatedGroup,
  newRowIds,
  shouldShowGroupList,
} from './groups-page-rules.ts'

const createdGroup = { id: 'new', name: 'Cabin', currency: 'EUR' }

test('blocks group creation until the initial group fetch resolves', () => {
  assert.equal(canOpenGroupDialog(true, true), false)
  assert.equal(canOpenGroupDialog(true, false), true)
})

test('blocks group creation while offline', () => {
  assert.equal(canOpenGroupDialog(false, false), false)
})

test('keeps the visible list usable after a failed fetch', () => {
  const failedInitialList = listFetchFailed({ groups: [], error: null })
  const afterCreate = listWithCreatedGroup(failedInitialList, createdGroup)

  assert.equal(afterCreate.error, null)
  assert.deepEqual(afterCreate.groups, [createdGroup])

  const refreshed = listFetchSucceeded(afterCreate, [], createdGroup)
  assert.equal(refreshed.error, null)
  assert.deepEqual(refreshed.groups, [createdGroup])
})

test('accepts updates only from the latest group-list request', () => {
  // Strict Mode may restart the initial effect before its first request resolves.
  assert.equal(isCurrentGroupListRequest(1, 3), false)
  assert.equal(isCurrentGroupListRequest(3, 3), true)
})

test('withholds the group list until the initial load finishes without an error', () => {
  assert.equal(shouldShowGroupList(false, false), false)
  assert.equal(shouldShowGroupList(true, true), false)
  assert.equal(shouldShowGroupList(true, false), true)
})

test('applies the enter animation only after the initial group list resolves', () => {
  assert.equal(groupListEntryClass(false), '')
  assert.equal(groupListEntryClass(true), 'list-enter')
})

test('marks only rows that appear after the first paint as new', () => {
  assert.deepEqual([...newRowIds(new Set(), [{ id: 'a' }], false)], [])
  assert.deepEqual(
    [...newRowIds(new Set(['a']), [{ id: 'a' }, { id: 'b' }], true)],
    ['b'],
  )
})
