// Verifies admin-user adapter requests against the existing backend endpoint contract.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAdminUser,
  deactivateAdminUser,
  fetchAdminUsers,
  reactivateAdminUser,
  resetAdminUserPassword,
  updateAdminUser,
} from './admin-user-api.ts'

const user = {
  id: 'user',
  email: 'user@example.com',
  first_name: 'Test',
  last_name: 'User',
  display_name: 'Test User',
  is_active: true,
  is_staff: false,
  is_superuser: false,
}

test('fetches and creates users through the admin collection endpoint', async (t) => {
  const requests: { url: string; method: string; body: unknown }[] = []
  t.mock.method(
    globalThis,
    'fetch',
    async (url: string, init?: RequestInit) => {
      requests.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return Response.json(
        url === '/api/admin/users/' && (init?.method ?? 'GET') === 'GET'
          ? [user]
          : user,
      )
    },
  )

  assert.deepEqual(await fetchAdminUsers(), [user])
  assert.deepEqual(
    await createAdminUser({
      email: 'user@example.com',
      first_name: 'Test',
      last_name: 'User',
      password: 'secret123',
    }),
    user,
  )
  assert.deepEqual(requests, [
    { url: '/api/admin/users/', method: 'GET', body: undefined },
    { url: '/api/config/public/', method: 'GET', body: undefined },
    {
      url: '/api/admin/users/',
      method: 'POST',
      body: {
        email: 'user@example.com',
        first_name: 'Test',
        last_name: 'User',
        password: 'secret123',
      },
    },
  ])
})

test('updates profile fields and resets passwords on distinct endpoints', async (t) => {
  const requests: { url: string; method: string; body: unknown }[] = []
  t.mock.method(
    globalThis,
    'fetch',
    async (url: string, init?: RequestInit) => {
      requests.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return init?.method === 'PATCH'
        ? Response.json(user)
        : new Response(null, { status: 204 })
    },
  )

  await updateAdminUser('user id', {
    email: 'new@example.com',
    first_name: 'New',
    last_name: 'Name',
  })
  await resetAdminUserPassword('user id', 'new-password')
  assert.deepEqual(requests, [
    { url: '/api/config/public/', method: 'GET', body: undefined },
    {
      url: '/api/admin/users/user%20id/',
      method: 'PATCH',
      body: { email: 'new@example.com', first_name: 'New', last_name: 'Name' },
    },
    { url: '/api/config/public/', method: 'GET', body: undefined },
    {
      url: '/api/admin/users/user%20id/reset-password/',
      method: 'POST',
      body: { password: 'new-password' },
    },
  ])
})

test('omits role and status fields from structurally typed create and update inputs', async (t) => {
  const requests: { url: string; method: string; body: unknown }[] = []
  t.mock.method(
    globalThis,
    'fetch',
    async (url: string, init?: RequestInit) => {
      requests.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return url === '/api/config/public/'
        ? Response.json({ ALLOW_SELF_REGISTRATION: false })
        : Response.json(user)
    },
  )

  const account = {
    ...user,
    is_staff: true,
    is_superuser: true,
    is_active: false,
  }
  await createAdminUser({ ...account, password: 'secret123' })
  await updateAdminUser(account.id, account)

  assert.deepEqual(
    requests.filter(({ url }) => url !== '/api/config/public/'),
    [
      {
        url: '/api/admin/users/',
        method: 'POST',
        body: {
          email: 'user@example.com',
          first_name: 'Test',
          last_name: 'User',
          password: 'secret123',
        },
      },
      {
        url: '/api/admin/users/user/',
        method: 'PATCH',
        body: {
          email: 'user@example.com',
          first_name: 'Test',
          last_name: 'User',
        },
      },
    ],
  )
})

test('deactivates and reactivates users through their action endpoints', async (t) => {
  const requests: { url: string; method: string; body: unknown }[] = []
  t.mock.method(
    globalThis,
    'fetch',
    async (url: string, init?: RequestInit) => {
      requests.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(null, { status: 204 })
    },
  )

  await deactivateAdminUser('user id')
  await reactivateAdminUser('user id')
  assert.deepEqual(requests, [
    { url: '/api/config/public/', method: 'GET', body: undefined },
    {
      url: '/api/admin/users/user%20id/deactivate/',
      method: 'POST',
      body: undefined,
    },
    { url: '/api/config/public/', method: 'GET', body: undefined },
    {
      url: '/api/admin/users/user%20id/reactivate/',
      method: 'POST',
      body: undefined,
    },
  ])
})
