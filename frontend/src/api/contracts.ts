// Defines the backend's snake_case wire payloads so feature adapters never infer API shapes.

export type Uuid = string
export type IsoDate = string
export type IsoDateTime = string

export type ApiErrorPayload = {
  code: string
  message: string
  fields?: Record<string, string[]>
}

export type PublicConfigDto = {
  ALLOW_SELF_REGISTRATION: boolean
  SHELL_NETWORK_TIMEOUT_SECONDS: number
  SYNC_REQUEST_TIMEOUT_SECONDS: number
}

export type LoginDto = {
  email: string
  password: string
}

export type RegisterDto = LoginDto & {
  first_name: string
  last_name: string
}

export type UserDto = {
  id: Uuid
  email: string
  first_name: string
  last_name: string
  is_active: boolean
  is_staff: boolean
  is_superuser: boolean
  display_name: string
}

export type AdminUserCreateDto = Pick<
  UserDto,
  'email' | 'first_name' | 'last_name'
> & { password: string }
export type AdminUserUpdateDto = Pick<
  UserDto,
  'email' | 'first_name' | 'last_name'
>

export type MemberSearchResultDto = Pick<
  UserDto,
  'id' | 'email' | 'first_name' | 'last_name' | 'display_name'
>

export type MembershipDto = {
  id: Uuid
  user: UserDto
  role: 'admin' | 'member'
  joined_at: IsoDateTime
  left_at: IsoDateTime | null
  is_active: boolean
}

export type GroupLucideIcon =
  | 'house'
  | 'plane'
  | 'shopping-basket'
  | 'utensils-crossed'
  | 'car-front'
  | 'tent-tree'
  | 'party-popper'
  | 'handshake'

export type GroupIcon = `lucide:${GroupLucideIcon}` | `emoji:${string}`

export type GroupDto = {
  id: Uuid
  name: string
  currency: string
  icon: GroupIcon
  created_by: Uuid
  created_at: IsoDateTime
  updated_at: IsoDateTime
  archived_at: IsoDateTime | null
  memberships: MembershipDto[]
}

export type GroupCreateDto = Pick<GroupDto, 'name' | 'currency' | 'icon'>
export type GroupUpdateDto = Pick<GroupDto, 'name' | 'icon'>
export type AddMemberDto = { email: string }

export type BalanceDto = {
  user_id: Uuid
  amount_cents: number
}

export type BalancesDto = { balances: BalanceDto[] }

export type SuggestedTransferDto = {
  from_user_id: Uuid
  to_user_id: Uuid
  amount_cents: number
}

export type SuggestedTransfersDto = { transfers: SuggestedTransferDto[] }

export type ExpenseIcon =
  | 'utensils-crossed'
  | 'coffee'
  | 'shopping-basket'
  | 'car-front'
  | 'ticket'
  | 'bed-double'
  | 'party-popper'
  | null

export type ExpenseShareDto = {
  user: Uuid
  value: number
  amount_cents: number
}

export type ExpenseUpsertShareDto = Pick<ExpenseShareDto, 'user' | 'value'>

export type ExpenseDto = {
  id: Uuid
  title: string
  amount_cents: number
  date: IsoDate
  payer: Uuid
  split_type: 'equal' | 'exact' | 'shares' | 'percent'
  icon: ExpenseIcon
  note: string
  shares: ExpenseShareDto[]
  created_by: Uuid
  created_at: IsoDateTime
  updated_by: Uuid
  updated_at: IsoDateTime
  deleted: boolean
  created_on_device: string | null
}

export type ExpenseUpsertDto = Pick<
  ExpenseDto,
  | 'id'
  | 'created_by'
  | 'created_at'
  | 'updated_at'
  | 'title'
  | 'amount_cents'
  | 'date'
  | 'payer'
  | 'split_type'
> & {
  icon?: ExpenseIcon
  note?: string
  shares: ExpenseUpsertShareDto[]
  deleted?: boolean
  created_on_device?: string | null
}

export type SettlementDto = {
  id: Uuid
  from_user: Uuid
  to_user: Uuid
  amount_cents: number
  created_by: Uuid
  created_at: IsoDateTime
  updated_by: Uuid
  updated_at: IsoDateTime
  deleted: boolean
  created_on_device: string | null
}

export type SettlementUpsertDto = Pick<
  SettlementDto,
  | 'id'
  | 'created_by'
  | 'created_at'
  | 'updated_at'
  | 'from_user'
  | 'to_user'
  | 'amount_cents'
> & {
  deleted?: boolean
  created_on_device?: string | null
}

export type SyncStatus =
  'created' | 'updated' | 'ignored' | 'conflict' | 'error'
export type AppliedSyncStatus = Exclude<SyncStatus, 'conflict' | 'error'>

export type ExpenseUpsertResultDto =
  | { sync_status: AppliedSyncStatus; expense: ExpenseDto }
  | { sync_status: 'conflict' }

export type SettlementUpsertResultDto =
  | { sync_status: AppliedSyncStatus; settlement: SettlementDto }
  | { sync_status: 'conflict' }

export type SyncPullDto = {
  expenses: ExpenseDto[]
  settlements: SettlementDto[]
}

export type SyncPushRowDto<T> =
  | { id: Uuid; sync_status: AppliedSyncStatus; row: T }
  | { id: Uuid; sync_status: 'conflict' }
  | { id: Uuid; sync_status: 'error'; code: string; message: string }

export type SyncPushDto = {
  expenses: SyncPushRowDto<ExpenseDto>[]
  settlements: SyncPushRowDto<SettlementDto>[]
}
