/**
 * Typed API client for the Checklist Optimizer backend.
 */

import type {
  SportInfo,
  ChecklistsResponse,
  AnalyzeResponse,
  BreakSimulationResponse,
  PresetInfo,
  PlayerStatsResponse,
} from '../types'

const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api'

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Sports
// ---------------------------------------------------------------------------

export function fetchSports(): Promise<SportInfo[]> {
  return fetchJSON('/sports')
}

export function fetchChecklists(sportKey: string): Promise<ChecklistsResponse> {
  return fetchJSON(`/sports/${sportKey}/checklists`)
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export function fetchAnalysis(
  sportKey: string,
  checklistIds: string[],
  masterKey?: string | null,
): Promise<AnalyzeResponse> {
  return fetchJSON('/analyze', {
    method: 'POST',
    body: JSON.stringify({
      sport_key: sportKey,
      checklist_ids: checklistIds,
      master_key: masterKey,
    }),
  })
}

// ---------------------------------------------------------------------------
// Break simulation
// ---------------------------------------------------------------------------

export function fetchBreakSimulation(params: {
  sport_key: string
  checklist_ids: string[]
  master_key?: string | null
  method: string
  custom_scope?: string
  custom_map?: Record<string, string>
  custom_spots?: string[]
}): Promise<BreakSimulationResponse> {
  return fetchJSON('/simulate/break', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export function fetchPresets(sportKey: string): Promise<{ presets: PresetInfo[] }> {
  return fetchJSON(`/presets/${sportKey}`)
}

export function savePreset(sportKey: string, name: string, checklistIds: string[]) {
  return fetchJSON(`/presets/${sportKey}`, {
    method: 'POST',
    body: JSON.stringify({ name, checklist_ids: checklistIds }),
  })
}

export function deletePreset(sportKey: string, name: string) {
  return fetchJSON(`/presets/${sportKey}/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Export & Upload
// ---------------------------------------------------------------------------

export function downloadTemplate(): string {
  return `${BASE}/template`
}

export async function exportXlsx(params: {
  sport_key: string
  checklist_ids: string[]
  master_key?: string | null
  include_team?: boolean
  include_player?: boolean
  include_cards?: boolean
  include_auto?: boolean
  include_case?: boolean
  include_logoman?: boolean
  include_base?: boolean
  sort_mode?: string
  team_detail?: string | null
}): Promise<Blob> {
  const res = await fetch(`${BASE}/export/xlsx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`)
  return res.blob()
}

export async function uploadChecklist(
  file: File,
  sportKey: string,
  overwrite: boolean,
): Promise<{ status: string; checklist_id: string; rows: number }> {
  const form = new FormData()
  form.append('file', file)
  form.append('sport_key', sportKey)
  form.append('overwrite', String(overwrite))

  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Upload failed: HTTP ${res.status}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Keyword overrides (detection)
// ---------------------------------------------------------------------------

export interface CardTypeCandidate {
  box_type: string
  norm: string
  hits: number
  file: string
  current_category: string
  is_auto: boolean
  is_case: boolean
}

export interface DetectionResponse {
  candidates: CardTypeCandidate[]
  files: string[]
}

export function fetchDetection(
  sportKey: string,
  checklistIds: string[],
  masterKey?: string | null,
): Promise<DetectionResponse> {
  return fetchJSON('/overrides/detect', {
    method: 'POST',
    body: JSON.stringify({
      sport_key: sportKey,
      checklist_ids: checklistIds,
      master_key: masterKey,
    }),
  })
}

// ---------------------------------------------------------------------------
// Player stats (nba_api)
// ---------------------------------------------------------------------------

export function fetchPlayerStats(playerName: string): Promise<PlayerStatsResponse> {
  return fetchJSON(`/players/${encodeURIComponent(playerName)}/stats`)
}

export function saveOverrides(
  sportKey: string,
  autoMem: string[],
  caseHit: string[],
): Promise<{ status: string; auto_mem_count: number; case_hit_count: number }> {
  return fetchJSON('/overrides/save', {
    method: 'POST',
    body: JSON.stringify({ sport_key: sportKey, auto_mem: autoMem, case_hit: caseHit }),
  })
}
