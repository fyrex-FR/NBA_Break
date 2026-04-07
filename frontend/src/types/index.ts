// ---------------------------------------------------------------------------
// API Types
// ---------------------------------------------------------------------------

export interface SportInfo {
  key: string
  label: string
  page_icon: string
}

export interface ChecklistInfo {
  checklist_id: string
  checklist_name: string
  year: string
  rows: number
}

export interface ChecklistsResponse {
  checklists: ChecklistInfo[]
  master_key: string | null
  source_mode: 'master' | 'legacy' | 'none'
}

export interface CardRecord {
  Player: string
  Team: string
  'Box Type': string
  Numbering: string
  Hits: number
  File: string
  Year: string
  Product: string
  checklist_id: string
  checklist_name: string
  Category: string
  'Rarity Mult': number
  Score: number
  Sport: string
}

export interface RankingRecord {
  Player?: string
  Team?: string
  Hits: number
}

export interface CategorySummary {
  logoman: number
  case_hit: number
  auto_mem: number
  base_other: number
}

export interface AnalysisMetadata {
  total_rows: number
  unique_teams: number
  unique_players: number
  checklists_count: number
  collapsed_multi_rows: number
  sport_key: string
  sport_label: string
}

export interface AnalyzeResponse {
  cards: CardRecord[]
  player_rankings: RankingRecord[]
  team_rankings: RankingRecord[]
  category_summary: CategorySummary
  enabled_views: Record<string, boolean>
  metadata: AnalysisMetadata
}

export interface BreakSpotRecord {
  Spot: string
  Cartes: number
  'Auto/Memo': number
  'Case Hit': number
  Logoman: number
  Rareté: string
  Équipes: string
  Checklists: string
  'Break Score': number
  'Part du break': number
  'Hot Spot': string
}

export interface BreakSimulationResponse {
  spots: BreakSpotRecord[]
  summary: {
    total_cartes: number
    total_break_score: number
    hot_spots: number
    hot_threshold_pct: number
  }
  player_map: Record<string, string[]>
}

export interface PresetInfo {
  name: string
  checklist_ids: string[]
}

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export type ViewCategory = '📊 Analyse' | '🔍 Détails' | '🛠️ Outils' | '🎲 Break'

export type ViewName =
  | '🌍 Vue Globale'
  | '💎 Autos & Patchs'
  | '🔥 Logoman'
  | '✨ Case Hits'
  | '👥 Multi-Joueurs'
  | '🧠 Value Picks'
  | '🧨 Rookies'
  | '🔍 Analyse Joueur'
  | '🛡️ Analyse Équipe'
  | '📁 Par Fichier'
  | '🧪 Détection Auto/Mem'
  | '⚖️ Comparateur Joueurs'
  | '💸 Cost par Pick'
  | '⚡ Live Mode'
  | '🧩 Simulation de Break'
  | '📤 Export'

// Category constants (matching backend emoji labels)
export const CATEGORY_LOGOMAN = '🔥 Logoman'
export const CATEGORY_CASE_HIT = '✨ Case Hit'
export const CATEGORY_AUTO_MEM = '💎 Auto/Mem'
export const CATEGORY_BASE_OTHER = '📄 Base/Autre'
