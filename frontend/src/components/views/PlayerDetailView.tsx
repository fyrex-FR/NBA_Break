import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../../stores/appStore'
import { fetchPlayerStats } from '../../api/client'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { CategoryBadge } from '../shared/CategoryBadge'
import { CategoryBreakdown } from '../shared/CategoryBreakdown'
import { DistributionBar } from '../shared/DistributionBar'
import { SearchSelect } from '../shared/SearchSelect'
import { PlayerStatsPanel } from '../shared/PlayerStatsPanel'
import { RCBadge } from '../shared/RCBadge'
import { useRookies } from '../../hooks/useRookies'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM } from '../../types'
import type { CardRecord } from '../../types'
import { AWARD_LABELS } from '../../constants/awards'

const columnHelper = createColumnHelper<CardRecord>()

export function PlayerDetailView() {
  const { analysisData, targetPlayer, setTargetPlayer, selectedSport } = useAppStore()
  const { getRookie } = useRookies()
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const selectedPlayer = targetPlayer || ''
  const rookie = selectedPlayer ? getRookie(selectedPlayer) : null

  const { data: playerInfo } = useQuery({
    queryKey: ['player-stats', selectedPlayer],
    queryFn: () => fetchPlayerStats(selectedPlayer),
    enabled: !!selectedPlayer && selectedSport === 'nba',
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  })

  const cardColumns = useMemo(() => [
    columnHelper.accessor('Category', {
      header: 'Catégorie',
      cell: (info) => <CategoryBadge category={info.getValue()} />,
    }),
    columnHelper.accessor('Box Type', { header: 'Type' }),
    columnHelper.accessor('Team', { header: 'Équipe' }),
    columnHelper.accessor('checklist_name', {
      header: 'Checklist',
      cell: (info) => {
        const name = info.getValue()?.replace('.parquet', '')
        const year = parseInt(info.row.original.Year, 10)
        const isRookieYear = rookie && year === rookie.year_start
        if (!isRookieYear) return <span>{name}</span>
        return (
          <span className="flex items-center gap-1.5">
            <RCBadge size="sm" />
            <span>{name}</span>
          </span>
        )
      },
    }),
  ], [rookie])

  if (!analysisData) return null

  const allPlayers = useMemo(() => {
    const set = new Set<string>()
    for (const c of analysisData.cards) {
      c.Player.split('/').map((p) => p.trim()).filter(Boolean).forEach((p) => set.add(p))
    }
    return Array.from(set).sort()
  }, [analysisData.cards])

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
      {/* Header — hero quand joueur sélectionné, titre simple sinon */}
      {selectedPlayer && playerInfo ? (
        <div className="rounded-xl mb-4 p-4 flex gap-4 items-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          {/* Photo */}
          <img
            src={playerInfo.photo_url}
            alt={playerInfo.full_name}
            className="w-24 h-18 object-cover rounded-xl flex-shrink-0"
            style={{ background: 'var(--bg-hover)', height: '72px', width: '96px' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          {/* Infos */}
          <div className="flex-1 min-w-0">
            {/* Nom + badges statut */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{playerInfo.full_name}</span>
              {rookie && <RCBadge size="sm" />}
              {playerInfo.is_active
                ? <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>Actif</span>
                : <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--text-quaternary)' }}>Retraité</span>
              }
            </div>
            {/* Position · Équipe · Pays */}
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
              {playerInfo.position && <span>{playerInfo.position}</span>}
              {playerInfo.team && <><span>·</span><span>{playerInfo.team}</span></>}
              {rookie && <><span>·</span><span style={{ color: 'rgba(255,215,0,0.8)' }}>RC {rookie.year_start}-{String(rookie.year_end).slice(-2)}{rookie.draft_pick ? ` · Pick #${rookie.draft_pick}` : ''}</span></>}
              {playerInfo.country && <><span>·</span><span>🌍 {playerInfo.country}</span></>}
            </div>
            {/* Awards */}
            {playerInfo.awards && Object.keys(playerInfo.awards).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {AWARD_LABELS.filter((a) => (playerInfo.awards[a.key] ?? 0) > 0).map((a) => {
                  const count = playerInfo.awards[a.key]!
                  return (
                    <span key={a.key} className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full"
                      style={{ background: `${a.color}15`, border: `1px solid ${a.color}35`, color: a.color }}>
                      {a.icon}{count > 1 ? ` ×${count}` : ` ${a.label}`}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <h2 className="text-xl font-medium mb-4">🔍 Analyse Joueur</h2>
      )}

      <SearchSelect
        options={allPlayers}
        value={selectedPlayer}
        onChange={(v) => setTargetPlayer(v || null)}
        placeholder="Tapez un nom de joueur..."
      />

      {!selectedPlayer ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Sélectionnez un joueur</p>
          <p className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Ou cliquez sur un joueur depuis la Vue Globale</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
            <MetricCard label="Total Cartes" value={totalHits} icon="📊" />
            <MetricCard label="Checklists" value={`${uniqueChecklists}/${totalChecklists}`} icon="📁" />
            <MetricCard label="Logoman" value={logomanCount} icon="🔥" valueColor="#ef4444" />
            <MetricCard label="Case Hit" value={caseHitCount} icon="✨" valueColor="#eab308" />
            <MetricCard label="Auto/Mem" value={autoMemCount} icon="💎" valueColor="#3b82f6" />
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

          {selectedSport === 'nba' && (
            <div className="mb-4">
              <PlayerStatsPanel playerName={selectedPlayer} />
            </div>
          )}

          <DataTable data={filteredCards} columns={cardColumns as any} pageSize={50} exportName={selectedPlayer.replace(/\s+/g, '_')} />
        </>
      )}
    </div>
  )
}
