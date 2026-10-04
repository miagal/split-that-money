// Gates service-worker update checks on browser connectivity and visibility.
export function shouldCheckForPwaUpdate({
  online,
  visibilityState,
}: {
  online: boolean
  visibilityState: DocumentVisibilityState
}): boolean {
  return online && visibilityState === 'visible'
}
