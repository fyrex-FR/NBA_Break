import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../../stores/appStore'
import { fetchTeamStats } from '../../api/client'
import { DataTable } from '../shared/DataTable'
import { prettyChecklist } from '../../utils/checklists'
import { MetricCard } from '../shared/MetricCard'
import { QuickPick } from '../shared/QuickPick'
import { CategoryBadge } from '../shared/CategoryBadge'
import { CategoryBreakdown } from '../shared/CategoryBreakdown'
import { SearchSelect } from '../shared/SearchSelect'
import { TeamStatsPanel } from '../shared/TeamStatsPanel'
import { PlayerCell } from '../shared/PlayerCell'
import { OddsBadgeList } from '../shared/OddsBadge'
import { discreetBadges } from '../shared/oddsBadgeUtils'
import { useOddsBadges } from '../../hooks/useOddsBadges'
import { CATEGORY_BASE_OTHER, CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, HIT_TYPE_AUTO, HIT_TYPE_AUTO_MEM, HIT_TYPE_MEM } from '../../types'
import type { CardRecord } from '../../types'

const columnHelper = createColumnHelper<CardRecord>()

type PlayerSummaryRow = {
  Player: string
  Hits: number
  Auto: number
  Memo: number
  AutoMemo: number
  MultiTeamCards: number
  Logoman: number
  CaseHit: number
  BaseOther: number
  Checklists: number
  Score: number
}

const playerSummaryColumnHelper = createColumnHelper<PlayerSummaryRow>()

const playerSummaryColumns = [
  playerSummaryColumnHelper.accessor('Player', {
    header: 'Joueur',
    cell: (info) => {
      const multiCount = info.row.original.MultiTeamCards
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <PlayerCell name={info.getValue() ?? ''} requireRookieInSelection />
          {multiCount > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: 'color-mix(in srgb, var(--cat-case) 14%, transparent)', color: 'var(--cat-case)' }}
              title={`${multiCount} carte(s) multi-joueurs avec plusieurs équipes : ce joueur est lié à cette équipe via une carte partagée.`}
            >
              multi-team
            </span>
          )}
        </span>
      )
    },
  }),
  playerSummaryColumnHelper.accessor('Hits', { header: 'Cartes' }),
  playerSummaryColumnHelper.accessor('Auto', { header: 'Auto' }),
  playerSummaryColumnHelper.accessor('Memo', { header: 'Memo' }),
  playerSummaryColumnHelper.accessor('AutoMemo', { header: 'A+M' }),
  playerSummaryColumnHelper.accessor('Logoman', { header: 'Logoman' }),
  playerSummaryColumnHelper.accessor('CaseHit', { header: 'Case Hit' }),
  playerSummaryColumnHelper.accessor('BaseOther', { header: 'Base/Autre' }),
  playerSummaryColumnHelper.accessor('Checklists', { header: 'Checklists' }),
  playerSummaryColumnHelper.accessor('Score', { header: 'Score', cell: (info) => Math.round(info.getValue() ?? 0) }),
]

