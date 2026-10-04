// Renders local expense distribution insights with a stable, accessible pie-chart callout.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  BedDouble,
  CarFront,
  CircleHelp,
  Coffee,
  PartyPopper,
  ShoppingBasket,
  Tags,
  Ticket,
  UsersRound,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { ExpenseDto, UserDto } from '../../api/contracts.ts'
import { useSyncStatus } from '../../app/providers.tsx'
import { formatGermanMoney, formatMoney } from '../../lib/money.ts'
import { expenseIconComponent } from '../../lib/icons.ts'
import { openMoneyStore } from '../sync/database.ts'
import { useGroup } from '../groups/group-context.ts'
import {
  displayCategory,
  groupByIcon,
  groupByPayer,
  insightCalloutPlacement,
  insightInitials,
  insightListRowClass,
  nextSelectedInsightKey,
  type InsightGroup,
} from './insights.ts'

const segmentColors = [
  '--color-chart-1',
  '--color-chart-2',
  '--color-chart-3',
  '--color-chart-4',
  '--color-chart-5',
  '--color-chart-6',
]
const insightInnerRadius = (36 / 52) * 100
const categoryIcons: Record<string, LucideIcon> = {
  UtensilsCrossed,
  Coffee,
  ShoppingBasket,
  CarFront,
  Ticket,
  BedDouble,
  PartyPopper,
  CircleHelp,
}
type ChartSegment = {
  item: InsightGroup
  index: number
  start: number
  end: number
}
type ConnectorTarget = {
  key: string
  side: 'left' | 'right'
  x: number
  y: number
}

