// Reloads the document through the worker's network-first HTML path.
import {
  withLiveShellFlag,
  withoutLiveShellFlag,
} from '../sw-navigation-rules.ts'

/** Replaces the current document with the same URL flagged for a live shell fetch. */
export function reloadForLiveShell(): void {
  location.replace(withLiveShellFlag(location.href))
}

/** Removes the live-shell flag from the address bar after the flagged navigation. */
export function stripLiveShellFlagFromLocation(): void {
  const current = `${location.pathname}${location.search}${location.hash}`
  const next = withoutLiveShellFlag(location.href)
  if (next !== current) history.replaceState(null, '', next)
}
