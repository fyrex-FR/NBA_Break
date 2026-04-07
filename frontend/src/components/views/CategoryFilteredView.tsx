/**
 * Reusable view for category-filtered analysis (Autos & Patchs, Logoman, Case Hits).
 * Filters cards by category, shows player/team rankings + charts.
 */

import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import type { CardRecord, RankingRecord } from '../../types'

const columnHelper = createColumnHelper<RankingRecord>()

interface CategoryFilteredViewProps {
  title: string
  icon: string
  category: string
  description: string
}

export function CategoryFilteredView({ title, icon, category, description }: CategoryFilteredViewProps) {
  const { analysisData, setActiveView, setTargetPlayer, setTargetTeam } = useAppStore()
  if (!analysisData) return null

  const filtered = useMemo(
    () => analysisData.cards.filter((c) => c.Category === category),
    [analysisData.cards, category],
  )

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

  const playerCols = [
    columnHelper.accessor('Player', { header: 'Joueur' }),
    columnHelper.accessor('Hits', { header: 'Cartes', cell: (info) => info.getValue()?.toLocaleString('fr-FR') }),
  ]

  const teamCols = [
    columnHelper.accessor('Team', { header: 'Équipe' }),
    columnHelper.accessor('Hits', { header: 'Cartes', cell: (info) => info.getValue()?.toLocaleString('fr-FR') }),
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
            <h3 className="text-lg font-medium mb-3">🏆 Joueurs</h3>
            <div className="mb-4 rounded-lg p-4" style={{ background: 'var(--bg-surface)' }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={playerRankings.slice(0, 10)} layout="vertical">
                  <XAxis type="number" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                  <YAxis type="category" dataKey="Player" width={120} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-hover)', border: '1px solid var(--border-standard)', borderRadius: 8 }} />
                  <Bar dataKey="Hits" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
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
            <h3 className="text-lg font-medium mb-3">🛡️ Équipes</h3>
            <div className="mb-4 rounded-lg p-4" style={{ background: 'var(--bg-surface)' }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={teamRankings.slice(0, 10)} layout="vertical">
                  <XAxis type="number" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                  <YAxis type="category" dataKey="Team" width={120} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-hover)', border: '1px solid var(--border-standard)', borderRadius: 8 }} />
                  <Bar dataKey="Hits" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
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
