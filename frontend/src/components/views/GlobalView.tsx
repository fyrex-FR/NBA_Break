import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import type { RankingRecord } from '../../types'

const columnHelper = createColumnHelper<RankingRecord>()

const playerColumns = [
  columnHelper.accessor('Player', { header: 'Joueur', cell: (info) => info.getValue() }),
  columnHelper.accessor('Hits', { header: 'Cartes', cell: (info) => info.getValue()?.toLocaleString('fr-FR') }),
]

const teamColumns = [
  columnHelper.accessor('Team', { header: 'Équipe', cell: (info) => info.getValue() }),
  columnHelper.accessor('Hits', { header: 'Cartes', cell: (info) => info.getValue()?.toLocaleString('fr-FR') }),
]

export function GlobalView() {
  const { analysisData, setActiveView, setTargetPlayer, setTargetTeam } = useAppStore()
  if (!analysisData) return null

  const { player_rankings, team_rankings, category_summary, metadata } = analysisData

  const topPlayers = useMemo(() => player_rankings.slice(0, 15), [player_rankings])
  const topTeams = useMemo(() => team_rankings.slice(0, 15), [team_rankings])

  function handlePlayerClick(row: RankingRecord) {
    if (row.Player) {
      setTargetPlayer(row.Player)
      setActiveView('🔍 Analyse Joueur')
    }
  }

  function handleTeamClick(row: RankingRecord) {
    if (row.Team) {
      setTargetTeam(row.Team)
      setActiveView('🛡️ Analyse Équipe')
    }
  }

  return (
    <div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <MetricCard label="Lignes" value={metadata.total_rows} icon="📊" />
        <MetricCard label="Équipes" value={metadata.unique_teams} icon="👥" />
        <MetricCard label="Joueurs" value={metadata.unique_players} icon="🎴" />
        <MetricCard label="Checklists" value={metadata.checklists_count} icon="📁" />
        <MetricCard label={metadata.sport_label} value={metadata.sport_key.toUpperCase()} icon="🏷️" />
      </div>

      {/* Category summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Logoman" value={category_summary.logoman} icon="🔥" />
        <MetricCard label="Case Hit" value={category_summary.case_hit} icon="✨" />
        <MetricCard label="Auto/Mem" value={category_summary.auto_mem} icon="💎" />
        <MetricCard label="Base/Autre" value={category_summary.base_other} icon="📄" />
      </div>

      {/* Two-column: Players & Teams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Players */}
        <div>
          <h3 className="text-lg font-medium mb-3">🏆 Top Joueurs</h3>

          {/* Bar chart */}
          <div className="mb-4 rounded-lg p-4" style={{ background: 'var(--bg-surface)' }}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topPlayers} layout="vertical">
                <XAxis type="number" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="Player"
                  width={120}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-hover)', border: '1px solid var(--border-standard)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                />
                <Bar dataKey="Hits" fill="var(--accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <DataTable
            data={player_rankings}
            columns={playerColumns as any}
            onRowClick={handlePlayerClick}
            searchable
            searchPlaceholder="Rechercher un joueur..."
          />
        </div>

        {/* Teams */}
        <div>
          <h3 className="text-lg font-medium mb-3">🛡️ Top Équipes</h3>

          <div className="mb-4 rounded-lg p-4" style={{ background: 'var(--bg-surface)' }}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topTeams} layout="vertical">
                <XAxis type="number" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="Team"
                  width={120}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-hover)', border: '1px solid var(--border-standard)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                />
                <Bar dataKey="Hits" fill="var(--accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <DataTable
            data={team_rankings}
            columns={teamColumns as any}
            onRowClick={handleTeamClick}
            searchable
            searchPlaceholder="Rechercher une équipe..."
          />
        </div>
      </div>
    </div>
  )
}
