/**
 * Cellule joueur avec badge RC inline si rookie.
 * Affiche aussi l'année rookie au survol.
 */

import { RCBadge } from './RCBadge'
import { useRookies } from '../../hooks/useRookies'

interface PlayerCellProps {
  name: string
}

export function PlayerCell({ name }: PlayerCellProps) {
  const { getRookie } = useRookies()
  const rookie = getRookie(name)

  if (!rookie) return <span>{name}</span>

  return (
    <span className="flex items-center gap-1.5">
      <span>{name}</span>
      <span title={`RC ${rookie.year_start}-${rookie.year_end}${rookie.draft_pick ? ` · Pick #${rookie.draft_pick}` : ''}`}>
        <RCBadge size="sm" />
      </span>
      <span className="text-xs" style={{ color: 'rgba(255,215,0,0.7)' }}>
        {rookie.year_start}-{String(rookie.year_end).slice(-2)}
      </span>
    </span>
  )
}
