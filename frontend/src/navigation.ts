/**
 * Registre unique de navigation.
 *
 * La navigation est organisée par objets : quatre destinations (Collections,
 * Équipes, Joueurs, Break), chacune avec ses onglets. Les outils (export,
 * import) et l'admin vivent dans un menu secondaire.
 *
 * Les ViewName historiques restent les identifiants internes (les vues
 * s'appellent entre elles avec) ; le registre leur associe destination,
 * libellé d'onglet, icône, slug d'URL et description.
 */

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Gem, Users, TrendingUp, User, Shield, Scale, Sparkles,
  Dices, Target, Radio, Download, BookOpen, FileText, Wand2, FlaskConical, Link2, Drama, Package, Library, PenLine, LayoutGrid, Thermometer, Flag,
} from 'lucide-react'
import type { ViewName } from './types'

export type DestinationId = 'collections' | 'teams' | 'players' | 'break'
/** `frenchies` : entrée à part du panneau latéral, sous les quatre destinations. */
export type NavGroupId = DestinationId | 'frenchies' | 'tools' | 'admin'

export interface Destination {
  id: DestinationId
  label: string
  description: string
  icon: LucideIcon
  defaultView: ViewName
}

export const DESTINATIONS: Destination[] = [
  {
    id: 'collections', label: 'Collections', icon: Library, defaultView: '🌡️ Spots',
    description: 'Ce que contiennent les collections ouvertes : hits, boîte, checklist, odds.',
  },
  {
    id: 'teams', label: 'Équipes', icon: Shield, defaultView: '🛡️ Analyse Équipe',
    description: 'Roster, hits et cartes d’une équipe dans les collections ouvertes.',
  },
  {
    id: 'players', label: 'Joueurs', icon: User, defaultView: '🔍 Analyse Joueur',
    description: 'Toutes les cartes d’un joueur, les rookies, et la comparaison.',
  },
  {
    id: 'break', label: 'Break', icon: Radio, defaultView: '🎲 État du Break',
    description: 'Le break Voggt en cours et la valeur de chaque spot.',
  },
]

export interface NavItem {
  view: ViewName
  slug: string
  /** Libellé complet (palette, menu outils). */
  label: string
  /** Libellé court de l'onglet dans sa destination. */
  tab: string
  description: string
  icon: LucideIcon
  group: NavGroupId
  /** Onglet rangé dans le menu « Plus » de sa destination. */
  overflow?: boolean
  /** Clé `enabled_views` côté backend — masque l'entrée si le sport la désactive. */
  enabledKey?: string
  /** La vue a besoin d'une analyse (au moins une collection ouverte). */
  needsAnalysis: boolean
  /** Vues regroupées sous la même entrée (onglets internes). */
  aliases?: ViewName[]
  /** Entrée affichée uniquement pour certains sports. */
  sports?: string[]
}

