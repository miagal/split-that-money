// Supplies the last stored public config immediately, then the live copy when it arrives.
import { useEffect, useState } from 'react'
import type { PublicConfigDto } from '../../api/contracts.ts'
import { getPublicConfig, readStoredPublicConfig } from './auth-api.ts'

/**
 * Returns cached public config on the first render and replaces it after a live read.
 *
 * A failed or hanging live read leaves the stored copy in place.
 *
 * @returns The stored or live public configuration, or null when neither exists.
 */
export function usePublicConfig(): PublicConfigDto | null {
  const [stored] = useState(readStoredPublicConfig)
  const [live, setLive] = useState<PublicConfigDto | null>(null)
  useEffect(() => {
    let active = true
    void getPublicConfig()
      .then((next) => {
        if (active) setLive(next)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  return live ?? stored
}
