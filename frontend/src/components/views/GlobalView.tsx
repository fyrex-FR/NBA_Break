import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { Segmented } from '../ui/primitives'
import { CATEGORY_META } from '../../constants/categories'
import { PlayerCell } from '../shared/PlayerCell'
import type { RankingRecord, CardRecord, AnalyzeResponse } from '../../types'
import { CATEGORY_CASE_HIT, CATEGORY_LOGOMAN, HIT_TYPE_AUTO, HIT_TYPE_AUTO_MEM, HIT_TYPE_MEM } from '../../types'

type RankingMode = 'volume' | 'premium' | 'auto' | 'case'

interface TopRow extends RankingRecord {
  Premium: number
  HitTotal: number
  Auto: number
  Memo: number
  AutoMemo: number
  Case: number
  Checklists: number
  'Premium %': number
}

const columnHelper = createColumnHelper<TopRow>()

// Séparateurs de la grille KPI : 2 colonnes en mobile, 4 en desktop.
const KPI_BORDERS = ['', 'border-l', 'border-t lg:border-t-0 lg:border-l', 'border-l border-t lg:border-t-0']

export function GlobalView() {
  const analysisData = useAppStore((s) => s.analysisData)
  if (!analysisData) return null
  return <GlobalViewContent analysisData={analysisData} />
}

