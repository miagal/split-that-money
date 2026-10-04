// Supplies the one curated group-icon list shared by creation and settings forms.
import {
  CarFront,
  Handshake,
  House,
  PartyPopper,
  Plane,
  ShoppingBasket,
  TentTree,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { GroupLucideIcon } from '../../api/contracts.ts'

export const groupIconChoices: Array<{
  value: GroupLucideIcon
  label: string
  Icon: LucideIcon
}> = [
  { value: 'house', label: 'Home', Icon: House },
  { value: 'plane', label: 'Trip', Icon: Plane },
  { value: 'shopping-basket', label: 'Shopping', Icon: ShoppingBasket },
  { value: 'utensils-crossed', label: 'Meal', Icon: UtensilsCrossed },
  { value: 'car-front', label: 'Drive', Icon: CarFront },
  { value: 'tent-tree', label: 'Outdoors', Icon: TentTree },
  { value: 'party-popper', label: 'Party', Icon: PartyPopper },
  { value: 'handshake', label: 'Shared', Icon: Handshake },
]
