import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { CategoryBadge } from '../shared/CategoryBadge'
import { CategoryBreakdown } from '../shared/CategoryBreakdown'
import { DistributionBar } from '../shared/DistributionBar'
import { SearchSelect } from '../shared/SearchSelect'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM } from '../../types'
import type { CardRecord } from '../../types'

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

  const allPlayers = useMemo(() => {
    const set = new Set<string>()
    for (const c of analysisData.cards) {
      c.Player.split('/').map((p) => p.trim()).filter(Boolean).forEach((p) => set.add(p))
    }
    return Array.from(set).sort()
  }, [analysisData.cards])

  const selectedPlayer = targetPlayer || ''

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

  const categoryDist = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of playerCards) map.set(c.Category, (map.get(c.Category) || 0) + c.Hits)
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [playerCards])

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

      <SearchSelect
        options={allPlayers}
        value={selectedPlayer}
        onChange={(v) => setTargetPlayer(v || null)}
        placeholder="Tapez un nom de joueur..."
      />

      {!selectedPlayer ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          Sélectionnez un joueur pour voir son analyse détaillée.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
            <MetricCard label="Total Cartes" value={totalHits} icon="📊" />
            <MetricCard label="Checklists" value={`${uniqueChecklists}/${totalChecklists}`} icon="📁" />
            <MetricCard label="Logoman" value={logomanCount} icon="🔥" />
            <MetricCard label="Case Hit" value={caseHitCount} icon="✨" />
            <MetricCard label="Auto/Mem" value={autoMemCount} icon="💎" />
            <MetricCard label="Base/Autre" value={totalHits - logomanCount - caseHitCount - autoMemCount} icon="📄" />
          </div>

          {/* Distribution bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <CategoryBreakdown
              data={categoryDist}
              title="Répartition par catégorie"
              activeFilter={categoryFilter}
              onFilter={setCategoryFilter}
            />
            <DistributionBar data={checklistDist} title="Répartition par checklist" />
          </div>

          <DataTable data={filteredCards} columns={cardColumns as any} pageSize={50} exportName={selectedPlayer.replace(/\s+/g, '_')} />
        </>
      )}
    </div>
  )
}
