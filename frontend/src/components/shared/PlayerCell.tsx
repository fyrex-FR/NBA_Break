/**
 * Cellule joueur avec badge RC inline si rookie.
 * requireRookieInSelection=true : n'affiche le badge que si le joueur
 * a des cartes de son année rookie dans la sélection courante.
 */

import { useMemo } from 'react'
import { RCBadge } from './RCBadge'
import { useRookies } from '../../hooks/useRookies'
import { useAppStore } from '../../stores/appStore'

interface PlayerCellProps {
  name: string
  requireRookieInSelection?: boolean
}

export function PlayerCell({ name, requireRookieInSelection = false }: PlayerCellProps) {
  const { getRookie } = useRookies()
  const analysisData = useAppStore((s) => s.analysisData)
  const rookie = getRookie(name)

  const showBadge = useMemo(() => {
    if (!rookie) return false
    if (!requireRookieInSelection) return true
    if (!analysisData) return false
    return analysisData.cards.some(
      (c) =>
        c.Player.split('/').map((p) => p.trim()).includes(name) &&
        parseInt(c.Year, 10) === rookie.year_start,
    )
  }, [rookie, requireRookieInSelection, analysisData, name])

  if (!showBadge) return <span>{name}</span>

  return (
    <span className="flex items-center gap-1.5">
      <span>{name}</span>
      <span title={`RC ${rookie!.year_start}-${rookie!.year_end}${rookie!.draft_pick ? ` · Pick #${rookie!.draft_pick}` : ''}`}>
        <RCBadge size="sm" />
      </span>
      <span className="text-xs" style={{ color: 'var(--rc-year-color, rgba(255,215,0,0.8))' }}>
        {rookie!.year_start}-{String(rookie!.year_end).slice(-2)}
      </span>
    </span>
  )
}
