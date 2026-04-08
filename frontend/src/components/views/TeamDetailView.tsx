import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { CategoryBadge } from '../shared/CategoryBadge'
import { CategoryBreakdown } from '../shared/CategoryBreakdown'
import { SearchSelect } from '../shared/SearchSelect'
import { TeamStatsPanel } from '../shared/TeamStatsPanel'
import { PlayerCell } from '../shared/PlayerCell'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM } from '../../types'
import type { CardRecord } from '../../types'

const columnHelper = createColumnHelper<CardRecord>()

const cardColumns = [
  columnHelper.accessor('Player', { header: 'Joueur', cell: (info) => <PlayerCell name={info.getValue() ?? ''} /> }),
  columnHelper.accessor('Category', { header: 'Catégorie', cell: (info) => <CategoryBadge category={info.getValue()} /> }),
  columnHelper.accessor('Box Type', { header: 'Type' }),
  columnHelper.accessor('checklist_name', { header: 'Checklist', cell: (info) => info.getValue()?.replace('.parquet', '') }),
]

export function TeamDetailView() {
  const { analysisData, targetTeam, setTargetTeam, selectedSport } = useAppStore()
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  if (!analysisData) return null

  const allTeams = useMemo(() => {
    const set = new Set<string>()
    for (const c of analysisData.cards) {
      c.Team.split('/').map((t) => t.trim()).filter(Boolean).forEach((t) => set.add(t))
    }
    return Array.from(set).sort()
  }, [analysisData.cards])

  const selectedTeam = targetTeam || ''

  const teamCards = useMemo(() => {
    if (!selectedTeam) return []
    return analysisData.cards.filter((c) =>
      c.Team.split('/').map((t) => t.trim()).includes(selectedTeam),
    )
  }, [analysisData.cards, selectedTeam])

  const filteredCards = useMemo(() => {
    if (!categoryFilter) return teamCards
    return teamCards.filter((c) => c.Category === categoryFilter)
  }, [teamCards, categoryFilter])

  const categoryDist = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of teamCards) map.set(c.Category, (map.get(c.Category) || 0) + c.Hits)
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [teamCards])

  const totalHits = teamCards.reduce((s, c) => s + c.Hits, 0)
  const logomanCount = teamCards.filter((c) => c.Category === CATEGORY_LOGOMAN).reduce((s, c) => s + c.Hits, 0)
  const caseHitCount = teamCards.filter((c) => c.Category === CATEGORY_CASE_HIT).reduce((s, c) => s + c.Hits, 0)
  const autoMemCount = teamCards.filter((c) => c.Category === CATEGORY_AUTO_MEM).reduce((s, c) => s + c.Hits, 0)
  const uniquePlayers = new Set(teamCards.flatMap((c) => c.Player.split('/').map((p) => p.trim()).filter(Boolean))).size

  return (
    <div>
      <h2 className="text-xl font-medium mb-4">🛡️ Analyse Équipe</h2>

      <SearchSelect
        options={allTeams}
        value={selectedTeam}
        onChange={(v) => setTargetTeam(v || null)}
        placeholder="Tapez un nom d'équipe..."
      />

      {!selectedTeam ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🛡️</div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Sélectionnez une équipe</p>
          <p className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Ou cliquez sur une équipe depuis la Vue Globale</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
            <MetricCard label="Total Cartes" value={totalHits} icon="📊" />
            <MetricCard label="Joueurs" value={uniquePlayers} icon="🎴" />
            <MetricCard label="Logoman" value={logomanCount} icon="🔥" valueColor="#ef4444" />
            <MetricCard label="Case Hit" value={caseHitCount} icon="✨" valueColor="#eab308" />
            <MetricCard label="Auto/Mem" value={autoMemCount} icon="💎" valueColor="#3b82f6" />
            <MetricCard label="Base/Autre" value={totalHits - logomanCount - caseHitCount - autoMemCount} icon="📄" />
          </div>

          <div className="mb-6">
            <CategoryBreakdown
              data={categoryDist}
              title="Répartition par catégorie"
              activeFilter={categoryFilter}
              onFilter={setCategoryFilter}
            />
          </div>

          {selectedSport === 'nba' && (
            <div className="mb-4">
              <TeamStatsPanel teamName={selectedTeam} />
            </div>
          )}

          <DataTable data={filteredCards} columns={cardColumns as any} pageSize={50} exportName={selectedTeam.replace(/\s+/g, '_')} />
        </>
      )}
    </div>
  )
}
