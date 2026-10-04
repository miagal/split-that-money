// Verifies the production money-store boundary fails closed while an account handoff owns local data.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginMoneyStoreTransition,
  enableMoneyStoreEpoch,
  MoneyStoreEpochError,
  moneyStoreEpochIsCurrent,
  openMoneyStore,
} from './database.ts'

test('keeps local account data unavailable before session bootstrap establishes ownership', async () => {
  const store = await openMoneyStore()
  assert.equal(await store.getCachedSession(), null)
  assert.deepEqual(await store.getGroups(), [])
  await assert.rejects(
    store.setCachedSession({} as never),
    MoneyStoreEpochError,
  )
})

test('hard-disables money reads and writes until the transition epoch is enabled', async () => {
  const epoch = beginMoneyStoreTransition()
  const store = await openMoneyStore()

  assert.deepEqual(await store.getGroups(), [])
  assert.equal(await store.getCachedSession(), null)
  await assert.rejects(
    store.enqueueMutation({
      kind: 'expense',
      groupId: 'group-a',
      entityId: 'expense-a',
      payload: {} as never,
    }),
    MoneyStoreEpochError,
  )
  assert.equal(moneyStoreEpochIsCurrent(epoch), false)

  enableMoneyStoreEpoch(epoch)
  assert.equal(moneyStoreEpochIsCurrent(epoch), true)
})
