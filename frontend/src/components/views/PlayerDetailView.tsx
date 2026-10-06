import { useMemo, useState } from 'react'
import { countryFlag } from '../../utils/countryFlag'
import { createColumnHelper } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../../stores/appStore'
import { fetchPlayerStats } from '../../api/client'
import { DataTable } from '../shared/DataTable'
import { prettyChecklist } from '../../utils/checklists'
import { MetricCard } from '../shared/MetricCard'
import { CategoryBadge } from '../shared/CategoryBadge'
import { CategoryBreakdown } from '../shared/CategoryBreakdown'
import { DistributionBar } from '../shared/DistributionBar'
import { SearchSelect } from '../shared/SearchSelect'
import { PlayerStatsPanel } from '../shared/PlayerStatsPanel'
import { RCBadge } from '../shared/RCBadge'
import { QuickPick } from '../shared/QuickPick'
import { OddsBadgeList } from '../shared/OddsBadge'
import { discreetBadges } from '../shared/oddsBadgeUtils'
import { useRookies } from '../../hooks/useRookies'
import { useOddsBadges } from '../../hooks/useOddsBadges'
import { CATEGORY_BASE_OTHER, CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, HIT_TYPE_AUTO, HIT_TYPE_AUTO_MEM, HIT_TYPE_MEM } from '../../types'
import type { CardRecord } from '../../types'
import { AWARD_LABELS } from '../../constants/awards'

const columnHelper = createColumnHelper<CardRecord>()

