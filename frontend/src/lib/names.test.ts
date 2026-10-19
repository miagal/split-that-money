// Verifies that member labels remain unique while retaining the shortest useful name.
import assert from 'node:assert/strict'
import test from 'node:test'
import { compactNames, fullNames } from './names.ts'

test('uses a first name when it is unique', () => {
  assert.deepEqual(
    compactNames([
      {
        id: '1',
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
      },
      {
        id: '2',
        first_name: 'Grace',
        last_name: 'Hopper',
        email: 'grace@example.com',
      },
    ]),
    { '1': 'Ada', '2': 'Grace' },
  )
})

test('progresses same-first-name members through surname initial, full name, then email', () => {
  assert.deepEqual(
    compactNames([
      {
        id: '1',
        first_name: 'Alex',
        last_name: 'Brown',
        email: 'alex.brown@example.com',
      },
      {
        id: '2',
        first_name: 'Alex',
        last_name: 'Stone',
        email: 'alex.stone.one@example.com',
      },
      {
        id: '3',
        first_name: 'Alex',
        last_name: 'Smith',
        email: 'alex.smith@example.com',
      },
      {
        id: '4',
        first_name: 'Alex',
        last_name: 'Stone',
        email: 'alex.stone.two@example.com',
      },
    ]),
    {
      '1': 'Alex B.',
      '2': 'Alex Stone (alex.stone.one@example.com)',
      '3': 'Alex Smith',
      '4': 'Alex Stone (alex.stone.two@example.com)',
    },
  )
})

test('labels the current user as You after compact names are resolved', () => {
  assert.deepEqual(
    compactNames(
      [
        {
          id: 'me',
          first_name: 'Ada',
          last_name: 'Lovelace',
          email: 'ada@example.com',
        },
        {
          id: '2',
          first_name: 'Grace',
          last_name: 'Hopper',
          email: 'grace@example.com',
        },
      ],
      { currentUserId: 'me' },
    ),
    { me: 'You', '2': 'Grace' },
  )
})

test('keeps a unique full name and adds email in parentheses only when it collides', () => {
  assert.deepEqual(
    fullNames([
      {
        id: '1',
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
      },
      {
        id: '2',
        first_name: 'Sam',
        last_name: 'Miller',
        email: 'sam@example.com',
      },
      {
        id: '3',
        first_name: 'Sam',
        last_name: 'Miller',
        email: 'sam.two@example.com',
      },
    ]),
    {
      '1': 'Ada Lovelace',
      '2': 'Sam Miller (sam@example.com)',
      '3': 'Sam Miller (sam.two@example.com)',
    },
  )
})

test('still disambiguates others when the current user shares their first name', () => {
  assert.deepEqual(
    compactNames(
      [
        {
          id: 'me',
          first_name: 'Alex',
          last_name: 'Brown',
          email: 'me@example.com',
        },
        {
          id: '2',
          first_name: 'Alex',
          last_name: 'Stone',
          email: 'other@example.com',
        },
      ],
      { currentUserId: 'me' },
    ),
    { me: 'You', '2': 'Alex S.' },
  )
})
