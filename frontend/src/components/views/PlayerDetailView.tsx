import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { CategoryBadge } from '../shared/CategoryBadge'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM, CATEGORY_BASE_OTHER } from '../../types'
import type { CardRecord } from '../../types'

const PIE_COLORS: Record<string, string> = {
  [CATEGORY_LOGOMAN]: '#ef4444',
  [CATEGORY_CASE_HIT]: '#eab308',
  [CATEGORY_AUTO_MEM]: '#3b82f6',
  [CATEGORY_BASE_OTHER]: '#64748b',
}

const columnHelper = createColumnHelper<CardRecord>()

const cardColumns = [
  columnHelper.accessor('Category', {
    header: 'Catégorie',
    cell: (info) => <CategoryBadge category={info.getValue()} />,
  }),
  columnHelper.accessor('Box Type', { header: 'Type' }),
  columnHelper.accessor('Numbering', { header: 'Num.' }),
  columnHelper.accessor('Team', { header: 'Équipe' }),
  columnHelper.accessor('Hits', { header: 'Cartes' }),
  columnHelper.accessor('checklist_name', { header: 'Checklist', cell: (info) => info.getValue()?.replace('.parquet', '') }),
]

export function PlayerDetailView() {
  const { analysisData, targetPlayer, setTargetPlayer } = useAppStore()
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  if (!analysisData) return null

  // All unique players (split multi-player)
  const allPlayers = useMemo(() => {
    const set = new Set<string>()
    for (const c of analysisData.cards) {
      c.Player.split('/').map((p) => p.trim()).filter(Boolean).forEach((p) => set.add(p))
    }
    return Array.from(set).sort()
  }, [analysisData.cards])

  const selectedPlayer = targetPlayer || ''

  // Cards for this player
  const playerCards = useMemo(() => {
    if (!selectedPlayer) return []
    return analysisData.cards.filter((c) =>
      c.Player.split('/').map((p) => p.trim()).includes(selectedPlayer),
    )
  }, [analysisData.cards, selectedPlayer])

  const filteredCards = useMemo(() => {
    if (!categoryFilter) return playerCards
    return playerCards.filter((c) => c.Category === categoryFilter)
  }, [playerCards, categoryFilter])

  // Category distribution
  const categoryDist = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of playerCards) map.set(c.Category, (map.get(c.Category) || 0) + c.Hits)
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [playerCards])

  // Checklist distribution
  const checklistDist = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of playerCards) {
      const label = c.checklist_name?.replace('.parquet', '') || c.File
      map.set(label, (map.get(label) || 0) + c.Hits)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [playerCards])

  const totalHits = playerCards.reduce((s, c) => s + c.Hits, 0)
  const logomanCount = playerCards.filter((c) => c.Category === CATEGORY_LOGOMAN).reduce((s, c) => s + c.Hits, 0)
  const caseHitCount = playerCards.filter((c) => c.Category === CATEGORY_CASE_HIT).reduce((s, c) => s + c.Hits, 0)
  const autoMemCount = playerCards.filter((c) => c.Category === CATEGORY_AUTO_MEM).reduce((s, c) => s + c.Hits, 0)
  const uniqueChecklists = new Set(playerCards.map((c) => c.checklist_name)).size
  const totalChecklists = analysisData.metadata.checklists_count

  return (
    <div>
      <h2 className="text-xl font-medium mb-4">🔍 Analyse Joueur</h2>

      {/* Player selector */}
      <select
        value={selectedPlayer}
        onChange={(e) => setTargetPlayer(e.target.value || null)}
        className="w-full max-w-md rounded-lg px-3 py-2 text-sm mb-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
      >
        <option value="">Sélectionnez un joueur...</option>
        {allPlayers.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      {!selectedPlayer ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          Sélectionnez un joueur pour voir son analyse détaillée.
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
            <MetricCard label="Total Cartes" value={totalHits} icon="📊" />
            <MetricCard label="Checklists" value={`${uniqueChecklists}/${totalChecklists}`} icon="📁" />
            <MetricCard label="Logoman" value={logomanCount} icon="🔥" />
            <MetricCard label="Case Hit" value={caseHitCount} icon="✨" />
            <MetricCard label="Auto/Mem" value={autoMemCount} icon="💎" />
            <MetricCard label="Base/Autre" value={totalHits - logomanCount - caseHitCount - autoMemCount} icon="📄" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Category pie */}
            <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)' }}>
              <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>Répartition par catégorie</h4>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={categoryDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => e.name}>
                    {categoryDist.map((entry) => (
                      <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#64748b'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-hover)', border: '1px solid var(--border-standard)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Checklist pie */}
            <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)' }}>
              <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>Répartition par checklist</h4>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={checklistDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => e.name.slice(0, 15)}>
                    {checklistDist.map((_, i) => (
                      <Cell key={i} fill={`hsl(${i * 50 + 200}, 60%, 55%)`} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-hover)', border: '1px solid var(--border-standard)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-4">
            {['', CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM, CATEGORY_BASE_OTHER].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: categoryFilter === cat ? 'var(--accent)' : 'var(--bg-surface)',
                  color: categoryFilter === cat ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${categoryFilter === cat ? 'var(--accent)' : 'var(--border-subtle)'}`,
                }}
              >
                {cat || 'Toutes'}
              </button>
            ))}
          </div>

          {/* Cards table */}
          <DataTable data={filteredCards} columns={cardColumns as any} pageSize={50} />
        </>
      )}
    </div>
  )
}
