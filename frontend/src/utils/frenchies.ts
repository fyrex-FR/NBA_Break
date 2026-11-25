import type { CardRecord } from '../types'

// Liste volontairement limitée et vérifiable. Ajouter des noms complets, jamais des noms seuls.
// NBA, effectifs français 2025-26 : https://www.nba.com/news/2025-26-international-players-opening-night
// NBA, joueurs historiques : https://www.nba.com/news/how-victor-wembanyama-and-france-are-starting-an-international-hoops-takeover
export const FRENCH_PLAYERS = [
  'Zaccharie Risacher', 'Nolan Traoré', 'Tidjane Salaün', 'Moussa Diabaté',
  'Noa Essengue', 'Nicolas Batum', 'Joan Beringer', 'Rudy Gobert',
  'Guerschon Yabusele', 'Mohamed Diawara', 'Pacôme Dadiet', 'Ousmane Dieng',
  'Rayan Rupert', 'Sidy Cissoko', 'Maxime Raynaud', 'Victor Wembanyama',
  'Alex Sarr', 'Bilal Coulibaly', 'Noah Penda', 'Tony Parker', 'Boris Diaw',
  'Evan Fournier', 'Ronny Turiaf', 'Joakim Noah',
] as const

const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
const names = new Map<string, string>(FRENCH_PLAYERS.map((name) => [normalize(name), name]))
const order = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true })

export type FrenchFamily = 'none' | 'auto' | 'mem' | 'auto_mem' | 'unknown'
export const FAMILY_LABELS: Record<FrenchFamily, string> = { none: 'Bases / Inserts', auto: 'Auto', mem: 'Memo', auto_mem: 'Auto / Memo', unknown: 'Type non renseigné' }
const families: FrenchFamily[] = ['none', 'auto', 'mem', 'auto_mem', 'unknown']
export interface FrenchColumn { key: string; name: string; family: FrenchFamily }

export interface FrenchPlayerRow {
  name: string
  sets: Set<string>
  auto: number
  memo: number
}
export interface FrenchSeries {
  id: string
  name: string
  columns: FrenchColumn[]
  players: FrenchPlayerRow[]
}

/** Une ligne de checklist contribue à chaque joueur présent, une fois par joueur. */
export function buildFrenchies(cards: CardRecord[]): FrenchSeries[] {
  const series = new Map<string, { id: string; name: string; columns: Map<string, FrenchColumn>; players: Map<string, FrenchPlayerRow> }>()
  for (const card of cards) {
    const matched = new Set((card.Player || '').split('/').map((name) => names.get(normalize(name))).filter((name): name is string => !!name))
    const id = card.checklist_id || card.checklist_name || card.File || 'inconnue'
    let group = series.get(id)
    if (!group) {
      group = { id, name: card.checklist_name || card.File || id, columns: new Map(), players: new Map() }
      series.set(id, group)
    }
    const set = card['Box Type']?.trim() || 'Non renseigné'
    const hit = card['Hit Type']
    const family: FrenchFamily = hit === 'none' || hit === 'auto' || hit === 'mem' || hit === 'auto_mem' ? hit : 'unknown'
    const key = JSON.stringify([family, set])
    if (matched.size) group.columns.set(key, { key, name: set, family })
    const count = Number.isFinite(card.Hits) ? card.Hits : 1
    for (const name of matched) {
      let player = group.players.get(name)
      if (!player) {
        player = { name, sets: new Set(), auto: 0, memo: 0 }
        group.players.set(name, player)
      }
      player.sets.add(key)
      if (card['Hit Type'] === 'auto' || card['Hit Type'] === 'auto_mem') player.auto += count
      if (card['Hit Type'] === 'mem' || card['Hit Type'] === 'auto_mem') player.memo += count
    }
  }
  return [...series.values()].map((group) => ({
    id: group.id, name: group.name, columns: [...group.columns.values()].sort((a, b) => families.indexOf(a.family) - families.indexOf(b.family) || order(a.name, b.name) || a.name.localeCompare(b.name)),
    players: [...group.players.values()].sort((a, b) => order(a.name, b.name)),
  })).sort((a, b) => order(a.name, b.name) || order(a.id, b.id))
}
