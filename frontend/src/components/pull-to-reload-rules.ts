// Classifies a touch pull at the top of the app scroll region without owning DOM events.

/** Reports whether a touch pull may take over native panning. */
export function shouldPreventPull({
  startY,
  currentY,
  startScrollTop,
  scrollTop,
}: {
  startY: number
  currentY: number
  startScrollTop: number
  scrollTop: number
}): boolean {
  return startScrollTop === 0 && scrollTop === 0 && currentY > startY
}

/** Returns whether an eligible downward pull has reached the reload threshold. */
export function pullToReloadState({
  startY,
  currentY,
  startScrollTop = 0,
  scrollTop,
  threshold,
}: {
  startY: number
  currentY: number
  startScrollTop?: number
  scrollTop: number
  threshold: number
}): 'idle' | 'pulling' | 'ready' {
  const distance = currentY - startY
  if (!shouldPreventPull({ startY, currentY, startScrollTop, scrollTop }))
    return 'idle'
  return distance >= threshold ? 'ready' : 'pulling'
}
