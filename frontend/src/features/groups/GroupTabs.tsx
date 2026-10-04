import {
  BarChart3,
  House,
  Lightbulb,
  List,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import type { Uuid } from '../../api/contracts.ts'
import {
  desktopGroupTabClass,
  desktopGroupTabLabelClass,
  groupTabs,
  type GroupTabPath,
  mobileTabClass,
  mobileTabTransitionClass,
} from './group-view-rules.ts'

const tabIcons: Record<GroupTabPath, LucideIcon> = {
  overview: House,
  expenses: List,
  balances: BarChart3,
  insights: Lightbulb,
  settings: Settings,
}
const tabs = groupTabs.map(
  ({ path, label }) => [path, label, tabIcons[path]] as const,
)

/** Provides route-backed navigation for a group, with a compact mobile presentation. */
export function GroupTabs({ groupId }: { groupId: Uuid }) {
  return (
    <>
      <nav
        aria-label="Group sections"
        className="mb-6 flex min-w-0 flex-wrap items-center gap-1 md:mb-0 md:block"
      >
        {tabs.map(([path, label, Icon]) => (
          <NavLink
            key={path}
            className={({ isActive }) =>
              `${mobileTabClass(path, isActive ? path : '') === 'is-active' ? `inline-flex min-w-0 flex-[2] items-center justify-center gap-1 rounded-xl bg-accent px-2 py-3 text-sm font-semibold text-accent-contrast ${mobileTabTransitionClass()}` : `inline-flex min-w-0 flex-1 items-center justify-center rounded-xl py-3 text-muted hover:bg-surface ${mobileTabTransitionClass()}`} md:flex md:h-11 md:w-full md:items-center md:justify-start md:gap-3 md:px-3 md:py-0 ${desktopGroupTabClass(isActive)}`
            }
            end={path === 'overview'}
            to={`/groups/${encodeURIComponent(groupId)}/${path}`}
          >
            {({ isActive }) => (
              <>
                <Icon
                  className="shrink-0"
                  aria-hidden
                  size={19}
                  strokeWidth={2}
                />
                <span className={desktopGroupTabLabelClass(isActive)}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="fixed bottom-4 left-4 z-20 md:hidden">
        <Link
          className="grid size-11 place-items-center rounded-full border border-border bg-surface-raised shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          to="/groups"
          aria-label="All groups"
        >
          <House aria-hidden size={19} />
        </Link>
      </div>
    </>
  )
}
