/**
 * Registre unique de navigation.
 * Les ViewName historiques restent les identifiants internes (les vues
 * s'appellent entre elles avec), le registre leur associe libellé, icône,
 * section, slug d'URL et description de page.
 */

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Gem, Users, Sparkles, TrendingUp, User, Shield, Scale,
  Dices, Target, Radio, Download, BookOpen, FileText, Wand2, FlaskConical, Link2, Drama,
} from 'lucide-react'
import type { ViewName } from './types'

export type NavSectionId = 'analyse' | 'fiches' | 'break' | 'donnees' | 'admin'

export interface NavItem {
  view: ViewName
  slug: string
  label: string
  description: string
  icon: LucideIcon
  section: NavSectionId
  /** Clé `enabled_views` côté backend — masque l'entrée si le sport la désactive. */
  enabledKey?: string
  /** La vue a besoin d'une analyse chargée. */
  needsAnalysis: boolean
  /** Vues regroupées sous la même entrée de menu (onglets internes). */
  aliases?: ViewName[]
  /** Entrée affichée uniquement pour certains sports. */
  sports?: string[]
}

export const NAV_SECTIONS: { id: NavSectionId; label: string; collapsible?: boolean }[] = [
  { id: 'analyse', label: 'Analyse' },
  { id: 'fiches', label: 'Fiches' },
  { id: 'break', label: 'Break' },
  { id: 'donnees', label: 'Données' },
  { id: 'admin', label: 'Outils admin', collapsible: true },
]

export const NAV_ITEMS: NavItem[] = [
  {
    view: '🌍 Vue Globale', slug: 'overview', label: "Vue d'ensemble", icon: LayoutDashboard, section: 'analyse',
    description: 'Volumes, répartition des hits et classements de la sélection.', needsAnalysis: true,
  },
  {
    view: '💎 Autos & Patchs', slug: 'hits', label: 'Hits premium', icon: Gem, section: 'analyse', enabledKey: 'autos_patchs',
    description: 'Autos, memorabilia, Logoman et case hits : qui concentre les cartes qui comptent.', needsAnalysis: true,
    aliases: ['🔥 Logoman', '✨ Case Hits'],
  },
  {
    view: '👥 Multi-Joueurs', slug: 'multi', label: 'Multi-joueurs', icon: Users, section: 'analyse', enabledKey: 'multi_players',
    description: 'Cartes partagées entre plusieurs joueurs (dual, triple, quad…).', needsAnalysis: true,
  },
  {
    view: '🧨 Rookies', slug: 'rookies', label: 'Rookies', icon: Sparkles, section: 'analyse', enabledKey: 'rookies',
    description: 'Rookie cards présentes dans la sélection.', needsAnalysis: true,
  },
  {
    view: '📈 Tendances', slug: 'trends', label: 'Tendances', icon: TrendingUp, section: 'analyse', enabledKey: 'trends',
    description: "Évolution des volumes d'une saison à l'autre.", needsAnalysis: true,
  },

  {
    view: '🔍 Analyse Joueur', slug: 'player', label: 'Joueur', icon: User, section: 'fiches', enabledKey: 'player_detail',
    description: 'Toutes les cartes d’un joueur, par catégorie et par produit.', needsAnalysis: true,
  },
  {
    view: '🛡️ Analyse Équipe', slug: 'team', label: 'Équipe', icon: Shield, section: 'fiches', enabledKey: 'team_detail',
    description: 'Roster, hits et cartes d’une équipe.', needsAnalysis: true,
  },
  {
    view: '⚖️ Comparateur Joueurs', slug: 'compare', label: 'Comparateur', icon: Scale, section: 'fiches', enabledKey: 'comparator',
    description: 'Mets plusieurs joueurs côte à côte.', needsAnalysis: true,
  },

  {
    view: '🎲 État du Break', slug: 'live', label: 'Break en cours', icon: Radio, section: 'break',
    description: 'Spots vendus et restants du break Voggt chargé.', needsAnalysis: false,
  },
  {
    view: '🧩 Simulation de Break', slug: 'simulation', label: 'Simulation', icon: Dices, section: 'break', enabledKey: 'break_simulation',
    description: 'Valeur de chaque spot selon la méthode de break.', needsAnalysis: true,
  },
  {
    view: '🎯 Odds', slug: 'odds', label: 'Odds', icon: Target, section: 'break', enabledKey: 'odds',
    description: 'Probabilités Topps par configuration de box.', needsAnalysis: true,
  },
  {
    view: '📤 Export', slug: 'export', label: 'Export', icon: Download, section: 'break', enabledKey: 'export',
    description: 'Fichier Excel personnalisé de la sélection.', needsAnalysis: true,
  },

  {
    view: '📚 Checklist Beckett', slug: 'beckett', label: 'Checklist', icon: BookOpen, section: 'donnees', enabledKey: 'checklist_browser',
    description: 'Parcours la checklist complète, carte par carte.', needsAnalysis: true,
  },
  {
    view: '📁 Par Fichier', slug: 'files', label: 'Par fichier', icon: FileText, section: 'donnees', enabledKey: 'file_analysis',
    description: 'Répartition des cartes par checklist source.', needsAnalysis: true,
  },
  {
    view: '📥 Import Intelligent', slug: 'import', label: 'Import IA', icon: Wand2, section: 'donnees', enabledKey: 'smart_import',
    description: 'Transforme un PDF ou une capture de checklist en fichier exploitable.', needsAnalysis: false,
  },

  {
    view: '🧪 Détection Auto/Mem', slug: 'detection', label: 'Détection Auto/Mem', icon: FlaskConical, section: 'admin', enabledKey: 'detection',
    description: 'Corrige la classification des card types (auto, memo, case hit).', needsAnalysis: true,
  },
  {
    view: '🔗 Mapping Odds', slug: 'odds-mapping', label: 'Mapping odds', icon: Link2, section: 'admin', enabledKey: 'odds_mapping',
    description: 'Associe les lignes de la feuille d’odds aux card types.', needsAnalysis: true,
  },
  {
    view: '🦸 Attribution Marvel', slug: 'marvel', label: 'Attribution Marvel', icon: Drama, section: 'admin', enabledKey: 'marvel_attribution',
    description: 'Rattache les personnages Marvel à leurs univers.', needsAnalysis: true,
  },
]