function GlobalViewContent({ analysisData }: { analysisData: AnalyzeResponse }) {
  const { setActiveView, setTargetPlayer, setTargetTeam } = useAppStore()
  const [rankingMode, setRankingMode] = useState<RankingMode>('volume')
  const [entity, setEntity] = useState<'players' | 'teams'>('players')

  const { category_summary, metadata } = analysisData
  const isEntertainment = metadata.sport_key === 'disney' || metadata.sport_key === 'marvel'
  const teamLabel = isEntertainment ? 'Univers / franchises' : 'Équipes'
  const teamSearchPlaceholder = isEntertainment ? 'Rechercher un univers ou une franchise...' : 'Rechercher une équipe...'

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
    columnHelper.accessor((row) => row.HitTotal, {
      id: 'HitTotal',
      header: 'Hits',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor((row) => row.Auto, {
      id: 'Auto',
      header: 'Auto',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor((row) => row.Memo, {
      id: 'Memo',
      header: 'Memo',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor((row) => row.AutoMemo, {
      id: 'AutoMemo',
      header: 'A+M',
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
    columnHelper.accessor((row) => row.HitTotal, {
      id: 'HitTotal',
      header: 'Hits',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor((row) => row.Auto, {
      id: 'Auto',
      header: 'Auto',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor((row) => row.Memo, {
      id: 'Memo',
      header: 'Memo',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor((row) => row.AutoMemo, {
      id: 'AutoMemo',
      header: 'A+M',
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
    () => [{ id: rankingMode === 'volume' ? 'Hits' : rankingMode === 'premium' ? 'Premium' : rankingMode === 'auto' ? 'HitTotal' : 'Case', desc: true }],
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
      ? 'trié par cartes premium'
    : rankingMode === 'auto'
      ? 'trié par hits auto/memo'
      : rankingMode === 'case'
        ? 'trié par case hits'
        : 'trié par volume'

  const total = metadata.total_rows || 1
  const premiumTotal = category_summary.hit_total + category_summary.case_hit + category_summary.logoman
  const kpis = [
    { label: 'Cartes', value: metadata.total_rows, hint: `${metadata.checklists_count} checklist${metadata.checklists_count > 1 ? 's' : ''}` },
    { label: 'Joueurs', value: metadata.unique_players },
    { label: teamLabel, value: metadata.unique_teams },
    { label: 'Hits premium', value: premiumTotal, hint: `${Math.round((premiumTotal / total) * 100)} % des cartes`, accent: true },
  ]
  const segments = CATEGORY_META.map((m) => ({ ...m, value: category_summary[m.key] ?? 0 }))

  return (
    <div className="space-y-6">
      <section className="ui-card grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`px-5 py-4 border-[var(--border-subtle)] ${KPI_BORDERS[i]}`}
          >
            <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
            <div className="mt-1 text-[26px] sm:text-[28px] leading-8 font-semibold font-mono-num" style={{ color: k.accent ? 'var(--accent)' : 'var(--text-primary)' }}>
              {k.value.toLocaleString('fr-FR')}
            </div>
            {k.hint && <div className="text-xs mt-0.5" style={{ color: 'var(--text-quaternary)' }}>{k.hint}</div>}
          </div>
        ))}
      </section>

      <section className="ui-card p-4 sm:p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Répartition des cartes</h2>
          <span className="hidden sm:inline text-xs" style={{ color: 'var(--text-quaternary)' }}>Clique une catégorie pour l’explorer</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden gap-[2px]" role="img" aria-label="Répartition des cartes par catégorie">
          {segments.filter((s) => s.value > 0).map((s) => (
            <div key={s.key} title={`${s.label} : ${s.value.toLocaleString('fr-FR')}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color, minWidth: 3 }} />
          ))}
        </div>
        <div className="mt-3 sm:mt-4 grid grid-cols-3 lg:grid-cols-6 gap-0.5 sm:gap-1 -mx-1.5 sm:mx-0">
          {segments.map((s) => {
            const clickable = !!s.view && s.value > 0
            return (
              <button
                key={s.key}
                disabled={!clickable}
                onClick={() => s.view && setActiveView(s.view)}
                className={`text-left rounded-lg px-1.5 sm:px-2.5 py-1.5 sm:py-2 transition-colors min-w-0 ${clickable ? 'ui-row-hover' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color, opacity: s.value > 0 ? 1 : 0.35 }} />
                  {s.label}
                </div>
                <div className="flex items-baseline gap-1 sm:gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[15px] sm:text-[17px] font-semibold num" style={{ color: s.value > 0 ? 'var(--text-primary)' : 'var(--text-quaternary)' }}>
                    {s.value.toLocaleString('fr-FR')}
                  </span>
                  <span className="text-xs num" style={{ color: 'var(--text-quaternary)' }}>
                    {s.value > 0 ? `${((s.value / total) * 100).toFixed(s.value / total < 0.01 ? 1 : 0)} %` : '—'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Classement</h2>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {entity === 'players' ? 'Clique un joueur pour ouvrir sa fiche' : `Clique ${isEntertainment ? 'une franchise' : 'une équipe'} pour ouvrir sa fiche`}, {rankingLabel}.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Segmented<'players' | 'teams'>
              value={entity}
              onChange={setEntity}
              ariaLabel="Entité"
              options={[
                { value: 'players', label: 'Joueurs', count: playerRows.length },
                { value: 'teams', label: isEntertainment ? 'Franchises' : 'Équipes', count: teamRows.length },
              ]}
            />
            <Segmented<RankingMode>
              value={rankingMode}
              onChange={setRankingMode}
              ariaLabel="Critère de classement"
              options={[
                { value: 'volume', label: 'Volume' },
                { value: 'premium', label: 'Premium' },
                { value: 'auto', label: 'Hits' },
                { value: 'case', label: 'Case hit' },
              ]}
            />
          </div>
        </div>

        {entity === 'players' ? (
          <DataTable
            key="players"
            data={playerRows}
            columns={playerColumns}
            onRowClick={handlePlayerClick}
            searchable
            searchPlaceholder="Rechercher un joueur..."
            exportName="joueurs_global"
            initialSorting={rankingSorting}
            rankColumn
          />
        ) : (
          <DataTable
            key="teams"
            data={teamRows}
            columns={teamColumns}
            onRowClick={handleTeamClick}
            searchable
            searchPlaceholder={teamSearchPlaceholder}
            exportName="equipes_global"
            initialSorting={rankingSorting}
            rankColumn
          />
        )}
      </section>
    </div>
  )
}

function buildTopTables(cards: CardRecord[]) {
  const players = buildEntityRows(cards, 'player')
  const teams = buildEntityRows(cards, 'team')
  return { players, teams }
}

function buildEntityRows(cards: CardRecord[], kind: 'player' | 'team'): TopRow[] {
  const stats = new Map<string, { hits: number; premium: number; auto: number; memo: number; autoMemo: number; caseHit: number; checklists: Set<string> }>()

  for (const card of cards) {
    const values = (kind === 'player' ? card.Player : card.Team)
      .split('/')
      .map((v) => v.trim())
      .filter(Boolean)

    for (const value of values) {
      const current = stats.get(value) || { hits: 0, premium: 0, auto: 0, memo: 0, autoMemo: 0, caseHit: 0, checklists: new Set<string>() }
      current.hits += card.Hits
      current.checklists.add(card.checklist_name || card.File)
      if ([HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM].includes(card['Hit Type'] || '')) {
        current.premium += card.Hits
      }
      if (card['Hit Type'] === HIT_TYPE_AUTO) current.auto += card.Hits
      if (card['Hit Type'] === HIT_TYPE_MEM) current.memo += card.Hits
      if (card['Hit Type'] === HIT_TYPE_AUTO_MEM) current.autoMemo += card.Hits
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
    HitTotal: row.auto + row.memo + row.autoMemo,
    Auto: row.auto,
    Memo: row.memo,
    AutoMemo: row.autoMemo,
    Case: row.caseHit,
    Checklists: row.checklists.size,
    'Premium %': row.hits > 0 ? Math.round((row.premium / row.hits) * 100) : 0,
  }))
}

function sortTopRows(rows: TopRow[], mode: RankingMode) {
  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (mode === 'premium') return b.Premium - a.Premium || b.Hits - a.Hits || b.Checklists - a.Checklists
    if (mode === 'auto') return (b.Auto + b.Memo + b.AutoMemo) - (a.Auto + a.Memo + a.AutoMemo) || b.Premium - a.Premium || b.Hits - a.Hits
    if (mode === 'case') return b.Case - a.Case || b.Premium - a.Premium || b.Hits - a.Hits
    return b.Hits - a.Hits || b.Premium - a.Premium || b.Checklists - a.Checklists
  })
  return sorted
}
