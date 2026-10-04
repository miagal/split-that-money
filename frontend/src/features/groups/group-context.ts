// Defines the routed group context separately so the layout remains Fast Refresh compatible.
import { createContext, useContext, type ReactNode } from 'react'
import type { GroupDto } from '../../api/contracts.ts'

export type GroupContextValue = {
  group: GroupDto
  refresh: () => Promise<void>
  setHeaderAction: (action: ReactNode | null) => void
}

export const GroupContext = createContext<GroupContextValue | null>(null)

/** Returns the current routed group and its refresh action. */
export function useGroup(): GroupContextValue {
  const value = useContext(GroupContext)
  if (!value) throw new Error('useGroup must be used inside GroupLayout.')
  return value
}
