// Verifies the device-local theme selection rule independently of browser rendering.
import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTheme, themeEffects } from './theme.ts'

test('describes the browser effects of an explicit dark theme switch', () => {
  assert.deepEqual(themeEffects('dark'), {
    datasetTheme: 'dark',
    colorScheme: 'dark',
    themeColor: '#14171b',
  })
})

test('prefers the system dark setting when no stored theme exists', () => {
  assert.equal(resolveTheme(null, true), 'dark')
})

test('prefers a stored light theme over the system setting', () => {
  assert.equal(resolveTheme('light', true), 'light')
})
