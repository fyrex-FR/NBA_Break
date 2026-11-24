/**
 * Spots d'une collection : ce que contient chaque équipe (ou joueur) de la
 * sélection ouverte, en chiffres bruts (cartes, autos, memo, case hits).
 * Une carte à plusieurs joueurs / équipes compte pour chacun.
 */
import type { CardRecord } from '../types'
import { CATEGORY_CASE_HIT, HIT_TYPE_AUTO, HIT_TYPE_AUTO_MEM, HIT_TYPE_MEM } from '../types'

export type SpotKind = 'team' | 'player'
export type SpotField = 'cards' | 'autos' | 'memo' | 'caseHits'

export interface SpotRow {
  key: string
  name: string
  /** Équipe principale d'un joueur (la plus fréquente). */
  team?: string
  cards: number
  autos: number
  memo: number
  caseHits: number
}

function split(value: string) {
  return value.split('/').map((v) => v.trim()).filter(Boolean)
}

export function buildSpots(cards: CardRecord[], kind: SpotKind): SpotRow[] {
  const acc = new Map<string, SpotRow & { teams: Map<string, number> }>()
  for (const card of cards) {
    const names = split(kind === 'team' ? card.Team : card.Player)
    const teams = split(card.Team)
    const hits = card.Hits || 1
    const isAuto = card['Hit Type'] === HIT_TYPE_AUTO || card['Hit Type'] === HIT_TYPE_AUTO_MEM
    const isMem = card['Hit Type'] === HIT_TYPE_MEM
    const isCase = card.Category === CATEGORY_CASE_HIT
    names.forEach((name, i) => {
      const row = acc.get(name) ?? { key: `${kind}:${name}`, name, cards: 0, autos: 0, memo: 0, caseHits: 0, teams: new Map() }
      row.cards += hits
      if (isAuto) row.autos += hits
      if (isMem) row.memo += hits
      if (isCase) row.caseHits += hits
      if (kind === 'player') {
        const t = teams.length === names.length ? teams[i] : teams[0]
        if (t) row.teams.set(t, (row.teams.get(t) ?? 0) + hits)
      }
      acc.set(name, row)
    })
  }
  return [...acc.values()].map(({ teams, ...row }) => ({
    ...row,
    team: teams.size ? [...teams.entries()].sort((a, b) => b[1] - a[1])[0][0] : undefined,
  }))
}

/** Tri par une colonne, départage par autos, case hits puis cartes. */
export function sortSpots(rows: SpotRow[], field: SpotField): SpotRow[] {
  return [...rows].sort((a, b) =>
    b[field] - a[field] || b.autos - a.autos || b.caseHits - a.caseHits || b.cards - a.cards || a.name.localeCompare(b.name))
}

/** Moyenne d'une colonne sur tous les spots. */
export function average(rows: SpotRow[], field: SpotField) {
  return rows.length ? rows.reduce((s, r) => s + r[field], 0) / rows.length : 0
}