function TeamDetailViewContent() {
  const { analysisData: storeAnalysisData, targetTeam, setTargetTeam, setTargetPlayer, setActiveView, selectedSport } = useAppStore()
  // Garanti non nul par le composant enveloppe ci-dessous.
  const analysisData = storeAnalysisData!
  const { badgesFor } = useOddsBadges()
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const cardColumns = useMemo(() => [
    columnHelper.accessor('Player', { header: 'Joueur', cell: (info) => <PlayerCell name={info.getValue() ?? ''} requireRookieInSelection /> }),
    columnHelper.accessor('Category', { header: 'Catégorie', cell: (info) => <CategoryBadge category={info.getValue()} /> }),
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
    columnHelper.accessor('checklist_name', {
      header: 'Checklist',
      cell: (info) => {
        const fullName = info.getValue() || info.row.original.File || ''
        const name = prettyChecklist(fullName)
        return <span title={name} className="inline-block max-w-[260px] whitespace-normal break-words align-top">{name}</span>
      },
    }),
  ], [badgesFor])
  const selectedTeam = targetTeam || ''
  const isEntertainment = selectedSport === 'disney' || selectedSport === 'marvel'
  const teamPlaceholder = isEntertainment ? 'Tapez un univers ou une franchise...' : "Tapez un nom d'équipe..."

  const { data: teamInfo } = useQuery({
    queryKey: ['team-stats', selectedTeam],
    queryFn: () => fetchTeamStats(selectedTeam),
    enabled: !!selectedTeam && selectedSport === 'nba',
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  })


  const allTeams = useMemo(() => {
    const set = new Set<string>()
    for (const c of analysisData.cards) {
      c.Team.split('/').map((t) => t.trim()).filter(Boolean).forEach((t) => set.add(t))
    }
    return Array.from(set).sort()
  }, [analysisData.cards])

  const topTeams = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of analysisData.cards) {
      for (const t of c.Team.split('/').map((x) => x.trim()).filter(Boolean)) map.set(t, (map.get(t) || 0) + c.Hits)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)
  }, [analysisData.cards])

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
  const autoCount = teamCards.filter((c) => c['Hit Type'] === HIT_TYPE_AUTO || c['Hit Type'] === HIT_TYPE_AUTO_MEM).reduce((s, c) => s + c.Hits, 0)
  const memCount = teamCards.filter((c) => c['Hit Type'] === HIT_TYPE_MEM || c['Hit Type'] === HIT_TYPE_AUTO_MEM).reduce((s, c) => s + c.Hits, 0)
  const autoMemCount = teamCards.filter((c) => c['Hit Type'] === HIT_TYPE_AUTO_MEM).reduce((s, c) => s + c.Hits, 0)
  const baseOtherCount = teamCards.filter((c) => c.Category === CATEGORY_BASE_OTHER).reduce((s, c) => s + c.Hits, 0)
  const uniquePlayers = new Set(teamCards.flatMap((c) => c.Player.split('/').map((p) => p.trim()).filter(Boolean))).size

  const playerSummaryRows = useMemo(() => {
    const map = new Map<string, PlayerSummaryRow & { checklistSet: Set<string> }>()

    for (const card of teamCards) {
      const players = card.Player.split('/').map((p) => p.trim()).filter(Boolean)
      const teams = card.Team.split('/').map((t) => t.trim()).filter(Boolean)
      const isCrossTeamMultiPlayerCard = players.length > 1 && teams.length > 1 && teams.includes(selectedTeam)
      for (const player of players) {
        const row = map.get(player) ?? {
          Player: player,
          Hits: 0,
          Auto: 0,
          Memo: 0,
          AutoMemo: 0,
          MultiTeamCards: 0,
          Logoman: 0,
          CaseHit: 0,
          BaseOther: 0,
          Checklists: 0,
          Score: 0,
          checklistSet: new Set<string>(),
        }

        const hits = card.Hits || 0
        row.Hits += hits
        row.Score += card.Score || 0
        row.checklistSet.add(card.checklist_name || card.File || card.checklist_id || 'unknown')

        const isHit = [HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM].includes(card['Hit Type'] || '')
        if (card['Hit Type'] === HIT_TYPE_AUTO || card['Hit Type'] === HIT_TYPE_AUTO_MEM) row.Auto += hits
        if (card['Hit Type'] === HIT_TYPE_MEM || card['Hit Type'] === HIT_TYPE_AUTO_MEM) row.Memo += hits
        if (card['Hit Type'] === HIT_TYPE_AUTO_MEM) row.AutoMemo += hits
        if (isCrossTeamMultiPlayerCard) row.MultiTeamCards += hits
        if (card.Category === CATEGORY_LOGOMAN) row.Logoman += hits
        else if (card.Category === CATEGORY_CASE_HIT) row.CaseHit += hits
        else if (!isHit) row.BaseOther += hits

        map.set(player, row)
      }
    }

    return Array.from(map.values())
      .map(({ checklistSet, ...row }) => ({ ...row, Checklists: checklistSet.size }))
      .sort((a, b) => b.Score - a.Score || (b.Auto + b.Memo) - (a.Auto + a.Memo) || b.Hits - a.Hits || a.Player.localeCompare(b.Player))
  }, [teamCards, selectedTeam])

  function handlePlayerSummaryClick(row: PlayerSummaryRow) {
    setTargetPlayer(row.Player)
    setActiveView('🔍 Analyse Joueur')
  }

  return (
    <div>
      {selectedTeam && teamInfo ? (
        <div className="rounded-xl mb-4 p-4 flex gap-4 items-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <img
            src={teamInfo.logo_url}
            alt={teamInfo.full_name}
            className="flex-shrink-0 object-contain"
            style={{ width: 72, height: 72 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{teamInfo.full_name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>{teamInfo.abbreviation}</span>
            </div>
            {teamInfo.standing && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span>{teamInfo.standing.conference} · #{teamInfo.standing.rank}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{teamInfo.standing.wins}W – {teamInfo.standing.losses}L</span>
                <span>({Math.round(teamInfo.standing.win_pct * 100)}%)</span>
                <span>Série: <span style={{ color: teamInfo.standing.streak.startsWith('W') ? 'var(--success)' : 'var(--danger)' }}>{teamInfo.standing.streak}</span></span>
                <span>10 derniers: {teamInfo.standing.last_10}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        null
      )}

      <SearchSelect
        options={allTeams}
        value={selectedTeam}
        onChange={(v) => setTargetTeam(v || null)}
        placeholder={teamPlaceholder}
      />

      {!selectedTeam ? (
        <QuickPick title={isEntertainment ? 'Univers les plus présents' : 'Équipes les plus présentes'} items={topTeams} onPick={(name) => setTargetTeam(name)} />
      ) : (
        <>
          <div className="grid grid-cols-4 xl:grid-cols-8 gap-2 sm:gap-3 my-5 sm:my-6">
            <MetricCard label="Cartes" value={totalHits} icon="📊" />
            <MetricCard label="Joueurs" value={uniquePlayers} icon="🎴" />
            <MetricCard label="Logoman" value={logomanCount} icon="🔥" valueColor="var(--cat-logoman)" />
            <MetricCard label="Case Hit" value={caseHitCount} icon="✨" valueColor="var(--cat-case)" />
            <MetricCard label="Auto" value={autoCount} icon="✍️" valueColor="var(--cat-auto)" />
            <MetricCard label="Memo" value={memCount} icon="🧵" valueColor="var(--cat-mem)" />
            <MetricCard label="A+M" value={autoMemCount} icon="💎" valueColor="var(--cat-automem)" />
            <MetricCard label="Base" value={baseOtherCount} icon="📄" />
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

          <div className="mb-6">
            <div className="mb-3">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Résumé joueurs</h3>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Vue compilée des joueurs {isEntertainment ? "de cet univers" : "de cette équipe"} : volume, auto/memo, hits premium et score. Clique un joueur pour ouvrir son détail.
              </p>
            </div>
            <DataTable
              data={playerSummaryRows}
              columns={playerSummaryColumns}
              pageSize={25}
              exportName={`${selectedTeam.replace(/\s+/g, '_')}_joueurs`}
              initialSorting={[{ id: 'Score', desc: true }]}
              onRowClick={handlePlayerSummaryClick}
              mobileColumns={['Hits', 'Auto', 'CaseHit']}
            />
          </div>

          <DataTable data={filteredCards} columns={cardColumns} pageSize={50} exportName={selectedTeam.replace(/\s+/g, '_')} mobileColumns={['Box Type', 'Category']} />
        </>
      )}
    </div>
  )
}

/** Attend qu'une analyse soit chargée : les hooks du contenu s'exécutent toujours dans le même ordre. */
export function TeamDetailView() {
  const ready = useAppStore((s) => !!s.analysisData)
  return ready ? <TeamDetailViewContent /> : null
}
