// Renders participant-level split inputs and calculated currency allocations for one selected mode.
import { useMemo } from 'react'
import type { Uuid } from '../../api/contracts.ts'
import { formatMoney } from '../../lib/money.ts'
import { parseSplitValue, validateSplit, type SplitMode } from './split.ts'

type Props = {
  mode: SplitMode
  amountCents: number
  participants: Uuid[]
  values: Record<Uuid, string>
  onValuesChange: (values: Record<Uuid, string>) => void
  names: (id: Uuid) => string
  currency: string
}

/**
 * Renders the selected split editor directly beneath its mode chooser.
 *
 * @param props - Split mode, participant values, names, currency, and value change callback.
 * @returns Participant rows with mode-specific controls and calculated amounts.
 */
export function SplitEditor({
  mode,
  amountCents,
  participants,
  values,
  onValuesChange,
  names,
  currency,
}: Props) {
  const orderedValues = useMemo(
    () =>
      participants.map(
        (participant) =>
          parseSplitValue(mode, values[participant] ?? '') ?? Number.NaN,
      ),
    [mode, participants, values],
  )
  const result = useMemo(
    () =>
      validateSplit({ mode, amountCents, participants, values: orderedValues }),
    [amountCents, mode, participants, orderedValues],
  )

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        {participants.map((participant) => (
          <label
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3"
            key={participant}
          >
            <span className="truncate text-sm">{names(participant)}</span>
            {mode !== 'equal' && (
              <input
                className="h-10 w-24 rounded-lg border border-border bg-surface px-3 text-base font-normal leading-none text-right"
                type="number"
                min={mode === 'shares' ? 1 : 0}
                step={mode === 'exact' ? 0.01 : 1}
                value={values[participant] ?? ''}
                onChange={(event) =>
                  onValuesChange({
                    ...values,
                    [participant]: event.target.value,
                  })
                }
                aria-label={`${names(participant)} ${mode}`}
              />
            )}
            <strong className="min-w-20 text-right tabular-nums">
              {formatMoney(result.amounts[participant] ?? 0, currency)}
            </strong>
          </label>
        ))}
      </div>
      {result.error && (
        <p className="text-sm text-danger" role="alert">
          {result.error}
        </p>
      )}
    </div>
  )
}
