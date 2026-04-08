import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPlayerStats } from '../../api/client'
import type { PlayerSeason } from '../../types'

interface Props {
  playerName: string
}

export function PlayerStatsPanel({ playerName }: Props) {
  const [expanded, setExpanded] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['player-stats', playerName],
    queryFn: () => fetchPlayerStats(playerName),
    enabled: expanded,
    staleTime: 24 * 60 * 60 * 1000, // 24h
    retry: 1,
  })

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)' }}
      >
        🏀 Voir stats carrière NBA
      </button>
    )
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>🏀 Stats carrière NBA</span>
        <button onClick={() => setExpanded(false)} className="text-xs" style={{ color: 'var(--text-quaternary)' }}>✕</button>
      </div>

      {isLoading && (
        <div className="p-4 space-y-3">
          <div className="flex gap-3">
            <div className="rounded-lg flex-shrink-0 animate-pulse" style={{ width: 64, height: 48, background: 'var(--bg-hover)' }} />
            <div className="flex-1 space-y-2">
              <div className="h-4 rounded animate-pulse" style={{ background: 'var(--bg-hover)', width: '60%' }} />
              <div className="h-3 rounded animate-pulse" style={{ background: 'var(--bg-hover)', width: '40%' }} />
            </div>
          </div>
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="h-7 rounded animate-pulse" style={{ background: 'var(--bg-hover)', opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      )}

      {isError && (
        <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-quaternary)' }}>
          Joueur introuvable dans la base NBA ou service indisponible.
        </div>
      )}

      {data && (
        <div>
          {/* Bio */}
          <div className="flex items-start gap-4 p-4">
            <img
              src={data.photo_url}
              alt={data.full_name}
              className="w-16 h-12 object-cover rounded-lg flex-shrink-0"
              style={{ background: 'var(--bg-hover)' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{data.full_name}</span>
                {data.is_active && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>Actif</span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {data.position && <span>{data.position}</span>}
                {data.height && <span>{data.height}</span>}
                {data.team && <span>{data.team}</span>}
                {data.country && <span>🌍 {data.country}</span>}
                {data.draft && <span>Draft: {data.draft}</span>}
              </div>
            </div>
          </div>

          {/* Tableau stats */}
          {data.seasons.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
                    {['Saison', 'Équipe', 'J', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%'].map((h) => (
                      <th key={h} className="px-3 py-2 text-right first:text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...data.seasons].reverse().map((s: PlayerSeason, i: number) => (
                    <tr
                      key={s.season}
                      style={{
                        borderTop: '1px solid var(--border-subtle)',
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <td className="px-3 py-1.5 font-medium" style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{s.season}</td>
                      <td className="px-3 py-1.5" style={{ color: 'var(--text-tertiary)' }}>{s.team}</td>
                      <td className="px-3 py-1.5 text-right">{s.gp}</td>
                      <td className="px-3 py-1.5 text-right font-medium" style={{ color: 'var(--accent)' }}>{s.pts}</td>
                      <td className="px-3 py-1.5 text-right">{s.reb}</td>
                      <td className="px-3 py-1.5 text-right">{s.ast}</td>
                      <td className="px-3 py-1.5 text-right">{s.stl}</td>
                      <td className="px-3 py-1.5 text-right">{s.blk}</td>
                      <td className="px-3 py-1.5 text-right">{s.fg_pct}%</td>
                      <td className="px-3 py-1.5 text-right">{s.fg3_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
