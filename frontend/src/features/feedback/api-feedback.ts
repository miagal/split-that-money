import { ApiError, isTransportFailure } from '../../api/client.ts'

export const GENERIC_ERROR_MESSAGE = 'Could not save changes. Please try again.'
export const AUTH_CONNECTION_MESSAGE = 'You need a connection to sign in.'

/** Returns server-provided field messages so forms can render them beside their controls. */
export function inlineFields(
  error: unknown,
): Record<string, string[]> | undefined {
  if (!(error instanceof ApiError) || !error.fields) return undefined
  const fields = Object.fromEntries(
    Object.entries(error.fields).filter(
      ([name]) => name !== 'non_field_errors',
    ),
  )
  return Object.keys(fields).length > 0 ? fields : undefined
}

/** Converts a failure into one safe toast message, or leaves field-only feedback inline. */
export function toastMessage(error: unknown): string | undefined {
  if (error instanceof ApiError && error.fields?.non_field_errors)
    return GENERIC_ERROR_MESSAGE
  if (inlineFields(error)) return undefined
  if (error instanceof ApiError && error.code !== 'request_failed')
    return error.message
  return GENERIC_ERROR_MESSAGE
}

/** Sign-in never reached the server, so the toast asks for a connection instead of the generic save copy. */
export function authToastMessage(error: unknown): string | undefined {
  if (isTransportFailure(error)) return AUTH_CONNECTION_MESSAGE
  return toastMessage(error)
}

/** Returns member-add feedback in the form that Settings can render without losing field errors. */
export function memberAddFeedback(
  error: unknown,
): { fields: Record<string, string[]> } | { message: string } {
  const fields = inlineFields(error)
  return fields
    ? { fields }
    : { message: toastMessage(error) ?? GENERIC_ERROR_MESSAGE }
}
