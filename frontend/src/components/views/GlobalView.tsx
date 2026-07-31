import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { PlayerCell } from '../shared/PlayerCell'
import type { RankingRecord, CardRecord } from '../../types'
import { CATEGORY_CASE_HIT, CATEGORY_LOGOMAN, HIT_TYPE_AUTO, HIT_TYPE_AUTO_MEM, HIT_TYPE_MEM } from '../../types'

type RankingMode = 'volume' | 'premium' | 'auto' | 'case'

interface TopRow extends RankingRecord {
  Premium: number
  Auto: number
  Case: number
  Checklists: number
  'Premium %': number
}

const columnHelper = createColumnHelper<TopRow>()

export function GlobalView() {
  const { analysisData, setActiveView, setTargetPlayer, setTargetTeam } = useAppStore()
  const [rankingMode, setRankingMode] = useState<RankingMode>('volume')
  if (!analysisData) return null

  const { category_summary, metadata } = analysisData
  const isEntertainment = metadata.sport_key === 'disney' || metadata.sport_key === 'marvel'
  const teamLabel = isEntertainment ? 'Univers/Franchises' : 'Equipes'
  const teamSearchPlaceholder = isEntertainment ? 'Rechercher un univers ou une franchise...' : 'Rechercher une equipe...'
  const teamHeading = isEntertainment ? 'Top univers / franchises' : 'Top equipes'
  const teamDescription = isEntertainment
    ? 'Lecture rapide des franchises, univers et familles de personnages les plus presents.'
    : 'Lecture rapide des volumes avant d entrer dans le detail equipe.'

  const playerColumns = useMemo(() => [
    columnHelper.accessor('Player', {
      header: 'Joueur',
      cell: (info) => <PlayerCell name={info.getValue() ?? ''} requireRookieInSelection />,
    }),
    columnHelper.accessor('Hits', {
      header: 'Cartes',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor((row) => row.Premium, {
      id: 'Premium',
      header: 'Premium',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor((row) => row['Premium %'], {
      id: 'Premium %',
      header: '% premium',
      cell: (info) => `${info.getValue()}%`,
    }),
    columnHelper.accessor((row) => row.Checklists, {
      id: 'Checklists',
      header: 'Checklists',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
  ], [])

  const teamColumns = useMemo(() => [
    columnHelper.accessor('Team', { header: teamLabel, cell: (info) => info.getValue() }),
    columnHelper.accessor('Hits', {
      header: 'Cartes',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor((row) => row.Premium, {
      id: 'Premium',
      header: 'Premium',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor((row) => row['Premium %'], {
      id: 'Premium %',
      header: '% premium',
      cell: (info) => `${info.getValue()}%`,
    }),
    columnHelper.accessor((row) => row.Checklists, {
      id: 'Checklists',
      header: 'Checklists',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
  ], [teamLabel])

  const topTables = useMemo(() => buildTopTables(analysisData.cards), [analysisData.cards])
  const playerRows = useMemo(() => sortTopRows(topTables.players, rankingMode), [topTables.players, rankingMode])
  const teamRows = useMemo(() => sortTopRows(topTables.teams, rankingMode), [topTables.teams, rankingMode])
  const rankingSorting = useMemo(
    () => [{ id: rankingMode === 'volume' ? 'Hits' : rankingMode === 'premium' ? 'Premium' : rankingMode === 'auto' ? 'Auto' : 'Case', desc: true }],
    [rankingMode],
  )

  function handlePlayerClick(row: RankingRecord) {
    if (!row.Player) return
    setTargetPlayer(row.Player)
    setActiveView('🔍 Analyse Joueur')
  }

  function handleTeamClick(row: RankingRecord) {
    if (!row.Team) return
    setTargetTeam(row.Team)
    setActiveView('🛡️ Analyse Équipe')
  }

  const rankingLabel = rankingMode === 'premium'
      ? 'tries par premium'
    : rankingMode === 'auto'
      ? 'tries par hits auto/memo'
      : rankingMode === 'case'
        ? 'tries par case hit'
        : 'tries par volume'

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <MetricCard label="Lignes" value={metadata.total_rows} icon="📊" />
        <MetricCard label={teamLabel} value={metadata.unique_teams} icon="👥" />
        <MetricCard label="Joueurs" value={metadata.unique_players} icon="🎴" />
        <MetricCard label="Checklists" value={metadata.checklists_count} icon="📁" />
        <div className="col-span-2 sm:col-span-1">
          <MetricCard label={metadata.sport_label} value={metadata.sport_key.toUpperCase()} icon="🏷️" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        <MetricCard label="Logoman" value={category_summary.logoman} icon="🔥" valueColor="#ef4444" />
        <MetricCard label="Case Hit" value={category_summary.case_hit} icon="✨" valueColor="#eab308" />
        <MetricCard label="Auto" value={category_summary.auto} icon="✍️" valueColor="#0ea5e9" />
        <MetricCard label="Memo" value={category_summary.mem} icon="🧵" valueColor="#14b8a6" />
        <MetricCard label="Auto/Memo" value={category_summary.auto_mem} icon="💎" valueColor="#3b82f6" />
        <MetricCard label="Hits total" value={category_summary.hit_total} icon="🎯" valueColor="#6366f1" />
        <MetricCard label="Base/Autre" value={category_summary.base_other} icon="📄" />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Classement</span>
        {([
          ['volume', 'Volume'],
          ['premium', 'Premium'],
          ['auto', 'Hits'],
          ['case', 'Case Hit'],
        ] as const).map(([mode, label]) => {
          const active = rankingMode === mode
          return (
            <button
              key={mode}
              onClick={() => setRankingMode(mode)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                background: active ? 'var(--accent)' : 'var(--bg-surface)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="mb-3">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Top joueurs</h3>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Clique une ligne pour basculer directement sur l analyse detaillee, {rankingLabel}.
            </p>
          </div>

          <DataTable
            data={playerRows}
            columns={playerColumns as any}
            onRowClick={handlePlayerClick}
            searchable
            searchPlaceholder="Rechercher un joueur..."
            exportName="joueurs_global"
            initialSorting={rankingSorting}
          />
        </div>

        <div>
          <div className="mb-3">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{teamHeading}</h3>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {teamDescription} Les colonnes premium et couverture aident a arbitrer plus vite.
            </p>
          </div>

          <DataTable
            data={teamRows}
            columns={teamColumns as any}
            onRowClick={handleTeamClick}
            searchable
            searchPlaceholder={teamSearchPlaceholder}
            exportName="equipes_global"
            initialSorting={rankingSorting}
          />
        </div>
      </div>
    </div>
  )
}

function buildTopTables(cards: CardRecord[]) {
  const players = buildEntityRows(cards, 'player')
  const teams = buildEntityRows(cards, 'team')
  return { players, teams }
}

function buildEntityRows(cards: CardRecord[], kind: 'player' | 'team'): TopRow[] {
  const stats = new Map<string, { hits: number; premium: number; auto: number; caseHit: number; checklists: Set<string> }>()

  for (const card of cards) {
    const values = (kind === 'player' ? card.Player : card.Team)
      .split('/')
      .map((v) => v.trim())
      .filter(Boolean)

    for (const value of values) {
      const current = stats.get(value) || { hits: 0, premium: 0, auto: 0, caseHit: 0, checklists: new Set<string>() }
      current.hits += card.Hits
      current.checklists.add(card.checklist_name || card.File)
      if ([HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM].includes(card['Hit Type'] || '')) {
        current.auto += card.Hits
        current.premium += card.Hits
      }
      if (card.Category === CATEGORY_CASE_HIT) {
        current.caseHit += card.Hits
        current.premium += card.Hits
      }
      if (card.Category === CATEGORY_LOGOMAN) {
        current.premium += card.Hits
      }
      stats.set(value, current)
    }
  }

  return Array.from(stats.entries()).map(([name, row]) => ({
    ...(kind === 'player' ? { Player: name } : { Team: name }),
    Hits: row.hits,
    Premium: row.premium,
    Auto: row.auto,
    Case: row.caseHit,
    Checklists: row.checklists.size,
    'Premium %': row.hits > 0 ? Math.round((row.premium / row.hits) * 100) : 0,
  }))
}

function sortTopRows(rows: TopRow[], mode: RankingMode) {
  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (mode === 'premium') return b.Premium - a.Premium || b.Hits - a.Hits || b.Checklists - a.Checklists
    if (mode === 'auto') return b.Auto - a.Auto || b.Premium - a.Premium || b.Hits - a.Hits
    if (mode === 'case') return b.Case - a.Case || b.Premium - a.Premium || b.Hits - a.Hits
    return b.Hits - a.Hits || b.Premium - a.Premium || b.Checklists - a.Checklists
  })
  return sorted
}
