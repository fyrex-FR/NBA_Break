import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { PlayerCell } from '../shared/PlayerCell'
import type { RankingRecord } from '../../types'
import { CATEGORY_AUTO_MEM, CATEGORY_CASE_HIT, CATEGORY_LOGOMAN } from '../../types'

const columnHelper = createColumnHelper<RankingRecord>()

const playerColumns = [
  columnHelper.accessor('Player', { header: 'Joueur', cell: (info) => <PlayerCell name={info.getValue() ?? ''} requireRookieInSelection /> }),
  columnHelper.accessor('Hits', { header: 'Cartes', cell: (info) => info.getValue()?.toLocaleString('fr-FR') }),
]

const teamColumns = [
  columnHelper.accessor('Team', { header: 'Équipe', cell: (info) => info.getValue() }),
  columnHelper.accessor('Hits', { header: 'Cartes', cell: (info) => info.getValue()?.toLocaleString('fr-FR') }),
]

export function GlobalView() {
  const { analysisData, setActiveView, setTargetPlayer, setTargetTeam } = useAppStore()
  if (!analysisData) return null

  const { player_rankings, team_rankings, category_summary, metadata } = analysisData
  const premiumSummary = useMemo(() => {
    const playerPremium = new Map<string, { hits: number; score: number }>()
    const teamPremium = new Map<string, { hits: number; score: number }>()
    const checklistStats = new Map<string, {
      checklist_name: string
      total: number
      premium: number
      auto: number
      caseHit: number
      logoman: number
      score: number
      year: string
    }>()

    for (const card of analysisData.cards) {
      const category = card.Category
      const isPremium = category === CATEGORY_AUTO_MEM || category === CATEGORY_CASE_HIT || category === CATEGORY_LOGOMAN
      const weight = category === CATEGORY_LOGOMAN ? 8 : category === CATEGORY_CASE_HIT ? 4 : category === CATEGORY_AUTO_MEM ? 2 : 0
      const weightedHits = card.Hits * weight

      const checklistKey = card.checklist_name || card.File
      const entry = checklistStats.get(checklistKey) || {
        checklist_name: checklistKey,
        total: 0,
        premium: 0,
        auto: 0,
        caseHit: 0,
        logoman: 0,
        score: 0,
        year: card.Year,
      }
      entry.total += card.Hits
      entry.score += weightedHits
      if (category === CATEGORY_AUTO_MEM) entry.auto += card.Hits
      if (category === CATEGORY_CASE_HIT) entry.caseHit += card.Hits
      if (category === CATEGORY_LOGOMAN) entry.logoman += card.Hits
      if (isPremium) entry.premium += card.Hits
      checklistStats.set(checklistKey, entry)

      if (isPremium) {
        for (const player of card.Player.split('/').map((v) => v.trim()).filter(Boolean)) {
          const current = playerPremium.get(player) || { hits: 0, score: 0 }
          current.hits += card.Hits
          current.score += weightedHits
          playerPremium.set(player, current)
        }

        for (const team of card.Team.split('/').map((v) => v.trim()).filter(Boolean)) {
          const current = teamPremium.get(team) || { hits: 0, score: 0 }
          current.hits += card.Hits
          current.score += weightedHits
          teamPremium.set(team, current)
        }
      }
    }

    const topPremiumPlayer = Array.from(playerPremium.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.score - a.score || b.hits - a.hits)[0]

    const topPremiumTeam = Array.from(teamPremium.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.score - a.score || b.hits - a.hits)[0]

    const checklistRadar = Array.from(checklistStats.values())
      .map((item) => ({
        ...item,
        premiumRate: item.total > 0 ? Math.round((item.premium / item.total) * 100) : 0,
      }))
      .sort((a, b) => b.score - a.score || b.premiumRate - a.premiumRate || b.total - a.total)
      .slice(0, 5)

    return { topPremiumPlayer, topPremiumTeam, checklistRadar }
  }, [analysisData.cards])

  function handlePlayerClick(row: RankingRecord) {
    if (row.Player) {
      setTargetPlayer(row.Player)
      setActiveView('🔍 Analyse Joueur')
    }
  }

  function handleTeamClick(row: RankingRecord) {
    if (row.Team) {
      setTargetTeam(row.Team)
      setActiveView('🛡️ Analyse Équipe')
    }
  }

  const leadPlayer = player_rankings[0]
  const leadTeam = team_rankings[0]
  const topChecklist = premiumSummary.checklistRadar[0]

  return (
    <div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <MetricCard label="Lignes" value={metadata.total_rows} icon="📊" />
        <MetricCard label="Équipes" value={metadata.unique_teams} icon="👥" />
        <MetricCard label="Joueurs" value={metadata.unique_players} icon="🎴" />
        <MetricCard label="Checklists" value={metadata.checklists_count} icon="📁" />
        <div className="col-span-2 sm:col-span-1">
          <MetricCard label={metadata.sport_label} value={metadata.sport_key.toUpperCase()} icon="🏷️" />
        </div>
      </div>

      {/* Category summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Logoman" value={category_summary.logoman} icon="🔥" valueColor="#ef4444" />
        <MetricCard label="Case Hit" value={category_summary.case_hit} icon="✨" valueColor="#eab308" />
        <MetricCard label="Auto/Mem" value={category_summary.auto_mem} icon="💎" valueColor="#3b82f6" />
        <MetricCard label="Base/Autre" value={category_summary.base_other} icon="📄" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-6 mb-6">
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Radar</p>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Ce qui mérite ton attention</h3>
            </div>
            <div className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'var(--bg-panel)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)' }}>
              Premium = auto + case + logoman
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <InsightCard
              eyebrow="Leader volume"
              title={leadPlayer?.Player || '—'}
              subtitle={leadPlayer ? `${leadPlayer.Hits.toLocaleString('fr-FR')} cartes dans la sélection` : 'Aucune donnée'}
              actionLabel={leadPlayer?.Player ? 'Ouvrir joueur' : undefined}
              onAction={leadPlayer?.Player ? () => handlePlayerClick({ Player: leadPlayer.Player, Hits: leadPlayer.Hits }) : undefined}
            />
            <InsightCard
              eyebrow="Cible premium"
              title={premiumSummary.topPremiumPlayer?.name || '—'}
              subtitle={premiumSummary.topPremiumPlayer ? `${premiumSummary.topPremiumPlayer.hits} hits premium · score ${premiumSummary.topPremiumPlayer.score}` : 'Aucune carte premium'}
              actionLabel={premiumSummary.topPremiumPlayer?.name ? 'Voir détail' : undefined}
              onAction={premiumSummary.topPremiumPlayer?.name ? () => handlePlayerClick({ Player: premiumSummary.topPremiumPlayer?.name, Hits: premiumSummary.topPremiumPlayer?.hits || 0 }) : undefined}
            />
            <InsightCard
              eyebrow="Équipe chaude"
              title={premiumSummary.topPremiumTeam?.name || leadTeam?.Team || '—'}
              subtitle={premiumSummary.topPremiumTeam ? `${premiumSummary.topPremiumTeam.hits} hits premium · score ${premiumSummary.topPremiumTeam.score}` : leadTeam ? `${leadTeam.Hits.toLocaleString('fr-FR')} cartes au total` : 'Aucune équipe'}
              actionLabel={(premiumSummary.topPremiumTeam?.name || leadTeam?.Team) ? 'Ouvrir équipe' : undefined}
              onAction={(premiumSummary.topPremiumTeam?.name || leadTeam?.Team) ? () => handleTeamClick({ Team: premiumSummary.topPremiumTeam?.name || leadTeam?.Team, Hits: premiumSummary.topPremiumTeam?.hits || leadTeam?.Hits || 0 }) : undefined}
            />
          </div>
        </div>

        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Checklist Radar</p>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Checklists les plus denses</h3>
          </div>
          <div className="space-y-2.5">
            {premiumSummary.checklistRadar.map((item, index) => (
              <div key={item.checklist_name} className="rounded-xl px-3.5 py-3" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-xs font-semibold mb-1" style={{ color: 'var(--accent)' }}>#{index + 1} · {item.year || 'Inconnue'}</div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.checklist_name.replace('.parquet', '')}</div>
                  </div>
                  <div className="text-right">
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
            {!topChecklist && (
              <div className="text-sm" style={{ color: 'var(--text-quaternary)' }}>
                Aucune checklist ne ressort sur la sélection actuelle.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two-column: Players & Teams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Players */}
        <div>
          <div className="mb-3">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Top joueurs</h3>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Clique une ligne pour basculer directement sur l’analyse détaillée.
            </p>
          </div>


          <DataTable
            data={player_rankings}
            columns={playerColumns as any}
            onRowClick={handlePlayerClick}
            searchable
            searchPlaceholder="Rechercher un joueur..."
            exportName="joueurs_global"
          />
        </div>

        {/* Teams */}
        <div>
          <div className="mb-3">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Top équipes</h3>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Lecture rapide des volumes avant d’entrer dans le détail équipe.
            </p>
          </div>


          <DataTable
            data={team_rankings}
            columns={teamColumns as any}
            onRowClick={handleTeamClick}
            searchable
            searchPlaceholder="Rechercher une équipe..."
            exportName="equipes_global"
          />
        </div>
      </div>
    </div>
  )
}

interface InsightCardProps {
  eyebrow: string
  title: string
  subtitle: string
  actionLabel?: string
  onAction?: () => void
}

function InsightCard({ eyebrow, title, subtitle, actionLabel, onAction }: InsightCardProps) {
  return (
    <div className="rounded-xl p-4 h-full flex flex-col" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>{eyebrow}</div>
      <div className="text-lg font-semibold leading-tight mb-2" style={{ color: 'var(--text-primary)' }}>{title}</div>
      <div className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>{subtitle}</div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-auto w-fit px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
