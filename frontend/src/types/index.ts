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
  canonical_checklist_id?: string
  legacy_checklist_ids?: string[]
  display_name?: string
  normalization_status?: string
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
  'Cartes RC': number
  'Auto/Memo': number
  'Auto/Memo RC': number
  'Auto garanties': number
  'Case Hit': number
  'Case Hit RC': number
  Logoman: number
  'Logoman RC': number
  Rareté: string
  Équipes: string
  Checklists: string
  'Nb Joueurs': number
  'Immaculate Only': number
  Joueurs: string
  'Break Score': number
  'Part du break': number
  'Hot Spot': string
}

export interface BreakCardDetail {
  Spot: string
  Player: string
  Team: string
  'Box Type': string
  Numbering: string
  Category: string
  Checklist: string
  is_multi_ref?: boolean
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
  card_details: BreakCardDetail[]
}

export interface PresetInfo {
  name: string
  checklist_ids: string[]
}

// ---------------------------------------------------------------------------
// Voggt break scouting
// ---------------------------------------------------------------------------

export interface DetectedProduct {
  label: string
  sport_key: string
  checklist_id: string | null
  status: 'mapped' | 'unmapped'
  reason?: string | null
  source?: 'rule' | 'catalog'
  score?: number
  matched_products?: string[]
}

export type BreakCoverage = 'unknown' | 'unmapped' | 'partial' | 'complete'

export interface UnmatchedProduct {
  label: string
  reason?: string
}

export interface VoggtBreakSummary {
  break_id: string
  title: string
  available: number | null
  total: number | null
  cover_url: string | null
  sport_guess: string | null
  coverage: BreakCoverage
  checklist_ids: string[]
  checklist_ids_by_sport: Record<string, string[]>
  detected_products: DetectedProduct[]
  unmatched_products: UnmatchedProduct[]
}

export interface VoggtShowResponse {
  show_id: string
  breaks: VoggtBreakSummary[]
}

export interface BreakSpot {
  id: string
  name: string
  team: string
  price: string | null
  price_eur: number | null
  status: string
  availableQuantity: number | null
  image?: string | null
}

export interface VoggtBreakDetail {
  break_id: string
  show_id: string | null
  title: string
  description: string
  available: number | null
  total: number | null
  sport: string | null
  coverage: BreakCoverage
  checklist_ids: string[]
  checklist_ids_by_sport: Record<string, string[]>
  detected_products: DetectedProduct[]
  unmatched_products: UnmatchedProduct[]
  spots: BreakSpot[]
  grille_total: number
  grille_dispo: number
}

/** Active break context. When set, the app is in "show mode". */
export interface BreakContext {
  showId: string
  detail: VoggtBreakDetail
}

export interface SimulationPreset {
  name: string
  checklist_ids: string[]
  method: string
  extracted_players: string[]
  hits_guaranteed: Record<string, number>
  custom_map?: Record<string, string>
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
  | '📈 Tendances'
  | '🧨 Rookies'
  | '🔍 Analyse Joueur'
  | '🛡️ Analyse Équipe'
  | '📁 Par Fichier'
  | '🧪 Détection Auto/Mem'
  | '⚖️ Comparateur Joueurs'
  | '🧩 Simulation de Break'
  | '📤 Export'
  | '📥 Import Intelligent'
  | '🎲 État du Break'

export interface PlayerSeason {
  season: string
  team: string
  gp: number
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  fg_pct: number
  fg3_pct: number
}

export interface PlayerAwards {
  mvp?: number
  champion?: number
  finals?: number
  finals_mvp?: number
  dpoy?: number
  roy?: number
  allstar?: number
  all_nba?: number
  mip?: number
  sixth_man?: number
  hof?: number
}

export interface PlayerStatsResponse {
  player_id: number
  full_name: string
  is_active: boolean
  photo_url: string
  position: string
  height: string
  weight: string
  country: string
  team: string
  jersey: string
  draft: string | null
  awards: PlayerAwards
  seasons: PlayerSeason[]
}

export interface TeamStanding {
  conference: string
  rank: number
  wins: number
  losses: number
  win_pct: number
  streak: string
  last_10: string
  label: string
}

export interface TeamGame {
  date: string
  matchup: string
  wl: 'W' | 'L'
  pts: number
  reb: number
  ast: number
}

export interface TeamStatsResponse {
  team_id: number
  full_name: string
  abbreviation: string
  logo_url: string
  season: string
  standing: TeamStanding | null
  last_games: TeamGame[]
}

// Category constants (matching backend emoji labels)
export const CATEGORY_LOGOMAN = '🔥 Logoman'
export const CATEGORY_CASE_HIT = '✨ Case Hit'
export const CATEGORY_AUTO_MEM = '💎 Auto/Mem'
export const CATEGORY_BASE_OTHER = '📄 Base/Autre'
