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
  const [config, setConfig] = useState(readStoredPublicConfig)
  useEffect(() => {
    let active = true
    void getPublicConfig()
      .then((live) => {
        if (active) setConfig(live)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  return config
}
