import type { PlayerAwards } from '../types'

export const AWARD_LABELS: { key: keyof PlayerAwards; icon: string; label: string; color: string }[] = [
  { key: 'hof',        icon: '🏛️', label: 'Hall of Fame', color: '#FFD700' },
  { key: 'mvp',        icon: '🏆', label: 'MVP',           color: '#FFD700' },
  { key: 'champion',   icon: '💍', label: 'Champion',      color: '#C0C0C0' },
  { key: 'finals',     icon: '🏟️', label: 'Finales',       color: '#94a3b8' },
  { key: 'finals_mvp', icon: '🎖️', label: 'Finals MVP',    color: '#FFD700' },
  { key: 'dpoy',       icon: '🛡️', label: 'DPOY',          color: '#3b82f6' },
  { key: 'roy',        icon: '🌱', label: 'ROY',           color: '#22c55e' },
  { key: 'allstar',    icon: '⭐', label: 'All-Star',      color: '#a78bfa' },
  { key: 'all_nba',    icon: '🏅', label: 'All-NBA',       color: '#fb923c' },
  { key: 'mip',        icon: '📈', label: 'MIP',           color: '#38bdf8' },
  { key: 'sixth_man',  icon: '6️⃣', label: '6th Man',      color: '#f472b6' },
]