const BY_VIEW = new Map<ViewName, NavItem>()
for (const item of NAV_ITEMS) {
  BY_VIEW.set(item.view, item)
  for (const alias of item.aliases ?? []) BY_VIEW.set(alias, item)
}

const SLUG_TO_VIEW = new Map<string, ViewName>([
  ...NAV_ITEMS.map((i) => [i.slug, i.view] as const),
  ['logoman', '🔥 Logoman'],
  ['case-hits', '✨ Case Hits'],
])

const VIEW_TO_SLUG = new Map<ViewName, string>([
  ...NAV_ITEMS.map((i) => [i.view, i.slug] as const),
  ['🔥 Logoman', 'logoman'],
  ['✨ Case Hits', 'case-hits'],
])

export function navItemFor(view: ViewName): NavItem | undefined {
  return BY_VIEW.get(view)
}

export function slugForView(view: ViewName): string {
  return VIEW_TO_SLUG.get(view) ?? 'overview'
}

export function viewForSlug(slug: string | null): ViewName | null {
  if (!slug) return null
  return SLUG_TO_VIEW.get(slug) ?? null
}

export function sectionLabel(id: NavSectionId): string {
  return NAV_SECTIONS.find((s) => s.id === id)?.label ?? ''
}

export function isItemEnabled(item: NavItem, enabledViews: Record<string, boolean> | undefined, sport: string): boolean {
  if (item.sports && !item.sports.includes(sport)) return false
  if (!item.enabledKey || !enabledViews) return true
  return enabledViews[item.enabledKey] !== false
}
