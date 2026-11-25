import { CATEGORY_AUTO, CATEGORY_AUTO_MEM, CATEGORY_CASE_HIT, CATEGORY_LOGOMAN, CATEGORY_MEM, type CardRecord, type CatalogCollectionRow } from '../types/index.ts'

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

/** Groupes contigus, partagés par le tableau et l'export. */
export function frenchFamilyGroups(columns: FrenchColumn[]) {
  const groups: { family: FrenchFamily; start: number; columns: FrenchColumn[] }[] = []
  columns.forEach((column, index) => {
    let group = groups[groups.length - 1]
    if (!group || group.family !== column.family) {
      group = { family: column.family, start: index, columns: [] }
      groups.push(group)
    }
    group.columns.push(column)
  })
  return groups
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

// ── Tableaux « par joueur » et « par équipe » ─────────────────────────────
// Mêmes règles dans les deux sources (catalogue entier ou collections ouvertes) :
// autos = Auto + Auto/Memo, memo = Memo, case hits = Case Hit + Logoman.


export interface FrenchCounts { autos: number; memo: number; caseHits: number; cards: number }
export type FrenchField = keyof FrenchCounts
export interface FrenchCollection extends FrenchCounts { id: string; name: string; season: string; team: string }
export interface FrenchPlayer extends FrenchCounts { name: string; team: string; collections: FrenchCollection[] }
export interface FrenchTeam extends FrenchCounts { name: string; players: (FrenchCounts & { name: string })[]; collections: FrenchCollection[] }

const zero = (): FrenchCounts => ({ autos: 0, memo: 0, caseHits: 0, cards: 0 })
function add(into: FrenchCounts, c: FrenchCounts) {
  into.autos += c.autos; into.memo += c.memo; into.caseHits += c.caseHits; into.cards += c.cards
}

/** Le nom de la liste vérifiée correspondant à un nom de checklist, ou null. */
export function frenchName(name: string): string | null {
  return names.get(normalize(name)) ?? null
}

/** Compteurs d'une ligne de l'index du catalogue. */
export function countsFromCatalog(row: Pick<CatalogCollectionRow, 'auto' | 'auto_mem' | 'mem' | 'case_hit' | 'logoman' | 'cards'>): FrenchCounts {
  return { autos: row.auto + row.auto_mem, memo: row.mem, caseHits: row.case_hit + row.logoman, cards: row.cards }
}

/** Joueurs depuis l'index du catalogue (une fiche par joueur), filtrés sur une saison. */
export function playersFromCatalog(details: { name: string; team: string; collections: CatalogCollectionRow[] }[], season: string | null): FrenchPlayer[] {
  return details.map((d) => {
    const collections = d.collections
      .filter((r) => !season || r.season === season)
      .map((r) => ({ id: r.checklist_id, name: r.name, season: r.season, team: r.team || d.team, ...countsFromCatalog(r) }))
    const total = zero()
    collections.forEach((c) => add(total, c))
    // Équipe de la saison choisie (la plus chargée en cartes), sinon l'équipe principale.
    const teams = new Map<string, number>()
    collections.forEach((c) => teams.set(c.team, (teams.get(c.team) ?? 0) + c.cards))
    const team = [...teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || d.team
    // Le nom garde l'orthographe de la checklist : c'est lui que les fiches cherchent.
    return { name: d.name, team, collections, ...total }
  }).filter((p) => p.cards > 0)
}

/** Joueurs depuis les cartes des collections ouvertes. */
export function playersFromCards(cards: CardRecord[]): FrenchPlayer[] {
  const acc = new Map<string, { name: string; teams: Map<string, number>; collections: Map<string, FrenchCollection> }>()
  for (const card of cards) {
    const players = (card.Player || '').split('/').map((n) => n.trim())
    const teams = (card.Team || '').split('/').map((t) => t.trim()).filter(Boolean)
    const hits = Number.isFinite(card.Hits) ? card.Hits : 1
    const c: FrenchCounts = {
      autos: card.Category === CATEGORY_AUTO || card.Category === CATEGORY_AUTO_MEM ? hits : 0,
      memo: card.Category === CATEGORY_MEM ? hits : 0,
      caseHits: card.Category === CATEGORY_CASE_HIT || card.Category === CATEGORY_LOGOMAN ? hits : 0,
      cards: hits,
    }
    players.forEach((raw, i) => {
      const name = frenchName(raw)
      if (!name) return
      const team = (teams.length === players.length ? teams[i] : teams[0]) || ''
      const p = acc.get(name) ?? { name, teams: new Map(), collections: new Map() }
      p.teams.set(team, (p.teams.get(team) ?? 0) + hits)
      const id = card.checklist_id || card.checklist_name || card.File || 'inconnue'
      const col = p.collections.get(id) ?? { id, name: card.checklist_name || card.File || id, season: card.Year || '', team, ...zero() }
      add(col, c)
      p.collections.set(id, col)
      acc.set(name, p)
    })
  }
  return [...acc.values()].map((p) => {
    const total = zero()
    const collections = [...p.collections.values()].sort((a, b) => b.autos - a.autos || b.cards - a.cards)
    collections.forEach((c) => add(total, c))
    return { name: p.name, team: [...p.teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '', collections, ...total }
  })
}

/** Regroupe par équipe : l'équipe de chaque collection, pas l'équipe principale du joueur. */
export function teamsFromPlayers(players: FrenchPlayer[]): FrenchTeam[] {
  const acc = new Map<string, FrenchTeam>()
  for (const p of players) {
    for (const c of p.collections) {
      if (!c.team) continue
      const t = acc.get(c.team) ?? { name: c.team, players: [], collections: [], ...zero() }
      add(t, c)
      let row = t.players.find((r) => r.name === p.name)
      if (!row) { row = { name: p.name, ...zero() }; t.players.push(row) }
      add(row, c)
      let col = t.collections.find((x) => x.id === c.id)
      if (!col) { col = { ...c, ...zero() }; t.collections.push(col) }
      add(col, c)
      acc.set(c.team, t)
    }
  }
  return [...acc.values()].map((t) => ({ ...t, players: sortFrench(t.players, 'autos'), collections: sortFrench(t.collections, 'autos') }))
}

/** Tri par une colonne, départage par autos, case hits, cartes puis nom. */
export function sortFrench<T extends FrenchCounts & { name: string }>(rows: T[], field: FrenchField): T[] {
  return [...rows].sort((a, b) => b[field] - a[field] || b.autos - a.autos || b.caseHits - a.caseHits || b.cards - a.cards || order(a.name, b.name))
}
