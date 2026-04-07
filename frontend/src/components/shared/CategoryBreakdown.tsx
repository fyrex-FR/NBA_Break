/**
 * Horizontal stacked bar replacing ugly pie charts.
 * Shows category distribution as a compact inline bar + legend.
 */

import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM, CATEGORY_BASE_OTHER } from '../../types'

const COLORS: Record<string, string> = {
  [CATEGORY_LOGOMAN]: '#ef4444',
  [CATEGORY_CASE_HIT]: '#eab308',
  [CATEGORY_AUTO_MEM]: '#3b82f6',
  [CATEGORY_BASE_OTHER]: '#475569',
}

const LABELS: Record<string, string> = {
  [CATEGORY_LOGOMAN]: 'Logoman',
  [CATEGORY_CASE_HIT]: 'Case Hit',
  [CATEGORY_AUTO_MEM]: 'Auto/Mem',
  [CATEGORY_BASE_OTHER]: 'Base',
}

interface CategoryBreakdownProps {
  data: { name: string; value: number }[]
  title?: string
}

export function CategoryBreakdown({ data, title }: CategoryBreakdownProps) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null

  // Filter out zero values and sort by defined order
  const order = [CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM, CATEGORY_BASE_OTHER]
  const sorted = order
    .map((cat) => data.find((d) => d.name === cat))
    .filter((d): d is { name: string; value: number } => !!d && d.value > 0)

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      {title && (
        <div className="text-xs font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>{title}</div>
      )}

      {/* Stacked bar */}
      <div className="flex rounded-full overflow-hidden h-3 mb-3" style={{ background: 'var(--bg-hover)' }}>
        {sorted.map((d) => (
          <div
            key={d.name}
            style={{
              width: `${(d.value / total) * 100}%`,
              background: COLORS[d.name] || '#475569',
              minWidth: d.value > 0 ? '4px' : 0,
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sorted.map((d) => {
          const pct = ((d.value / total) * 100).toFixed(0)
          return (
            <div key={d.name} className="flex items-center gap-1.5 text-xs">
              <div className="w-2 h-2 rounded-full" style={{ background: COLORS[d.name] }} />
              <span style={{ color: 'var(--text-secondary)' }}>{LABELS[d.name] || d.name}</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.value}</span>
              <span style={{ color: 'var(--text-quaternary)' }}>({pct}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
