// Registers the PWA worker and checks for updates when the app becomes usable online.
import { registerSW } from 'virtual:pwa-register'
import { shouldCheckForPwaUpdate } from './pwa-update-rules.ts'

/** Registers the worker and returns a cleanup function for browser event listeners. */
export function startPwaUpdates(): () => void {
  let registration: ServiceWorkerRegistration | undefined
  registerSW({
    immediate: true,
    onRegisteredSW: (_workerUrl, registered) => {
      registration = registered
    },
  })
  const check = () => {
    if (
      shouldCheckForPwaUpdate({
        online: navigator.onLine,
        visibilityState: document.visibilityState,
      })
    ) {
      void registration?.update()
    }
  }
  window.addEventListener('online', check)
  document.addEventListener('visibilitychange', check)
  window.addEventListener('pageshow', check)
  window.addEventListener('focus', check)
  check()
  return () => {
    window.removeEventListener('online', check)
    document.removeEventListener('visibilitychange', check)
    window.removeEventListener('pageshow', check)
    window.removeEventListener('focus', check)
  }
}
