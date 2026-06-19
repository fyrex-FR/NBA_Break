import type { AuditReport, BreakReport, CompareResponse } from './types'

const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api'

export async function fetchAudit(url: string): Promise<AuditReport> {
  const res = await fetch(`${BASE}/audit?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchCompare(breakA: BreakReport, breakB: BreakReport): Promise<CompareResponse> {
  const res = await fetch(`${BASE}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ break_a: breakA, break_b: breakB }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json()
}
