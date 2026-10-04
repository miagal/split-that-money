// Verifies expense form validation and insecure-context-safe client identifiers.
import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ExpenseDto,
  ExpenseUpsertDto,
  SettlementDto,
  UserDto,
} from '../../api/contracts.ts'
import type { MoneyStore, OutboxRow } from '../sync/database.ts'
import {
  deleteExpense,
  queueExpense,
  toExpenseUpsert,
  type ExpenseForm,
} from './expense-api.ts'
import {
  expenseDeleteQuestion,
  expenseDialogFooterMode,
  expenseSubmitState,
} from './expense-submit-rules.ts'
import { addToast } from '../feedback/toast-rules.ts'
import { queueSettlement, toSettlementUpsert } from '../balances/balances.ts'

test('allows a complete expense form to submit', () => {
  assert.deepEqual(
    expenseSubmitState({
      title: 'Dinner',
      amount: '24.50',
      date: '2026-09-20',
      participantCount: 2,
      splitError: undefined,
    }),
    {
      canSubmit: true,
      errors: {},
    },
  )
})

test('rejects missing required expense fields inline', () => {
  assert.deepEqual(
    expenseSubmitState({
      title: '',
      amount: '24.50',
      date: '',
      participantCount: 0,
      splitError: 'Choose at least one participant.',
    }),
    {
      canSubmit: false,
      errors: {
        title: ['Enter a title.'],
        date: ['Choose a date.'],
        participants: ['Choose at least one participant.'],
      },
    },
  )
})

test('rejects amounts with more than two decimal places', () => {
  const state = expenseSubmitState({
    title: 'Dinner',
    amount: '1.234',
    date: '2026-09-20',
    participantCount: 2,
    splitError: undefined,
  })

  assert.equal(state.canSubmit, false)
  assert.equal(state.errors.amount?.[0], 'Enter a valid amount.')
})

test('reports a split error after the prerequisite fields are valid', () => {
  const state = expenseSubmitState({
    title: 'Dinner',
    amount: '24.50',
    date: '2026-09-20',
    participantCount: 2,
    splitError: 'Percentages add up to 80%; expected 100%.',
  })

  assert.equal(state.canSubmit, false)
  assert.deepEqual(state.errors.split, [
    'Percentages add up to 80%; expected 100%.',
  ])
})

test('builds the delete confirmation question from the expense title', () => {
  assert.equal(
    expenseDeleteQuestion('Airport taxi'),
    'Do you really want to delete Airport taxi?',
  )
})

test('uses the destructive edit footer only for persisted expenses', () => {
  assert.equal(
    expenseDialogFooterMode({ id: 'expense-1' } as ExpenseDto),
    'delete-cancel-save',
  )
  assert.equal(expenseDialogFooterMode(undefined), 'cancel-save')
})

test('saves expenses and settlements through success feedback on a LAN origin without randomUUID', async () => {
  const originalCrypto = globalThis.crypto
  let seed = 0
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        if (array instanceof Uint8Array)
          array.forEach((_, index) => {
            array[index] = (seed + index) & 0xff
          })
        seed += 16
        return array
      },
    },
  })

  try {
    const payload = toExpenseUpsert(validForm, session, 'group-1')

    assert.match(
      payload.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    assert.match(
      payload.created_on_device ?? '',
      /^group-1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    const saved: string[] = []
    const queued: string[] = []
    const store = {
      mergeExpenses: async (_groupId: string, rows: ExpenseDto[]) => {
        saved.push(rows[0].id)
      },
      mergeSettlements: async (_groupId: string, rows: SettlementDto[]) => {
        saved.push(rows[0].id)
      },
    } as MoneyStore
    const enqueue = async (
      row: Omit<OutboxRow, 'sequence' | 'sync_status'>,
    ) => {
      queued.push(row.entityId)
      return queued.length
    }
    await queueExpense(store, payload, 'group-1', enqueue)
    let toasts = addToast([], 'success', 'Expense saved.')
    const settlement = toSettlementUpsert(
      { fromUser: session.id, toUser: 'user-2', amountCents: 100 },
      session,
      'group-1',
    )
    await queueSettlement(store, settlement, 'group-1', enqueue)
    toasts = addToast(toasts, 'success', 'Payment saved.')
    assert.deepEqual(saved, [payload.id, settlement.id])
    assert.deepEqual(queued, saved)
    assert.deepEqual(
      toasts.map(({ message }) => message),
      ['Payment saved.', 'Expense saved.'],
    )
    assert.equal(
      new Set([payload.id, settlement.id, ...toasts.map(({ id }) => id)]).size,
      4,
    )
    assert.doesNotThrow(() => addToast(toasts, 'error', 'Try again.'))
  } finally {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    })
  }
})