export const NAV_ITEMS: NavItem[] = [
  // ── Collections ──
  {
    view: '🌡️ Spots', slug: 'spots', label: 'Spots', tab: 'Spots', icon: Thermometer, group: 'collections',
    description: 'Indice climat de chaque équipe ou joueur : quels spots sont chauds, lesquels sont froids, et pourquoi.', needsAnalysis: true,
  },
  {
    view: '🌍 Vue Globale', slug: 'overview', label: 'Chiffres de la sélection', tab: 'Chiffres', icon: LayoutDashboard, group: 'collections', overflow: true,
    description: 'Volumes, répartition des hits et classements des collections ouvertes.', needsAnalysis: true,
  },
  {
    view: '💎 Autos & Patchs', slug: 'hits', label: 'Hits premium', tab: 'Hits', icon: Gem, group: 'collections', enabledKey: 'autos_patchs',
    description: 'Autos, memorabilia, Logoman et case hits : qui concentre les cartes qui comptent.', needsAnalysis: true,
    aliases: ['🔥 Logoman', '✨ Case Hits'],
  },
  {
    view: '📦 Guide des boîtes', slug: 'boxes', label: 'Guide des boîtes', tab: 'Boîte', icon: Package, group: 'collections', sports: ['nba'],
    description: 'Formats de boîte, contenu moyen, autos garantis, prix et dates de sortie.', needsAnalysis: true,
  },
  {
    view: '📚 Checklist Beckett', slug: 'beckett', label: 'Checklist', tab: 'Checklist', icon: BookOpen, group: 'collections', enabledKey: 'checklist_browser',
    description: 'Parcours la checklist complète, carte par carte.', needsAnalysis: true,
  },
  {
    view: '🎯 Odds', slug: 'odds', label: 'Odds', tab: 'Odds', icon: Target, group: 'collections', enabledKey: 'odds',
    description: 'Probabilités Topps par configuration de box.', needsAnalysis: true,
  },
  {
    view: '👥 Multi-Joueurs', slug: 'multi', label: 'Multi-joueurs', tab: 'Multi-joueurs', icon: Users, group: 'collections', enabledKey: 'multi_players', overflow: true,
    description: 'Cartes partagées entre plusieurs joueurs (dual, triple, quad…).', needsAnalysis: true,
  },
  {
    view: '📁 Par Fichier', slug: 'files', label: 'Par fichier', tab: 'Par fichier', icon: FileText, group: 'collections', enabledKey: 'file_analysis', overflow: true,
    description: 'Répartition des cartes par checklist source.', needsAnalysis: true,
  },
  {
    view: '📈 Tendances', slug: 'trends', label: 'Tendances', tab: 'Tendances', icon: TrendingUp, group: 'collections', enabledKey: 'trends', overflow: true,
    description: "Évolution des volumes d'une saison à l'autre.", needsAnalysis: true,
  },

  // ── Équipes ──
  {
    view: '🛡️ Analyse Équipe', slug: 'team', label: 'Équipe', tab: 'Équipe', icon: Shield, group: 'teams', enabledKey: 'team_detail',
    description: 'Roster, hits et cartes d’une équipe.', needsAnalysis: true,
  },

  {
    view: '🏟️ Équipes catalogue', slug: 'teams-all', label: 'Équipes, toutes collections', tab: 'Toutes collections', icon: LayoutGrid, group: 'teams',
    description: 'Pour une équipe, les collections où elle a le plus de cartes qui comptent.', needsAnalysis: false,
  },

  // ── Joueurs ──
  {
    view: '🔍 Analyse Joueur', slug: 'player', label: 'Joueur', tab: 'Fiche', icon: User, group: 'players', enabledKey: 'player_detail',
    description: 'Toutes les cartes d’un joueur, par catégorie et par produit.', needsAnalysis: true,
  },
  {
    view: '🧨 Rookies', slug: 'rookies', label: 'Rookies', tab: 'Rookies', icon: Sparkles, group: 'players', enabledKey: 'rookies',
    description: 'Rookie cards présentes dans les collections ouvertes.', needsAnalysis: true,
  },
  {
    view: '🇫🇷 Frenchies', slug: 'frenchies', label: 'Frenchies', tab: 'Frenchies', icon: Flag, group: 'frenchies', sports: ['nba'],
    description: 'Les joueurs français : leurs autos, memo et case hits, et les équipes qui les portent.', needsAnalysis: false,
  },
  {
    view: '⚖️ Comparateur Joueurs', slug: 'compare', label: 'Comparateur', tab: 'Comparer', icon: Scale, group: 'players', enabledKey: 'comparator',
    description: 'Mets plusieurs joueurs côte à côte.', needsAnalysis: true,
  },

  {
    view: '🖊️ Qui a signé', slug: 'signed', label: 'Qui a signé ?', tab: 'Toutes collections', icon: PenLine, group: 'players',
    description: 'Tape un nom : toutes les collections où le joueur a des autos, memo et case hits.', needsAnalysis: false,
  },

  // ── Break ──
  {
    view: '🎲 État du Break', slug: 'live', label: 'Break en cours', tab: 'En cours', icon: Radio, group: 'break',
    description: 'Spots vendus et restants du break Voggt chargé.', needsAnalysis: false,
  },
  {
    view: '🧩 Simulation de Break', slug: 'simulation', label: 'Simulation', tab: 'Simulation', icon: Dices, group: 'break', enabledKey: 'break_simulation',
    description: 'Valeur de chaque spot selon la méthode de break.', needsAnalysis: true,
  },

  // ── Outils ──
  {
    view: '📤 Export', slug: 'export', label: 'Export Excel', tab: 'Export', icon: Download, group: 'tools', enabledKey: 'export',
    description: 'Fichier Excel personnalisé des collections ouvertes.', needsAnalysis: true,
  },
  {
    view: '📥 Import Intelligent', slug: 'import', label: 'Import IA', tab: 'Import IA', icon: Wand2, group: 'tools', enabledKey: 'smart_import',
    description: 'Transforme un PDF ou une capture de checklist en fichier exploitable.', needsAnalysis: false,
  },

  // ── Admin ──
  {
    view: '🧪 Détection Auto/Mem', slug: 'detection', label: 'Détection Auto/Mem', tab: 'Détection', icon: FlaskConical, group: 'admin', enabledKey: 'detection',
    description: 'Corrige la classification des card types (auto, memo, case hit).', needsAnalysis: true,
  },
  {
    view: '🔗 Mapping Odds', slug: 'odds-mapping', label: 'Mapping odds', tab: 'Mapping odds', icon: Link2, group: 'admin', enabledKey: 'odds_mapping',
    description: 'Associe les lignes de la feuille d’odds aux card types.', needsAnalysis: true,
  },
  {
    view: '🦸 Attribution Marvel', slug: 'marvel', label: 'Attribution Marvel', tab: 'Marvel', icon: Drama, group: 'admin', enabledKey: 'marvel_attribution',
    description: 'Rattache les personnages Marvel à leurs univers.', needsAnalysis: true,
  },
]

export const GROUP_LABELS: Record<NavGroupId, string> = {
  collections: 'Collections', teams: 'Équipes', players: 'Joueurs', break: 'Break', frenchies: 'Frenchies', tools: 'Outils', admin: 'Outils admin',
}

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

export function groupLabel(id: NavGroupId): string {
  return GROUP_LABELS[id]
}

export function destinationFor(view: ViewName): Destination | undefined {
  const group = navItemFor(view)?.group
  return DESTINATIONS.find((d) => d.id === group)
}

/** Onglets visibles d'une destination (ou d'un groupe). */
export function itemsOf(group: NavGroupId, enabledViews: Record<string, boolean> | undefined, sport: string): NavItem[] {
  return NAV_ITEMS.filter((i) => i.group === group && isItemEnabled(i, enabledViews, sport))
}

export function isItemEnabled(item: NavItem, enabledViews: Record<string, boolean> | undefined, sport: string): boolean {
  if (item.sports && !item.sports.includes(sport)) return false
  if (!item.enabledKey || !enabledViews) return true
  return enabledViews[item.enabledKey] !== false
}
