import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError } from '../../api/client.ts'
import {
  AUTH_CONNECTION_MESSAGE,
  authToastMessage,
  inlineFields,
  memberAddFeedback,
  toastMessage,
} from './api-feedback.ts'

test('keeps duplicate-email feedback inline', () => {
  const error = new ApiError(
    400,
    'email_already_exists',
    'An account with this email already exists. Sign in instead or use another email.',
    {
      email: ['An account with this email already exists.'],
    },
  )

  assert.deepEqual(inlineFields(error), {
    email: ['An account with this email already exists.'],
  })
  assert.equal(toastMessage(error), undefined)
})

test('maps an unstructured network failure to the generic toast', () => {
  assert.equal(
    toastMessage(new TypeError('Failed to fetch')),
    'Could not save changes. Please try again.',
  )
})

test('auth toast maps transport failure to a connection message', () => {
  assert.equal(
    authToastMessage(new TypeError('Failed to fetch')),
    AUTH_CONNECTION_MESSAGE,
  )
  assert.equal(
    authToastMessage(new DOMException('Timed out', 'TimeoutError')),
    AUTH_CONNECTION_MESSAGE,
  )
})

test('generic toast still uses the save wording', () => {
  assert.equal(
    toastMessage(new TypeError('Failed to fetch')),
    'Could not save changes. Please try again.',
  )
})

test('auth toast keeps a non-transport failure on the generic path', () => {
  assert.equal(
    authToastMessage(
      new ApiError(500, 'server_error', 'Something went wrong.'),
    ),
    'Something went wrong.',
  )
})

test('uses a safe backend message for a structured non-field failure', () => {
  assert.equal(
    toastMessage(new ApiError(500, 'server_error', 'Something went wrong.')),
    'Something went wrong.',
  )
})

test('returns no inline fields for an unstructured failure', () => {
  assert.equal(inlineFields(new TypeError('Failed to fetch')), undefined)
})

test('routes non-field API feedback to a generic toast', () => {
  const error = new ApiError(
    400,
    'invalid_request',
    'The request could not be saved.',
    {
      non_field_errors: ['The request could not be saved.'],
    },
  )

  assert.equal(inlineFields(error), undefined)
  assert.equal(toastMessage(error), 'Could not save changes. Please try again.')
})

test('member-add feedback keeps email validation inline', () => {
  const error = new ApiError(
    400,
    'already_member',
    'That account is already a member.',
    {
      email: ['That account is already a member.'],
    },
  )

  assert.deepEqual(memberAddFeedback(error), {
    fields: { email: ['That account is already a member.'] },
  })
})
