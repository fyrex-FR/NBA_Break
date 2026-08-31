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

export type PollPreference = 'value' | 'guarantee' | 'either'

export interface PollOption {
  checklist_id: string
  checklist_name: string
  display_name?: string
  year: string
}

export interface PollOptionsResponse {
  poll_id: string
  sport_key: string
  options: PollOption[]
}

export interface PollResultsResponse {
  voters: number
  years: Record<string, number>
  checklists: Record<string, number>
  preferences: Record<PollPreference, number>
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
  'Hit Type'?: string
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
  auto: number
  mem: number
  auto_mem: number
  hit_total: number
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
  Auto?: number
  'Auto RC'?: number
  Memo?: number
  'Memo RC'?: number
  'Auto/Memo': number
  'Auto/Memo RC': number
  'Total Hits'?: number
  'Total Hits RC'?: number
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
  // Colonnes odds — présentes uniquement quand une configuration est sélectionnée
  // et qu'une feuille d'odds existe pour les checklists analysées.
  'Part attendue'?: number
  'Break Score (odds)'?: number
  /** Seulement si `packs_per_box` est renseigné dans la feuille d'odds. */
  'Hits / box'?: number
}

export interface BreakCardDetail {
  Spot: string
  Player: string
  Team: string
  'Box Type': string
  Numbering: string
  Category: string
  'Hit Type'?: string
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
    /** Part de la masse de probabilité rattachée à des cartes de la checklist (0 → 1). */
    odds_coverage?: number
  }
  player_map: Record<string, string[]>
  card_details: BreakCardDetail[]
}

export interface PresetInfo {
  name: string
  checklist_ids: string[]
}

// ---------------------------------------------------------------------------
// Odds Topps
//
// Une feuille d'odds décrit, pour un produit, la matrice `ligne de carte ×
// configuration` publiée par Topps. Elle est déposée sur R2 hors de l'app
// (voir docs/ODDS_FILE_FORMAT.md) et jointe à la volée aux checklists via le
// `Box Type`. Tout est optionnel : sans feuille, l'app se comporte comme avant.
// ---------------------------------------------------------------------------

/** Canal de distribution d'une configuration. */
export type OddsChannel = 'hobby' | 'retail' | 'special'

/**
 * Une configuration du produit (une colonne du PDF Topps).
 * `group` replie les variantes régionales : Value Box EA/SE/CEE → group "value".
 */
export interface OddsConfig {
  key: string
  label: string
  channel: OddsChannel
  group: string
  packs_per_box?: number
}

/** Une ligne de la matrice. `odds` = le N de "1:N", par pack ; clé absente = indisponible. */
export interface OddsRow {
  label: string
  set?: string
  parallel?: string
  odds: Record<string, number>
}

export interface OddsSheet {
  version: number
  sport: string
  checklist_id: string
  product_label?: string
  source?: string
  updated_at?: string
  configs: OddsConfig[]
  rows: OddsRow[]
}

/** Meilleures odds trouvées pour un groupe de configurations. */
export interface OddsBest {
  odds: number
  config_key: string
  group?: string
}

/** Badge de disponibilité — un seul par set, exclusif. */
export type OddsAvailabilityBadge =
  | 'hobby_only'
  | 'hobby_delight'
  | 'retail_only'
  | 'sapphire_only'
  | 'delight_only'
  | 'fanatics_only'
  | 'promo_only'
  | 'partout'

/** Badge de rareté, dérivé des meilleures odds toutes configs confondues. */
export type OddsRarityBadge = 'sp' | 'ssp' | 'case_hit'

/**
 * Un badge tel que renvoyé par l'API : soit un code de disponibilité, soit un
 * code de rareté, soit la forme dynamique `best:<group>`.
 */
export type OddsBadgeCode = OddsAvailabilityBadge | OddsRarityBadge | string

/** Une famille de parallèles cantonnée à certaines configurations (ex. Wave → Hobby). */
export interface OddsExclusiveParallelFamily {
  family: string
  groups: string[]
}

/** Synthèse par set d'odds — c'est ce que consomment la vue Odds et les pastilles. */
export interface OddsSetSummary {
  set: string
  rows: OddsRow[]
  groups_present: string[]
  best_by_group: Record<string, OddsBest>
  best_overall: OddsBest | null
  availability_badge: OddsAvailabilityBadge | null
  rarity_badge: OddsRarityBadge | null
  badges: OddsBadgeCode[]
  exclusive_parallel_families: OddsExclusiveParallelFamily[]
}

export interface OddsIndexResponse {
  sport_key: string
  checklist_ids: string[]
}

export interface OddsSheetResponse {
  sheet: OddsSheet
  set_summaries: Record<string, OddsSetSummary>
  configs: OddsConfig[]
}

/** Entrée de la map de badges, indexée par `"<checklist_id>::<Box Type>"`. */
export interface OddsBadgeEntry {
  set: string
  badges: OddsBadgeCode[]
  best_by_group: Record<string, OddsBest>
  available_groups: string[]
}

export interface OddsBadgesResponse {
  badges: Record<string, OddsBadgeEntry>
}

/** État du rattachement Box Type ↔ set d'odds pour une checklist. */
export interface OddsMappingChecklist {
  checklist_id: string
  has_odds: boolean
  /** Box Type → set root, tel que résolu (auto + corrections manuelles). */
  resolved: Record<string, string>
  /** Box Types qu'on n'a pas su rattacher. */
  unresolved: string[]
  available_sets: string[]
}

export interface OddsMappingDetectResponse {
  sport_key: string
  checklists: OddsMappingChecklist[]
}

export interface OddsMappingSaveResponse {
  status: string
  sport_key: string
  checklist_id: string
  entries_count: number
}

/** Valeur spéciale de mapping : Box Type volontairement non rattaché. */
export const ODDS_MAPPING_NONE = '__none__'

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
  price_source?: 'fixed' | 'final' | 'live' | 'start'
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
  auction_unresolved?: number
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
  | '🦸 Attribution Marvel'
  | '⚖️ Comparateur Joueurs'
  | '🧩 Simulation de Break'
  | '📤 Export'
  | '📥 Import Intelligent'
  | '🎲 État du Break'
  | '🎯 Odds'
  | '🔗 Mapping Odds'

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
export const CATEGORY_AUTO = '✍️ Auto'
export const CATEGORY_MEM = '🧵 Memo'
export const CATEGORY_BASE_OTHER = '📄 Base/Autre'

export const HIT_TYPE_AUTO = 'auto'
export const HIT_TYPE_MEM = 'mem'
export const HIT_TYPE_AUTO_MEM = 'auto_mem'

export interface MarvelAttributionCard {
  key: string
  checklist_id: string
  checklist_name: string
  number: string
  box_type: string
  hits: number
  category: string
  hit_type: string
  source_player: string
  source_team: string
  source_kind: string
  source_label: string
  player: string
  team: string
  note: string
  is_overridden: boolean
}