/** Derives expense distribution charts from the locally synchronised expense set. */
export function InsightsPage() {
  const { group } = useGroup()
  const syncStatus = useSyncStatus()
  const [mode, setMode] = useState<'person' | 'category'>('person')
  const [expenses, setExpenses] = useState<ExpenseDto[]>([])
  const [failed, setFailed] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [initialListLoadComplete, setInitialListLoadComplete] = useState(false)

  useEffect(() => {
    let active = true
    void openMoneyStore()
      .then(async (store) => {
        try {
          const rows = await store.getExpenses(group.id)
          const nextGroups =
            mode === 'person' ? groupByPayer(rows) : groupByIcon(rows)
          if (active) {
            setExpenses(rows)
            setSelectedKey((current) =>
              current !== null &&
              !nextGroups.some((item) => item.key === current)
                ? null
                : current,
            )
            setFailed(false)
          }
        } catch {
          if (active) setFailed(true)
        } finally {
          store.close()
          if (active) setInitialListLoadComplete(true)
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true)
          setInitialListLoadComplete(true)
        }
      })
    return () => {
      active = false
    }
  }, [group.id, mode, syncStatus])

  const groups = useMemo(
    () => (mode === 'person' ? groupByPayer(expenses) : groupByIcon(expenses)),
    [expenses, mode],
  )
  const total = useMemo(
    () =>
      expenses.reduce(
        (sum, expense) => sum + (expense.deleted ? 0 : expense.amount_cents),
        0,
      ),
    [expenses],
  )
  const memberFor = (key: string) =>
    group.memberships.find((membership) => membership.user.id === key)?.user
  const labelFor = (key: string) =>
    mode === 'person'
      ? (memberFor(key)?.display_name ?? 'Member')
      : displayCategory(key as ExpenseDto['icon'] | 'other')

  const chooseMode = (nextMode: 'person' | 'category') => {
    if (mode !== nextMode) {
      setMode(nextMode)
      setSelectedKey(null)
    }
  }

  return (
    <section className="grid gap-5">
      {initialListLoadComplete && (
        <>
          {failed && (
            <p className="text-danger" role="alert">
              Could not load local expenses.
            </p>
          )}
          {groups.length === 0 ? (
            <p className="empty-state list-enter">
              No expenses to analyse yet.
            </p>
          ) : (
            <>
              <Donut
                groups={groups}
                total={total}
                currency={group.currency}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                labelFor={labelFor}
                mode={mode}
                chooseMode={chooseMode}
              />
              <ul className="list-enter divide-y divide-border rounded-xl border border-border bg-surface-raised">
                {groups.map((item, index) => (
                  <li className={insightListRowClass()} key={item.key}>
                    {mode === 'category' ? (
                      <CategoryMark
                        icon={item.key as ExpenseDto['icon'] | 'other'}
                        color={chartColor(index)}
                      />
                    ) : (
                      <PersonMark
                        user={memberFor(item.key)}
                        color={chartColor(index)}
                      />
                    )}
                    <span className="min-w-0 flex-1">{labelFor(item.key)}</span>
                    <span className="text-sm text-muted">
                      {formatMoney(item.amountCents, group.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}

/** Renders a full-size category marker that matches the person marker geometry. */
function CategoryMark({
  icon,
  color,
}: {
  icon: ExpenseDto['icon'] | 'other'
  color: string
}) {
  const Icon =
    categoryIcons[
      icon === 'other' ? 'CircleHelp' : expenseIconComponent(icon)
    ] ?? CircleHelp
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-full text-white"
      style={{ backgroundColor: color }}
    >
      <Icon size={18} />
    </span>
  )
}

/** Renders a full-size person marker with the member's initials. */
function PersonMark({
  user,
  color,
}: {
  user: UserDto | undefined
  color: string
}) {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold leading-none text-white"
      style={{ backgroundColor: color }}
    >
      {insightInitials(user?.first_name ?? '', user?.last_name ?? '')}
    </span>
  )
}

/** Renders the conic-gradient pie and its keyboard-operable SVG segment overlays. */
function Donut({
  groups,
  total,
  currency,
  selectedKey,
  onSelect,
  labelFor,
  mode,
  chooseMode,
}: {
  groups: InsightGroup[]
  total: number
  currency: string
  selectedKey: string | null
  onSelect: (key: string | null) => void
  labelFor: (key: string) => string
  mode: 'person' | 'category'
  chooseMode: (mode: 'person' | 'category') => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<SVGSVGElement>(null)
  const calloutRef = useRef<HTMLDivElement>(null)
  const [hasSideSpace, setHasSideSpace] = useState(false)
  const [connectorTarget, setConnectorTarget] =
    useState<ConnectorTarget | null>(null)
  const segments = groups.reduce<{ cursor: number; segments: ChartSegment[] }>(
    (state, item, index) => {
      const start = state.cursor
      const end = start + (total ? (item.amountCents / total) * 360 : 0)
      state.segments.push({ item, index, start, end })
      state.cursor = end
      return state
    },
    { cursor: 0, segments: [] },
  ).segments
  const stops = segments
    .map(
      ({ index, start, end }) => `${chartColor(index)} ${start}deg ${end}deg`,
    )
    .join(', ')
  const selected = segments.find(({ item }) => item.key === selectedKey)
  const percentage =
    selected && total
      ? Math.round((selected.item.amountCents / total) * 100)
      : 0
  const placement = selected
    ? insightCalloutPlacement(selected.start, selected.end, hasSideSpace)
    : null
  const selectedConnectorKey = selected?.item.key
  const selectedConnectorStart = selected?.start
  const selectedConnectorEnd = selected?.end
  const connectorSide = placement?.mode === 'side' ? placement.side : undefined

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const updateSideSpace = () => setHasSideSpace(frame.clientWidth >= 640)
    updateSideSpace()
    const observer = new ResizeObserver(updateSideSpace)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  // A parent passive effect runs after the side-callout sibling has attached its ref.
  useEffect(() => {
    if (selectedConnectorKey === undefined || connectorSide === undefined)
      return

    const frame = frameRef.current
    const chart = chartRef.current
    const callout = calloutRef.current
    if (!frame || !chart || !callout) return
    const measure = () => {
      const chartBounds = chart.getBoundingClientRect()
      const calloutBounds = callout.getBoundingClientRect()
      if (!chartBounds.width || !chartBounds.height) return
      setConnectorTarget({
        key: selectedConnectorKey,
        side: connectorSide,
        x:
          (((connectorSide === 'left'
            ? calloutBounds.left
            : calloutBounds.right) -
            chartBounds.left) *
            200) /
          chartBounds.width,
        y:
          ((calloutBounds.top + calloutBounds.height / 2 - chartBounds.top) *
            200) /
          chartBounds.height,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(chart)
    observer.observe(callout)
    return () => observer.disconnect()
  }, [
    connectorSide,
    selectedConnectorKey,
    selectedConnectorStart,
    selectedConnectorEnd,
  ])

  const connector =
    selected &&
    connectorSide &&
    connectorTarget?.key === selected.item.key &&
    connectorTarget.side === connectorSide
      ? connectorTarget
      : null

  return (
    <div className="relative w-full">
      <div className="relative mx-auto w-full max-w-[44rem]" ref={frameRef}>
        {selected && placement?.mode === 'above' && (
          <div className="mb-3 md:hidden">
            <InsightCallout
              color={chartColor(selected.index)}
              label={labelFor(selected.item.key)}
              amount={formatGermanMoney(selected.item.amountCents, currency)}
              percentage={percentage}
            />
          </div>
        )}
        <div className="relative mx-auto flex items-end justify-center gap-3 md:grid md:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1fr)] md:items-center md:gap-x-8">
          <div className="hidden md:flex md:items-center md:justify-end">
            {selected &&
              placement?.mode === 'side' &&
              placement.side === 'left' && (
                <div ref={calloutRef} className="w-fit max-w-48">
                  <InsightCallout
                    desktop
                    label={labelFor(selected.item.key)}
                    amount={formatGermanMoney(
                      selected.item.amountCents,
                      currency,
                    )}
                    percentage={percentage}
                  />
                </div>
              )}
          </div>
          <div
            className="relative grid size-44 place-items-center rounded-full md:size-52"
            style={{ background: `conic-gradient(${stops})` }}
            aria-label={`Total expenses ${formatGermanMoney(total, currency)}`}
            role="group"
          >
            <svg
              ref={chartRef}
              className="absolute inset-0 size-full overflow-visible"
              viewBox="0 0 200 200"
              aria-label="Expense categories"
              role="group"
            >
              <defs>
                <clipPath id="insight-chart-clip">
                  <circle cx="100" cy="100" r="100" />
                </clipPath>
              </defs>
              {selected && placement?.connector && connector && (
                <CalloutConnector
                  start={selected.start}
                  end={selected.end}
                  color={chartColor(selected.index)}
                  target={connector}
                />
              )}
              {segments.map(({ item, start, end }) => (
                <InsightSegment
                  key={item.key}
                  start={start}
                  end={end}
                  selected={selectedKey === item.key}
                  label={labelFor(item.key)}
                  amount={formatGermanMoney(item.amountCents, currency)}
                  onSelect={() =>
                    onSelect(nextSelectedInsightKey(selectedKey, item.key))
                  }
                />
              ))}
            </svg>
            <div className="pointer-events-none relative size-28 rounded-full bg-surface-raised text-center md:size-36">
              <strong className="absolute inset-0 flex items-center justify-center text-lg md:text-xl">
                {formatGermanMoney(total, currency)}
              </strong>
              <span className="absolute inset-x-0 top-1/2 mt-5 text-xs text-muted">
                Total expenses
              </span>
            </div>
            {selected && connector && (
              <ConnectorHoleOverlay
                start={selected.start}
                end={selected.end}
                color={chartColor(selected.index)}
                target={connector}
              />
            )}
          </div>
          <div className="hidden md:flex md:items-center">
            {selected &&
              placement?.mode === 'side' &&
              placement.side === 'right' && (
                <div ref={calloutRef} className="w-fit max-w-48">
                  <InsightCallout
                    desktop
                    label={labelFor(selected.item.key)}
                    amount={formatGermanMoney(
                      selected.item.amountCents,
                      currency,
                    )}
                    percentage={percentage}
                  />
                </div>
              )}
          </div>
        </div>
      </div>
      <InsightModeToggle mode={mode} chooseMode={chooseMode} />
    </div>
  )
}

/** Renders the selected segment's compact mobile card or frameless desktop label. */
function InsightCallout({
  color,
  label,
  amount,
  percentage,
  desktop = false,
}: {
  color?: string
  label: string
  amount: string
  percentage: number
  desktop?: boolean
}) {
  return (
    <div
      aria-live="polite"
      className={
        desktop
          ? 'w-full text-center'
          : 'w-full rounded-xl border bg-surface-raised px-4 py-3 text-center shadow-sm'
      }
      style={desktop ? undefined : { borderColor: color }}
    >
      <strong className="block">{label}</strong>
      <span className="text-sm text-muted">
        {amount} · {percentage}%
      </span>
    </div>
  )
}

/** Renders the shared mode controls beside the chart at every viewport width. */
function InsightModeToggle({
  mode,
  chooseMode,
}: {
  mode: 'person' | 'category'
  chooseMode: (mode: 'person' | 'category') => void
}) {
  const buttonClass = (active: boolean) =>
    active
      ? 'icon-label-button rounded-lg bg-accent text-sm font-semibold text-accent-contrast'
      : 'icon-label-button rounded-lg border border-border text-sm'
  return (
    <div
      className="absolute bottom-0 right-0 flex flex-col gap-2 md:flex-row md:flex-nowrap"
      role="group"
      aria-label="Insight mode"
    >
      <button
        type="button"
        aria-label="By person"
        title="By person"
        className={buttonClass(mode === 'person')}
        onClick={() => chooseMode('person')}
      >
        <UsersRound aria-hidden size={18} />
        <span>By person</span>
      </button>
      <button
        type="button"
        aria-label="By category"
        title="By category"
        className={buttonClass(mode === 'category')}
        onClick={() => chooseMode('category')}
      >
        <Tags aria-hidden size={18} />
        <span>By category</span>
      </button>
    </div>
  )
}

/** Connects the selected slice to its desktop label with a diagonal then horizontal line. */
function CalloutConnector({
  start,
  end,
  color,
  target,
}: {
  start: number
  end: number
  color: string
  target: ConnectorTarget
}) {
  const points = connectorPoints(start, end, target)
  return (
    <g aria-hidden="true" pointerEvents="none">
      <polyline
        clipPath="url(#insight-chart-clip)"
        fill="none"
        points={points}
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <polyline
        data-connector-line
        pointerEvents="none"
        fill="none"
        points={points}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </g>
  )
}

/** Repeats only the connector segment that crosses the covered donut centre at low intensity. */
function ConnectorHoleOverlay({
  start,
  end,
  color,
  target,
}: {
  start: number
  end: number
  color: string
  target: ConnectorTarget
}) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox="0 0 200 200"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="insight-hole-clip">
          <circle cx="100" cy="100" r={insightInnerRadius} />
        </clipPath>
      </defs>
      <polyline
        data-hole-connector
        clipPath="url(#insight-hole-clip)"
        fill="none"
        points={connectorPoints(start, end, target)}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.35"
        strokeWidth="3"
      />
    </svg>
  )
}

/** Builds the shared three-point path used above and within the donut centre. */
function connectorPoints(
  start: number,
  end: number,
  target: ConnectorTarget,
): string {
  const point = sliceVisualCenter(start, end)
  const elbowX = point.x + (target.side === 'left' ? -20 : 20)
  return `${point.x},${point.y} ${elbowX},${target.y} ${target.x},${target.y}`
}

/** Renders one invisible SVG hit target while exposing its selected state to keyboard users. */
function InsightSegment({
  start,
  end,
  selected,
  label,
  amount,
  onSelect,
}: {
  start: number
  end: number
  selected: boolean
  label: string
  amount: string
  onSelect: () => void
}) {
  const handleKeyDown = (
    event: KeyboardEvent<SVGPathElement | SVGCircleElement>,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }
  const sharedProps = {
    role: 'button' as const,
    tabIndex: 0,
    className: 'cursor-pointer outline-none focus:outline-none',
    'aria-label': `${selected ? 'Hide' : 'Show'} ${label}, ${amount}`,
    'aria-pressed': selected,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
    onClick: onSelect,
    onKeyDown: handleKeyDown,
  }
  return end - start >= 360 ? (
    <circle cx="100" cy="100" r="100" {...sharedProps} />
  ) : (
    <path d={wedgePath(start, end)} {...sharedProps} />
  )
}

/** Builds an SVG wedge from conic-gradient angle bounds for one pie hit target. */
function wedgePath(start: number, end: number): string {
  const startPoint = pointAt(start)
  const endPoint = pointAt(end)
  return `M 100 100 L ${startPoint.x} ${startPoint.y} A 100 100 0 ${end - start > 180 ? 1 : 0} 1 ${endPoint.x} ${endPoint.y} Z`
}

/** Converts a conic-gradient angle into the matching SVG point. */
function pointAt(degrees: number): { x: number; y: number } {
  const radians = ((degrees - 90) * Math.PI) / 180
  return { x: 100 + 100 * Math.cos(radians), y: 100 + 100 * Math.sin(radians) }
}

/** Returns the midpoint between the donut's inner and outer radii at a slice's angular centre. */
function sliceVisualCenter(
  start: number,
  end: number,
): { x: number; y: number } {
  const degrees = start + (end - start) / 2
  const radians = ((degrees - 90) * Math.PI) / 180
  const radius = (insightInnerRadius + 100) / 2
  return {
    x: 100 + radius * Math.cos(radians),
    y: 100 + radius * Math.sin(radians),
  }
}

function chartColor(index: number): string {
  return `rgb(var(${segmentColors[index % segmentColors.length]}))`
}
