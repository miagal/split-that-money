// Adapts the existing system-admin user endpoints into typed feature requests.
import { ApiClient } from '../../api/client.ts'
import type {
  AdminUserCreateDto,
  AdminUserUpdateDto,
  UserDto,
  Uuid,
} from '../../api/contracts.ts'

const client = new ApiClient()

/** Fetches users visible to a system administrator. */
export function fetchAdminUsers(): Promise<UserDto[]> {
  return client.request<UserDto[]>('admin/users/')
}

/** Creates an account from ordinary profile fields and its initial password. */
export function createAdminUser(input: AdminUserCreateDto): Promise<UserDto> {
  return client.request<UserDto>(
    'admin/users/',
    jsonRequest('POST', {
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
      password: input.password,
    }),
  )
}

/** Updates ordinary profile fields without sending account role flags. */
export function updateAdminUser(
  userId: Uuid,
  input: AdminUserUpdateDto,
): Promise<UserDto> {
  return client.request<UserDto>(
    userPath(userId),
    jsonRequest('PATCH', {
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
    }),
  )
}

/** Resets the selected user's password through the dedicated endpoint. */
export function resetAdminUserPassword(
  userId: Uuid,
  password: string,
): Promise<void> {
  return client.request<void>(
    `${userPath(userId)}reset-password/`,
    jsonRequest('POST', { password }),
  )
}

/** Deactivates an account while retaining its records. */
export function deactivateAdminUser(userId: Uuid): Promise<void> {
  return client.request<void>(`${userPath(userId)}deactivate/`, {
    method: 'POST',
  })
}

/** Restores an inactive account. */
export function reactivateAdminUser(userId: Uuid): Promise<void> {
  return client.request<void>(`${userPath(userId)}reactivate/`, {
    method: 'POST',
  })
}

/** Encodes a user identifier as one admin API path segment. */
function userPath(userId: Uuid): string {
  return `admin/users/${encodeURIComponent(userId)}/`
}

/** Serializes a JSON write using the established API client request shape. */
function jsonRequest(method: string, body: object): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