function PlayerDetailViewContent() {
  const { analysisData: storeAnalysisData, targetPlayer, setTargetPlayer, selectedSport } = useAppStore()
  // Garanti non nul par le composant enveloppe ci-dessous.
  const analysisData = storeAnalysisData!
  const { getRookie } = useRookies()
  const { badgesFor } = useOddsBadges()
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const selectedPlayer = targetPlayer || ''
  const rookie = selectedPlayer ? getRookie(selectedPlayer) : null

  const hasRCInSelection = useMemo(() => {
    if (!rookie || !analysisData) return false
    return analysisData.cards.some(
      (c) => c.Player.split('/').map((p) => p.trim()).includes(selectedPlayer) &&
        parseInt(c.Year, 10) === rookie.year_start,
    )
  }, [rookie, analysisData, selectedPlayer])

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
    columnHelper.accessor('Box Type', {
      header: 'Type',
      cell: (info) => {
        const card = info.row.original
        const entry = badgesFor(card.checklist_id, card['Box Type'])
        return (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span>{info.getValue()}</span>
            {entry && <OddsBadgeList codes={discreetBadges(entry.badges)} bestByGroup={entry.best_by_group} />}
          </span>
        )
      },
    }),
    columnHelper.accessor('Team', { header: 'Équipe' }),
    columnHelper.accessor('checklist_name', {
      header: 'Checklist',
      cell: (info) => {
        const fullName = info.getValue() || info.row.original.File || ''
        const name = prettyChecklist(fullName)
        const year = parseInt(info.row.original.Year, 10)
        const isRookieYear = rookie && year === rookie.year_start
        if (!isRookieYear) {
          return (
            <span title={name} className="inline-block max-w-[260px] whitespace-normal break-words align-top">
              {name}
            </span>
          )
        }
        return (
          <span title={name} className="flex max-w-[280px] items-start gap-1.5 whitespace-normal break-words">
            <RCBadge size="sm" />
            <span>{name}</span>
          </span>
        )
      },
    }),
  ], [rookie, badgesFor])


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
      const label = prettyChecklist(c.checklist_name || c.File)
      map.set(label, (map.get(label) || 0) + c.Hits)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [playerCards])

  const topPlayers = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of analysisData.cards) {
      for (const p of c.Player.split('/').map((x) => x.trim()).filter(Boolean)) map.set(p, (map.get(p) || 0) + c.Hits)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)
  }, [analysisData.cards])

  const totalHits = playerCards.reduce((s, c) => s + c.Hits, 0)
  const logomanCount = playerCards.filter((c) => c.Category === CATEGORY_LOGOMAN).reduce((s, c) => s + c.Hits, 0)
  const caseHitCount = playerCards.filter((c) => c.Category === CATEGORY_CASE_HIT).reduce((s, c) => s + c.Hits, 0)
  const autoCount = playerCards.filter((c) => c['Hit Type'] === HIT_TYPE_AUTO || c['Hit Type'] === HIT_TYPE_AUTO_MEM).reduce((s, c) => s + c.Hits, 0)
  const memCount = playerCards.filter((c) => c['Hit Type'] === HIT_TYPE_MEM || c['Hit Type'] === HIT_TYPE_AUTO_MEM).reduce((s, c) => s + c.Hits, 0)
  const autoMemCount = playerCards.filter((c) => c['Hit Type'] === HIT_TYPE_AUTO_MEM).reduce((s, c) => s + c.Hits, 0)
  const baseOtherCount = playerCards.filter((c) => c.Category === CATEGORY_BASE_OTHER).reduce((s, c) => s + c.Hits, 0)
  const uniqueChecklists = new Set(playerCards.map((c) => c.checklist_name)).size
  const totalChecklists = analysisData.metadata.checklists_count

  return (
    <div>
      {/* Header — hero quand joueur sélectionné, titre simple sinon */}
      {selectedPlayer && playerInfo ? (
        <div className="ui-card mb-4 p-4 flex gap-4 items-center">
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
              {hasRCInSelection && <RCBadge size="sm" />}
              {playerInfo.is_active
                ? <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 14%, transparent)', color: 'var(--success)' }}>Actif</span>
                : <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-quaternary)' }}>Retraité</span>
              }
            </div>
            {/* Position · Équipe · Pays */}
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
              {playerInfo.position && <span>{playerInfo.position}</span>}
              {playerInfo.team && <><span>·</span><span>{playerInfo.team}</span></>}
              {hasRCInSelection && rookie && <><span>·</span><span style={{ color: 'var(--rc-year-color)' }}>RC {rookie.year_start}-{String(rookie.year_end).slice(-2)}{rookie.draft_pick ? ` · Pick #${rookie.draft_pick}` : ''}</span></>}
              {playerInfo.country && <><span>·</span><span>{countryFlag(playerInfo.country)} {playerInfo.country}</span></>}
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
      ) : selectedPlayer ? (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xl font-semibold tracking-[-0.01em]" style={{ color: 'var(--text-primary)' }}>{selectedPlayer}</span>
          {hasRCInSelection && <RCBadge size="sm" />}
          {hasRCInSelection && rookie && (
            <span className="text-xs" style={{ color: 'var(--rc-year-color)' }}>
              RC {rookie.year_start}-{String(rookie.year_end).slice(-2)}{rookie.draft_pick ? ` · Pick #${rookie.draft_pick}` : ''}
            </span>
          )}
        </div>
      ) : null}

      <SearchSelect
        options={allPlayers}
        value={selectedPlayer}
        onChange={(v) => setTargetPlayer(v || null)}
        placeholder="Tapez un nom de joueur..."
      />

      {!selectedPlayer ? (
        <QuickPick title="Les plus présents dans la sélection" items={topPlayers} onPick={(name) => setTargetPlayer(name)} />
      ) : (
        <>
          <div className="grid grid-cols-4 xl:grid-cols-8 gap-2 sm:gap-3 my-5 sm:my-6">
            <MetricCard label="Cartes" value={totalHits} />
            <MetricCard label="Checklists" value={`${uniqueChecklists}/${totalChecklists}`} />
            <MetricCard label="Logoman" value={logomanCount} valueColor="var(--cat-logoman)" />
            <MetricCard label="Case hit" value={caseHitCount} valueColor="var(--cat-case)" />
            <MetricCard label="Auto" value={autoCount} valueColor="var(--cat-auto)" />
            <MetricCard label="Memo" value={memCount} valueColor="var(--cat-mem)" />
            <MetricCard label="A+M" value={autoMemCount} valueColor="var(--cat-automem)" />
            <MetricCard label="Base" value={baseOtherCount} valueColor="var(--cat-base)" />
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

          <DataTable data={filteredCards} columns={cardColumns} pageSize={50} exportName={selectedPlayer.replace(/\s+/g, '_')} mobileColumns={['Box Type', 'checklist_name']} />
        </>
      )}
    </div>
  )
}

/** Attend qu'une analyse soit chargée : les hooks du contenu s'exécutent toujours dans le même ordre. */
export function PlayerDetailView() {
  const ready = useAppStore((s) => !!s.analysisData)
  return ready ? <PlayerDetailViewContent /> : null
}
