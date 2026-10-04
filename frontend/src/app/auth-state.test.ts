// Verifies that session boot preserves the difference between no session and a retryable failure.
import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import {
  cachedSessionBoot,
  createDeviceSignOut,
  failedSessionBoot,
  persistSessionCache,
  resolvedSessionBoot,
  sessionCacheAction,
} from './auth-state.ts'

const cachedUser = {
  id: 'user-1',
  email: 'alex@example.com',
  first_name: 'Alex',
  last_name: 'Example',
  display_name: 'Alex Example',
  is_active: true,
  is_staff: false,
  is_superuser: false,
}

const secondUser = {
  ...cachedUser,
  id: 'user-2',
  email: 'blair@example.com',
  first_name: 'Blair',
  display_name: 'Blair Example',
}

test('reserves a null session for an expected unauthenticated response', () => {
  assert.deepEqual(resolvedSessionBoot(null), {
    session: null,
    bootError: false,
  })
})

test('keeps failed session boot separate from an unauthenticated session', () => {
  assert.deepEqual(failedSessionBoot(), { session: undefined, bootError: true })
})

test('boots a known cached user after the current-user request fails', () => {
  assert.deepEqual(cachedSessionBoot(cachedUser), {
    session: cachedUser,
    bootError: false,
  })
})

test('clears account data before storing a different resolved user', () => {
  assert.equal(sessionCacheAction(cachedUser, null), 'clear')
  assert.equal(sessionCacheAction(cachedUser, secondUser), 'clear-and-store')
  assert.equal(sessionCacheAction(null, secondUser), 'clear-and-store')
})

test('does not write B after invalidation occurs while reading A session data', async () => {
  let current = true
  const calls: string[] = []
  const store = {
    getCachedSession: async () => {
      calls.push('get')
      current = false
      return cachedUser
    },
    clearAccountData: async () => {
      calls.push('clear')
    },
    setCachedSession: async () => {
      calls.push('set')
    },
  }

  assert.equal(
    await persistSessionCache(store, secondUser, () => current),
    false,
  )
  assert.deepEqual(calls, ['get'])
})

test('clears every account record through the store when the server confirms logout', async () => {
  const calls: string[] = []
  const store = {
    getCachedSession: async () => null,
    clearAccountData: async () => {
      calls.push('clear')
    },
    setCachedSession: async () => {
      calls.push('set')
    },
  }

  assert.equal(await persistSessionCache(store, null, () => true), false)
  assert.deepEqual(calls, ['clear'])
})

/** Replaces only browser storage I/O; device sign-out and session persistence remain production code. */
function browserStorage(t: TestContext) {
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  )
  const values = new Map<string, string>()
  let failure = 'none'
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      if (failure === 'unavailable') return undefined
      if (failure === 'access') throw new Error('storage access denied')
      return {
        getItem: (key: string) => {
          if (failure === 'read') throw new Error('storage read blocked')
          return values.get(key) ?? null
        },
        setItem: (key: string, value: string) => {
          if (failure === 'write') throw new Error('storage write blocked')
          if (failure !== 'silent-write') values.set(key, value)
        },
      }
    },
  })
  t.after(() => {
    if (originalStorage)
      Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  return {
    fail: (next: string) => {
      failure = next
    },
  }
}

test('device sign-out persists until cleared and survives a failed write in this document', (t) => {
  browserStorage(t)
  const device = createDeviceSignOut()
  assert.equal(device.isSignedOut(), false)
  assert.equal(device.mark(), true)
  assert.equal(createDeviceSignOut().isSignedOut(), true)
  device.clear()
  assert.equal(createDeviceSignOut().isSignedOut(), false)
})

test('reads a stored signed-out value as signed out', (t) => {
  browserStorage(t)
  localStorage.setItem(
    'split-that-money-device-sign-out',
    'signed-out:old-document',
  )
  assert.equal(createDeviceSignOut().isSignedOut(), true)
})
