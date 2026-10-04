// Adapts group, balance, and lifecycle endpoints into typed feature-level requests.
import { ApiClient } from '../../api/client.ts'
import type {
  AddMemberDto,
  BalancesDto,
  GroupCreateDto,
  GroupDto,
  GroupUpdateDto,
  MemberSearchResultDto,
  MembershipDto,
  SuggestedTransfersDto,
  Uuid,
} from '../../api/contracts.ts'

const client = new ApiClient()

/**
 * Builds the canonical overview path for a backend UUID group identifier.
 *
 * @param groupId - Group UUID returned by the backend.
 * @returns The route that owns the selected group's overview.
 */
export function groupOverviewPath(groupId: Uuid): string {
  return `/groups/${encodeURIComponent(groupId)}/overview`
}

/** Fetches groups visible to the authenticated user. */
export function fetchGroups(): Promise<GroupDto[]> {
  return client.request<GroupDto[]>('groups/')
}

/** Fetches one visible group by UUID. */
export function fetchGroup(groupId: Uuid): Promise<GroupDto> {
  return client.request<GroupDto>(groupPath(groupId))
}

/** Creates a group on the server; group creation is intentionally never queued offline. */
export function createGroup(input: GroupCreateDto): Promise<GroupDto> {
  return client.request<GroupDto>('groups/', jsonRequest('POST', input))
}

/** Updates a group's editable presentation fields when the current user can manage it. */
export function updateGroup(
  groupId: Uuid,
  input: GroupUpdateDto,
): Promise<GroupDto> {
  return client.request<GroupDto>(
    groupPath(groupId),
    jsonRequest('PATCH', input),
  )
}

/** Archives a group through its server-owned lifecycle. */
export function archiveGroup(groupId: Uuid): Promise<GroupDto> {
  return client.request<GroupDto>(
    `${groupPath(groupId)}archive/`,
    jsonRequest('POST'),
  )
}

/** Restores an archived group through its server-owned lifecycle. */
export function unarchiveGroup(groupId: Uuid): Promise<GroupDto> {
  return client.request<GroupDto>(
    `${groupPath(groupId)}unarchive/`,
    jsonRequest('POST'),
  )
}

/** Removes the current user from a group under the backend's involvement rules. */
export function leaveGroup(groupId: Uuid): Promise<void> {
  return client.request<void>(
    `${groupPath(groupId)}leave/`,
    jsonRequest('POST'),
  )
}

/** Restores the current user's previously involved membership. */
export function rejoinGroup(groupId: Uuid): Promise<void> {
  return client.request<void>(
    `${groupPath(groupId)}rejoin/`,
    jsonRequest('POST'),
  )
}

/** Removes an active member when the current user has permission. */
export function removeMember(groupId: Uuid, userId: Uuid): Promise<void> {
  return client.request<void>(
    `${groupPath(groupId)}members/${encodeURIComponent(userId)}/remove/`,
    jsonRequest('POST'),
  )
}

/** Adds an existing account to a group while online. */
export function addMember(
  groupId: Uuid,
  input: AddMemberDto,
): Promise<MembershipDto> {
  return client.request<MembershipDto>(
    `${groupPath(groupId)}members/`,
    jsonRequest('POST', input),
  )
}

/** Searches eligible active accounts for a group member picker. */
export function searchMemberAccounts(
  groupId: Uuid,
  email: string,
): Promise<MemberSearchResultDto[]> {
  return client.request<MemberSearchResultDto[]>(
    memberSearchPath(groupId, email),
  )
}

/** Permanently deletes an archived group when the backend permits it. */
export function deleteGroup(groupId: Uuid): Promise<void> {
  return client.request<void>(groupPath(groupId), { method: 'DELETE' })
}

/** Fetches current server-computed balances for the overview while money caching is introduced later. */
export function fetchBalances(groupId: Uuid): Promise<BalancesDto> {
  return client.request<BalancesDto>(`${groupPath(groupId)}balances/`)
}

/** Fetches the server's current settlement suggestions for the overview. */
export function fetchSuggestedTransfers(
  groupId: Uuid,
): Promise<SuggestedTransfersDto> {
  return client.request<SuggestedTransfersDto>(
    `${groupPath(groupId)}suggested-transfers/`,
  )
}

/** Builds one API path segment from a UUID group ID. */
function groupPath(groupId: Uuid): string {
  return `groups/${encodeURIComponent(groupId)}/`
}

/** Builds the encoded API path for a group's scoped member-account search. */
export function memberSearchPath(groupId: Uuid, email: string): string {
  return `${groupPath(groupId)}members/search/?email=${encodeURIComponent(email)}`
}

/** Builds a JSON request init for lifecycle writes. */
function jsonRequest(method: string, body?: object): RequestInit {
  return {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }
}
