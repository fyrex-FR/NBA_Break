export interface AuditReport {
  show_id: string
  show_url: string
  breaks_count: number
  breaks: BreakReport[]
}

export interface BreakReport {
  break_id: string
  title: string
  error?: string
  sport?: string
  total_spots: number
  sold_count: number
  dispo_count: number
  auction_unresolved: number
  grille_announced: number
  total_sold: number
  coverage?: string
  detected_products: DetectedProduct[]
  unmatched_products: { label: string; reason?: string }[]
  box_estimates: BoxEstimate[]
  total_box_cost: number
  margin_eur: number | null
  margin_pct: number | null
  inconsistencies: Inconsistency[]
  spots: SpotInfo[]
}

export interface DetectedProduct {
  label: string
  sport_key: string
  checklist_id: string | null
  status: string
  source?: string
  score?: number
}

export interface BoxEstimate {
  product: string
  quantity: number
  box_type: string | null
  unit_price_eur: number | null
  total_price_eur: number | null
  matched_reference: string | null
  confidence: number | null
}

export interface Inconsistency {
  type: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface SpotInfo {
  name: string
  team: string
  price_eur: number | null
  price_source: string
  status: string
  type: string
}
