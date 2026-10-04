// Owns the device-local colour theme and keeps the document token selector in sync.
import { useCallback, useState } from 'react'

export type Theme = 'light' | 'dark'

export const themeStorageKey = 'split-that-money.theme'

/**
 * Describes the document effects for an explicit theme switch.
 *
 * @param theme - The selected supported theme.
 * @returns The document values for that switch.
 */
export function themeEffects(theme: Theme): {
  datasetTheme: Theme
  colorScheme: Theme
  themeColor: string
} {
  return {
    datasetTheme: theme,
    colorScheme: theme,
    themeColor: theme === 'dark' ? '#14171b' : '#ffffff',
  }
}

/**
 * Chooses the active theme from a persisted preference or the operating-system fallback.
 *
 * @param storedTheme - The value read from local storage, if one exists.
 * @param prefersDark - Whether the operating system currently prefers a dark colour scheme.
 * @returns A supported semantic theme name.
 */
export function resolveTheme(
  storedTheme: string | null,
  prefersDark: boolean,
): Theme {
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme
  return prefersDark ? 'dark' : 'light'
}

/**
 * Reads the browser's current theme inputs without making server rendering depend on browser APIs.
 *
 * @returns The selected device theme.
 */
function readTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return resolveTheme(
    window.localStorage.getItem(themeStorageKey),
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
}

/**
 * Applies and persists the device-local theme preference.
 *
 * @param theme - The selected supported theme.
 * @returns Nothing.
 */
export function applyTheme(theme: Theme): void {
  const effects = themeEffects(theme)
  const themeColorMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )

  document.documentElement.dataset.theme = effects.datasetTheme
  document.documentElement.style.colorScheme = effects.colorScheme
  themeColorMeta?.setAttribute('content', effects.themeColor)
  window.localStorage.setItem(themeStorageKey, theme)
}

/**
 * Exposes the current device theme and a setter for account controls.
 *
 * @returns The active theme and its persistent setter.
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState(readTheme)
  const setTheme = useCallback((nextTheme: Theme) => {
    applyTheme(nextTheme)
    setThemeState(nextTheme)
  }, [])

  return { theme, setTheme }
}
