import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchTeamStats } from '../../api/client'
import type { TeamGame } from '../../types'

interface Props {
  teamName: string
}

export function TeamStatsPanel({ teamName }: Props) {
  const [expanded, setExpanded] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['team-stats', teamName],
    queryFn: () => fetchTeamStats(teamName),
    enabled: expanded,
    staleTime: 6 * 60 * 60 * 1000, // 6h
    retry: 1,
  })

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)' }}
      >
        🏀 Voir stats équipe
      </button>
    )
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>🏀 Stats équipe</span>
        <button onClick={() => setExpanded(false)} className="text-xs" style={{ color: 'var(--text-quaternary)' }}>✕</button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8 gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <span className="animate-pulse">⏳</span> Chargement depuis NBA.com...
        </div>
      )}

      {isError && (
        <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-quaternary)' }}>
          Équipe introuvable dans la base NBA ou service indisponible.
        </div>
      )}

      {data && (
        <div className="p-4 space-y-4">
          {/* Header équipe */}
          <div className="flex items-center gap-3">
            <img
              src={data.logo_url}
              alt={data.full_name}
              className="w-10 h-10 object-contain flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div>
              <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{data.full_name}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Saison {data.season}</div>
            </div>
          </div>

          {/* Classement */}
          {data.standing && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Classement', value: data.standing.label },
                { label: 'Bilan', value: `${data.standing.wins}-${data.standing.losses}` },
                { label: 'Streak', value: data.standing.streak },
                { label: '10 derniers', value: data.standing.last_10 },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-hover)' }}>
                  <div className="text-xs mb-0.5" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* 5 derniers matchs */}
          {data.last_games.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-2 uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                5 derniers matchs
              </div>
              <div className="space-y-1">
                {data.last_games.map((g: TeamGame, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--bg-hover)' }}
                  >
                    <span
                      className="w-5 h-5 rounded flex items-center justify-center font-bold flex-shrink-0 text-xs"
                      style={{
                        background: g.wl === 'W' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                        color: g.wl === 'W' ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {g.wl}
                    </span>
                    <span className="flex-1 font-medium" style={{ color: 'var(--text-primary)' }}>{g.matchup}</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{g.pts} pts</span>
                    <span style={{ color: 'var(--text-quaternary)' }}>{g.reb} reb</span>
                    <span style={{ color: 'var(--text-quaternary)' }}>{g.ast} ast</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>{g.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
