import { useEffect, useState } from 'react'

const HEALTH_URL = (import.meta.env.VITE_API_BASE ?? '') + '/api/health'
const MAX_ATTEMPTS = 15
const POLL_INTERVAL_MS = 2500

type WakeUpState = 'checking' | 'awake' | 'timeout'

export function useWakeUp() {
  const [state, setState] = useState<WakeUpState>('checking')
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    let cancelled = false
    let attempt = 0

    async function ping() {
      while (!cancelled && attempt < MAX_ATTEMPTS) {
        try {
          const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(4000) })
          if (res.ok) {
            if (!cancelled) setState('awake')
            return
          }
        } catch {
          // sleeping or unreachable — retry
        }
        attempt++
        if (!cancelled) setAttempts(attempt)
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      if (!cancelled) setState('timeout')
    }

    ping()
    return () => { cancelled = true }
  }, [])

  return { state, attempts }
}
