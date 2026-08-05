/**
 * Reusable view for category-filtered analysis (Autos & Patchs, Logoman, Case Hits).
 * Filters cards by category, shows player/team rankings + charts.
 */

import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { PlayerCell } from '../shared/PlayerCell'
import { OddsBadge } from '../shared/OddsBadge'
import { useOddsBadges } from '../../hooks/useOddsBadges'
import type { OddsBadgeCode, RankingRecord } from '../../types'

const columnHelper = createColumnHelper<RankingRecord>()

// Ordre de rareté croissant — sert à retenir la carte la plus rare d'un
// joueur/équipe quand plusieurs cartes ont des odds connues dans la sélection.
const RARITY_ORDER: Record<string, number> = { sp: 1, ssp: 2, case_hit: 3 }

function rarestBadge(a: OddsBadgeCode | undefined, b: OddsBadgeCode): OddsBadgeCode {
  if (!a) return b
  return (RARITY_ORDER[b] ?? 0) > (RARITY_ORDER[a] ?? 0) ? b : a
}

interface CategoryFilteredViewProps {
  title: string
  icon: string
  category?: string
  hitTypes?: string[]
  description: string
}

export function CategoryFilteredView({ title, icon, category, hitTypes, description }: CategoryFilteredViewProps) {
  const { analysisData, setActiveView, setTargetPlayer, setTargetTeam } = useAppStore()
  const { badgesFor } = useOddsBadges()
  if (!analysisData) return null

  const filtered = useMemo(
    () => analysisData.cards.filter((c) => {
      if (hitTypes?.length) return hitTypes.includes(c['Hit Type'] || '')
      if (category) return c.Category === category
      return true
    }),
    [analysisData.cards, category, hitTypes],
  )

  // Cette vue n'a pas de colonne "Box Type" par carte (rankings agrégés) : on
  // reporte la pastille odds la plus discrète possible — la rareté de la
  // carte la plus rare avec des odds connues parmi celles du joueur/équipe.
  const playerRarity = useMemo(() => {
    const map = new Map<string, OddsBadgeCode>()
    for (const card of filtered) {
      const entry = badgesFor(card.checklist_id, card['Box Type'])
      const rarity = entry?.badges.find((b) => b in RARITY_ORDER)
      if (!rarity) continue
      for (const p of card.Player.split('/').map((s) => s.trim()).filter(Boolean)) {
        map.set(p, rarestBadge(map.get(p), rarity))
      }
    }
    return map
  }, [filtered, badgesFor])

  const teamRarity = useMemo(() => {
    const map = new Map<string, OddsBadgeCode>()
    for (const card of filtered) {
      const entry = badgesFor(card.checklist_id, card['Box Type'])
      const rarity = entry?.badges.find((b) => b in RARITY_ORDER)
      if (!rarity) continue
      for (const t of card.Team.split('/').map((s) => s.trim()).filter(Boolean)) {
        map.set(t, rarestBadge(map.get(t), rarity))
      }
    }
    return map
  }, [filtered, badgesFor])

  const playerRankings = useMemo(() => {
    const map = new Map<string, number>()
    for (const card of filtered) {
      // Split multi-player cards
      const players = card.Player.split('/').map((p) => p.trim()).filter(Boolean)
      for (const p of players) {
        map.set(p, (map.get(p) || 0) + card.Hits)
      }
    }
    return Array.from(map.entries())
      .map(([Player, Hits]) => ({ Player, Hits }))
      .sort((a, b) => b.Hits - a.Hits)
  }, [filtered])

  const teamRankings = useMemo(() => {
    const map = new Map<string, number>()
    for (const card of filtered) {
      const teams = card.Team.split('/').map((t) => t.trim()).filter(Boolean)
      for (const t of teams) {
        map.set(t, (map.get(t) || 0) + card.Hits)
      }
    }
    return Array.from(map.entries())
      .map(([Team, Hits]) => ({ Team, Hits }))
      .sort((a, b) => b.Hits - a.Hits)
  }, [filtered])

  // On n'ajoute la colonne "Rareté odds" que si au moins une carte de la
  // sélection en a une — sinon la colonne resterait vide en permanence sur
  // 99% des produits (non-Topps), ce qui n'est ni discret ni utile.
  const playerCols = [
    columnHelper.accessor('Player', { header: 'Joueur', cell: (info) => <PlayerCell name={info.getValue() ?? ''} requireRookieInSelection /> }),
    columnHelper.accessor('Hits', { header: 'Cartes', cell: (info) => info.getValue()?.toLocaleString('fr-FR') }),
    ...(playerRarity.size > 0 ? [
      columnHelper.display({
        id: 'oddsRarity',
        header: 'Rareté odds',
        cell: (info: any) => {
          const code = playerRarity.get(info.row.original.Player || '')
          return code ? <OddsBadge code={code} /> : null
        },
      }),
    ] : []),
  ]

  const teamCols = [
    columnHelper.accessor('Team', { header: 'Équipe' }),
    columnHelper.accessor('Hits', { header: 'Cartes', cell: (info) => info.getValue()?.toLocaleString('fr-FR') }),
    ...(teamRarity.size > 0 ? [
      columnHelper.display({
        id: 'oddsRarity',
        header: 'Rareté odds',
        cell: (info: any) => {
          const code = teamRarity.get(info.row.original.Team || '')
          return code ? <OddsBadge code={code} /> : null
        },
      }),
    ] : []),
  ]

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-xl font-medium">{icon} {title}</h2>
      </div>
      <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>{description}</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <MetricCard label="Total cartes" value={filtered.reduce((s, c) => s + c.Hits, 0)} icon={icon} />
        <MetricCard label="Joueurs" value={playerRankings.length} icon="🎴" />
        <MetricCard label="Équipes" value={teamRankings.length} icon="🛡️" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          Aucune carte {title} trouvée dans la sélection.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Players */}
          <div>
            <DataTable
              data={playerRankings}
              columns={playerCols as any}
              onRowClick={(row) => { setTargetPlayer(row.Player!); setActiveView('🔍 Analyse Joueur') }}
              searchable
              searchPlaceholder="Rechercher un joueur..."
              exportName={`joueurs_${title.replace(/\s+/g, '_')}`}
            />
          </div>

          {/* Teams */}
          <div>
            <DataTable
              data={teamRankings}
              columns={teamCols as any}
              onRowClick={(row) => { setTargetTeam(row.Team!); setActiveView('🛡️ Analyse Équipe') }}
              searchable
              searchPlaceholder="Rechercher une équipe..."
              exportName={`equipes_${title.replace(/\s+/g, '_')}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}
