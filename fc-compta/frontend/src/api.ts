import type { AuditReport } from './types'

const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api'

export async function fetchAudit(url: string): Promise<AuditReport> {
  const res = await fetch(`${BASE}/audit?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json()
}
