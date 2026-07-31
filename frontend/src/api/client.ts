/**
 * Typed API client for the Checklist Optimizer backend.
 */

import type {
  SportInfo,
  ChecklistsResponse,
  AnalyzeResponse,
  BreakSimulationResponse,
  PresetInfo,
  SimulationPreset,
  PlayerStatsResponse,
  TeamStatsResponse,
  VoggtShowResponse,
  VoggtBreakDetail,
  MarvelAttributionCard,
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
  extracted_players?: string[]
  checklist_hits_guaranteed?: Record<string, number>
}): Promise<BreakSimulationResponse> {
  return fetchJSON('/simulate/break', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export function fetchBreakPlayers(params: {
  sport_key: string
  checklist_ids: string[]
  master_key?: string | null
}): Promise<{ players: string[]; grouped: Record<string, string[]>; stats: Record<string, { cards: number; auto: number }> }> {
  return fetchJSON('/simulate/break/players', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export function fetchSimulationPresets(sportKey: string): Promise<{ presets: SimulationPreset[] }> {
  return fetchJSON(`/simulation/presets/${sportKey}`)
}

export function saveSimulationPreset(sportKey: string, preset: SimulationPreset) {
  return fetchJSON(`/simulation/presets/${sportKey}`, {
    method: 'POST',
    body: JSON.stringify(preset),
  })
}

export function deleteSimulationPreset(sportKey: string, name: string) {
  return fetchJSON(`/simulation/presets/${sportKey}/${encodeURIComponent(name)}`, {
    method: 'DELETE',
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
  checklist_id: string
  current_category: string
  hit_type: string
  is_auto_only: boolean
  is_mem: boolean
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

export function fetchTeamStats(teamName: string): Promise<TeamStatsResponse> {
  return fetchJSON(`/players/teams/${encodeURIComponent(teamName)}/stats`)
}

// ---------------------------------------------------------------------------
// Rookies
// ---------------------------------------------------------------------------

export interface RookieRecord {
  player_name: string
  year_start: number
  year_end: number
  team: string
  draft_pick: number | null
}

export function fetchRookies(sportKey: string): Promise<{ rookies: RookieRecord[] }> {
  return fetchJSON(`/rookies/${sportKey}`)
}

export async function smartPreview(
  sportKey: string,
  payload: { text?: string; file?: File; instructions?: string },
): Promise<{ checklist_name: string; sport_key: string; rows: { Player: string; Team: string; 'Box Type': string; Numbering: string }[]; row_count: number }> {
  const form = new FormData()
  form.append('sport_key', sportKey)
  if (payload.file) form.append('file', payload.file)
  if (payload.text) form.append('text', payload.text)
  if (payload.instructions) form.append('instructions', payload.instructions)
  const res = await fetch(`${BASE}/upload/smart/preview`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export function smartConfirm(params: {
  sport_key: string
  checklist_name: string
  rows: { Player: string; Team: string; 'Box Type': string; Numbering: string }[]
  overwrite?: boolean
}): Promise<{ status: string; checklist_id: string; checklist_name: string; rows: number }> {
  return fetchJSON('/upload/smart/confirm', { method: 'POST', body: JSON.stringify(params) })
}

export function deleteChecklist(sportKey: string, checklistId: string, adminToken: string): Promise<{ status: string; checklist_id: string; rows_removed: number }> {
  return fetchJSON(`/upload/${sportKey}/${encodeURIComponent(checklistId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
  })
}

export function saveOverrides(
  sportKey: string,
  auto?: string[],
  mem?: string[],
  autoMem?: string[],
  caseHit?: string[],
  scopedAuto?: { checklist_id: string; file?: string; box_type: string }[],
  scopedMem?: { checklist_id: string; file?: string; box_type: string }[],
  scopedAutoMem?: { checklist_id: string; file?: string; box_type: string }[],
  scopedCaseHit?: { checklist_id: string; file?: string; box_type: string }[],
): Promise<{ status: string; auto_count: number; mem_count: number; auto_mem_count: number; case_hit_count: number; scoped_auto_count: number; scoped_mem_count: number; scoped_auto_mem_count: number; scoped_case_hit_count: number }> {
  const body: Record<string, unknown> = { sport_key: sportKey }
  if (auto) body.auto = auto
  if (mem) body.mem = mem
  if (autoMem) body.auto_mem = autoMem
  if (caseHit) body.case_hit = caseHit
  if (scopedAuto) body.scoped_auto = scopedAuto
  if (scopedMem) body.scoped_mem = scopedMem
  if (scopedAutoMem) body.scoped_auto_mem = scopedAutoMem
  if (scopedCaseHit) body.scoped_case_hit = scopedCaseHit
  return fetchJSON('/overrides/save', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Marvel attribution overrides
// ---------------------------------------------------------------------------

export function fetchMarvelAttributions(params: {
  checklist_ids: string[]
  master_key?: string | null
  hits_only?: boolean
}): Promise<{ cards: MarvelAttributionCard[]; overrides_count: number }> {
  return fetchJSON('/marvel/attributions/detect', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export function saveMarvelAttributions(items: MarvelAttributionCard[]): Promise<{ status: string; overrides_count: number }> {
  return fetchJSON('/marvel/attributions/save', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

// ---------------------------------------------------------------------------
// Voggt break scouting
// ---------------------------------------------------------------------------

export function fetchVoggtShow(url: string): Promise<VoggtShowResponse> {
  return fetchJSON(`/break/show?url=${encodeURIComponent(url)}`)
}

export function fetchVoggtBreak(breakId: string, showId?: string | null): Promise<VoggtBreakDetail> {
  const params = new URLSearchParams({ break_id: breakId })
  if (showId) params.set('show_id', showId)
  return fetchJSON(`/break/detail?${params.toString()}`)
}