test('preserves the immutable sync fingerprint when editing an expense', () => {
  const editForm: ExpenseForm = {
    ...validForm,
    id: 'expense-1',
    createdBy: 'original-creator',
    createdAt: '2026-09-01T08:30:00Z',
    createdOnDevice: 'phone-a',
  }
  const payload = toExpenseUpsert(editForm, session, 'group-1')

  assert.equal(payload.id, 'expense-1')
  assert.equal(payload.created_by, 'original-creator')
  assert.equal(payload.created_at, '2026-09-01T08:30:00Z')
  assert.equal(payload.created_on_device, 'phone-a')
  assert.notEqual(payload.updated_at, payload.created_at)
})

test('merges calculated local shares before enqueueing the same expense payload', async () => {
  let merged: ExpenseDto[] = []
  let queued: Omit<OutboxRow, 'sequence' | 'sync_status'> | undefined
  const store = {
    mergeExpenses: async (_groupId: string, rows: ExpenseDto[]) => {
      merged = rows
    },
  } as MoneyStore
  const payload: ExpenseUpsertDto = {
    id: 'expense-1',
    created_by: 'user-1',
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-20T12:00:00Z',
    title: 'Coffee',
    amount_cents: 5,
    date: '2026-09-20',
    payer: 'user-1',
    split_type: 'equal',
    shares: [
      { user: 'user-b', value: 1 },
      { user: 'user-a', value: 1 },
    ],
  }

  await queueExpense(store, payload, 'group-1', async (row) => {
    queued = row
    return 1
  })

  assert.deepEqual(merged[0]?.shares, [
    { user: 'user-b', value: 1, amount_cents: 2 },
    { user: 'user-a', value: 1, amount_cents: 3 },
  ])
  assert.deepEqual(queued?.payload, payload)
})

test('does not enqueue a delayed deletion after its auth epoch changes', async () => {
  let current = true
  let queued = false
  const expense = { ...deletableExpense, groupId: 'group-1' }
  const store = {
    mergeExpenses: async () => {
      current = false
    },
  } as unknown as MoneyStore

  await deleteExpense(
    store,
    expense,
    async () => {
      queued = true
      return 1
    },
    () => current,
  )

  assert.equal(queued, false)
})

const session: UserDto = {
  id: 'user-1',
  email: 'user@example.com',
  first_name: 'User',
  last_name: 'One',
  is_active: true,
  is_staff: false,
  is_superuser: false,
  display_name: 'User One',
}

const validForm: ExpenseForm = {
  title: 'Dinner',
  amountCents: 2450,
  date: '2026-09-20',
  payer: session.id,
  splitType: 'equal',
  icon: null,
  note: '',
  shares: [{ user: session.id, value: 1 }],
}

const deletableExpense: ExpenseDto = {
  id: 'expense-delete',
  created_by: session.id,
  created_at: '2026-09-20T12:00:00Z',
  updated_at: '2026-09-20T12:00:00Z',
  updated_by: session.id,
  title: 'Coffee',
  amount_cents: 500,
  date: '2026-09-20',
  payer: session.id,
  split_type: 'equal',
  icon: null,
  note: '',
  shares: [{ user: session.id, value: 1, amount_cents: 500 }],
  deleted: false,
  created_on_device: null,
}
