import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const HEALTH_URL = API_BASE + '/api/health'
const MAX_ATTEMPTS = 15
const POLL_INTERVAL_MS = 2500

// En local (pas de VITE_API_BASE), le backend tourne déjà — pas besoin de wake-up
const IS_REMOTE = API_BASE.startsWith('http')

type WakeUpState = 'checking' | 'awake' | 'timeout'

export function useWakeUp() {
  const [state, setState] = useState<WakeUpState>(IS_REMOTE ? 'checking' : 'awake')
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    if (!IS_REMOTE) return
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
