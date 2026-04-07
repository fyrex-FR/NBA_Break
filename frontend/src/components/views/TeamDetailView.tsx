import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { CategoryBadge } from '../shared/CategoryBadge'
import { CategoryBreakdown } from '../shared/CategoryBreakdown'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM, CATEGORY_BASE_OTHER } from '../../types'
import type { CardRecord } from '../../types'

const columnHelper = createColumnHelper<CardRecord>()

const cardColumns = [
  columnHelper.accessor('Player', { header: 'Joueur' }),
  columnHelper.accessor('Category', { header: 'Catégorie', cell: (info) => <CategoryBadge category={info.getValue()} /> }),
  columnHelper.accessor('Box Type', { header: 'Type' }),
  columnHelper.accessor('Numbering', { header: 'Num.' }),
  columnHelper.accessor('Hits', { header: 'Cartes' }),
  columnHelper.accessor('checklist_name', { header: 'Checklist', cell: (info) => info.getValue()?.replace('.parquet', '') }),
]

export function TeamDetailView() {
  const { analysisData, targetTeam, setTargetTeam } = useAppStore()
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

      <select
        value={selectedTeam}
        onChange={(e) => setTargetTeam(e.target.value || null)}
        className="w-full max-w-md rounded-lg px-3 py-2 text-sm mb-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
      >
        <option value="">Sélectionnez une équipe...</option>
        {allTeams.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      {!selectedTeam ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          Sélectionnez une équipe pour voir son analyse détaillée.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
            <MetricCard label="Total Cartes" value={totalHits} icon="📊" />
            <MetricCard label="Joueurs" value={uniquePlayers} icon="🎴" />
            <MetricCard label="Logoman" value={logomanCount} icon="🔥" />
            <MetricCard label="Case Hit" value={caseHitCount} icon="✨" />
            <MetricCard label="Auto/Mem" value={autoMemCount} icon="💎" />
            <MetricCard label="Base/Autre" value={totalHits - logomanCount - caseHitCount - autoMemCount} icon="📄" />
          </div>

          <div className="mb-6">
            <CategoryBreakdown data={categoryDist} title="Répartition par catégorie" />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {['', CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM, CATEGORY_BASE_OTHER].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  background: categoryFilter === cat ? 'var(--accent)' : 'transparent',
                  color: categoryFilter === cat ? '#fff' : 'var(--text-tertiary)',
                  border: `1px solid ${categoryFilter === cat ? 'var(--accent)' : 'var(--border-standard)'}`,
                }}
              >
                {cat || 'Toutes'}
              </button>
            ))}
          </div>

          <DataTable data={filteredCards} columns={cardColumns as any} pageSize={50} />
        </>
      )}
    </div>
  )
}
