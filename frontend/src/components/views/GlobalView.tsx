import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { PlayerCell } from '../shared/PlayerCell'
import type { RankingRecord, CardRecord } from '../../types'
import { CATEGORY_AUTO_MEM, CATEGORY_CASE_HIT, CATEGORY_LOGOMAN } from '../../types'

const columnHelper = createColumnHelper<RankingRecord>()
type RankingMode = 'volume' | 'premium' | 'auto' | 'case'

interface TopRow extends RankingRecord {
  Premium: number
  Auto: number
  Case: number
  Checklists: number
  'Premium %': number
}

export function GlobalView() {
  const { analysisData, setActiveView, setTargetPlayer, setTargetTeam } = useAppStore()
  const [rankingMode, setRankingMode] = useState<RankingMode>('volume')
  if (!analysisData) return null

  const { player_rankings, team_rankings, category_summary, metadata } = analysisData
  const isDisney = metadata.sport_key === 'disney'
  const teamLabel = isDisney ? 'Univers/Lieux' : 'Equipes'
  const teamSearchPlaceholder = isDisney ? 'Rechercher un univers ou lieu...' : 'Rechercher une equipe...'
  const teamHeading = isDisney ? 'Top univers / lieux' : 'Top equipes'
  const teamDescription = isDisney
    ? 'Lecture rapide des franchises, univers et lieux les plus presents.'
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
    columnHelper.accessor('Premium' as never, {
      header: 'Premium',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor('Premium %' as never, {
      header: '% premium',
      cell: (info) => `${info.getValue()}%`,
    }),
    columnHelper.accessor('Checklists' as never, {
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
    columnHelper.accessor('Premium' as never, {
      header: 'Premium',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
    columnHelper.accessor('Premium %' as never, {
      header: '% premium',
      cell: (info) => `${info.getValue()}%`,
    }),
    columnHelper.accessor('Checklists' as never, {
      header: 'Checklists',
      cell: (info) => info.getValue()?.toLocaleString('fr-FR'),
    }),
  ], [teamLabel])

  const topTables = useMemo(() => buildTopTables(analysisData.cards), [analysisData.cards])
  const playerRows = useMemo(() => sortTopRows(topTables.players, rankingMode), [topTables.players, rankingMode])
  const teamRows = useMemo(() => sortTopRows(topTables.teams, rankingMode), [topTables.teams, rankingMode])

  const checklistRadar = useMemo(() => {
    const checklistStats = new Map<string, {
      checklist_name: string
      total: number
      premium: number
      auto: number
      caseHit: number
      logoman: number
      year: string
    }>()

    for (const card of analysisData.cards) {
      const checklistKey = card.checklist_name || card.File
      const entry = checklistStats.get(checklistKey) || {
        checklist_name: checklistKey,
        total: 0,
        premium: 0,
        auto: 0,
        caseHit: 0,
        logoman: 0,
        year: card.Year,
      }
      entry.total += card.Hits
      if (card.Category === CATEGORY_AUTO_MEM) {
        entry.auto += card.Hits
        entry.premium += card.Hits
      }
      if (card.Category === CATEGORY_CASE_HIT) {
        entry.caseHit += card.Hits
        entry.premium += card.Hits
      }
      if (card.Category === CATEGORY_LOGOMAN) {
        entry.logoman += card.Hits
        entry.premium += card.Hits
      }
      checklistStats.set(checklistKey, entry)
    }

    return Array.from(checklistStats.values())
      .map((item) => ({
        ...item,
        premiumRate: item.total > 0 ? Math.round((item.premium / item.total) * 100) : 0,
      }))
      .sort((a, b) => b.premiumRate - a.premiumRate || b.premium - a.premium || b.total - a.total)
      .slice(0, 3)
  }, [analysisData.cards])

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
      ? 'tries par auto/mem'
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Logoman" value={category_summary.logoman} icon="🔥" valueColor="#ef4444" />
        <MetricCard label="Case Hit" value={category_summary.case_hit} icon="✨" valueColor="#eab308" />
        <MetricCard label="Auto/Mem" value={category_summary.auto_mem} icon="💎" valueColor="#3b82f6" />
        <MetricCard label="Base/Autre" value={category_summary.base_other} icon="📄" />
      </div>

      {checklistRadar.length > 0 && (
        <div className="rounded-2xl p-4 mb-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Checklist Radar</p>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Les plus denses de la selection</h3>
            </div>
            <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
              Premium = auto + case + logoman
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            {checklistRadar.map((item, index) => (
              <div key={item.checklist_name} className="rounded-xl px-3.5 py-3" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold mb-1" style={{ color: 'var(--accent)' }}>
                      #{index + 1} {item.year ? `· ${item.year}` : ''}
                    </div>
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {item.checklist_name.replace('.parquet', '')}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{item.premiumRate}%</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-quaternary)' }}>premium</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: 'var(--text-tertiary)' }}>
                  <span>{item.premium} premium</span>
                  <span>·</span>
                  <span>{item.total} lignes</span>
                  <span>·</span>
                  <span>{item.auto} auto</span>
                  <span>·</span>
                  <span>{item.caseHit} case</span>
                  <span>·</span>
                  <span>{item.logoman} logoman</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Classement</span>
        {([
          ['volume', 'Volume'],
          ['premium', 'Premium'],
          ['auto', 'Auto/Mem'],
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
            initialSorting={[{ id: rankingMode === 'volume' ? 'Hits' : rankingMode === 'premium' ? 'Premium' : rankingMode === 'auto' ? 'Auto' : 'Case', desc: true }]}
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
            initialSorting={[{ id: rankingMode === 'volume' ? 'Hits' : rankingMode === 'premium' ? 'Premium' : rankingMode === 'auto' ? 'Auto' : 'Case', desc: true }]}
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
      if (card.Category === CATEGORY_AUTO_MEM) {
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
