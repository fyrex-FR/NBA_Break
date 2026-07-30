/**
 * Horizontal stacked bar replacing ugly pie charts.
 * Shows category distribution as a compact inline bar + legend.
 * Segments and legend items are clickable to filter.
 */

import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO, CATEGORY_MEM, CATEGORY_AUTO_MEM, CATEGORY_BASE_OTHER } from '../../types'

const COLORS: Record<string, string> = {
  [CATEGORY_LOGOMAN]: '#ef4444',
  [CATEGORY_CASE_HIT]: '#eab308',
  [CATEGORY_AUTO]: '#0ea5e9',
  [CATEGORY_MEM]: '#14b8a6',
  [CATEGORY_AUTO_MEM]: '#3b82f6',
  [CATEGORY_BASE_OTHER]: '#475569',
}

const LABELS: Record<string, string> = {
  [CATEGORY_LOGOMAN]: 'Logoman',
  [CATEGORY_CASE_HIT]: 'Case Hit',
  [CATEGORY_AUTO]: 'Auto',
  [CATEGORY_MEM]: 'Memo',
  [CATEGORY_AUTO_MEM]: 'Auto/Memo',
  [CATEGORY_BASE_OTHER]: 'Base',
}

interface CategoryBreakdownProps {
  data: { name: string; value: number }[]
  title?: string
  activeFilter?: string
  onFilter?: (cat: string) => void
}

export function CategoryBreakdown({ data, title, activeFilter, onFilter }: CategoryBreakdownProps) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null

  const order = [CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO, CATEGORY_MEM, CATEGORY_AUTO_MEM, CATEGORY_BASE_OTHER]
  const sorted = order
    .map((cat) => data.find((d) => d.name === cat))
    .filter((d): d is { name: string; value: number } => !!d && d.value > 0)

  const isFilterable = !!onFilter
  const hasFilter = !!activeFilter

  function handleClick(cat: string) {
    if (!onFilter) return
    // Toggle: click active → reset to all
    onFilter(activeFilter === cat ? '' : cat)
  }

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        {title && (
          <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{title}</div>
        )}
        {isFilterable && hasFilter && (
          <button
            onClick={() => onFilter?.('')}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
          >
            Toutes ✕
          </button>
        )}
        {isFilterable && !hasFilter && title && (
          <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>cliquer pour filtrer</div>
        )}
      </div>

      {/* Stacked bar */}
      <div className="flex rounded-full overflow-hidden h-3 mb-3" style={{ background: 'var(--bg-hover)' }}>
        {sorted.map((d) => {
          const isActive = activeFilter === d.name
          const isDimmed = hasFilter && !isActive
          return (
            <div
              key={d.name}
              onClick={() => handleClick(d.name)}
              style={{
                width: `${(d.value / total) * 100}%`,
                background: COLORS[d.name] || '#475569',
                minWidth: d.value > 0 ? '4px' : 0,
                opacity: isDimmed ? 0.25 : 1,
                cursor: isFilterable ? 'pointer' : 'default',
                transition: 'opacity 0.15s',
              }}
              title={`${LABELS[d.name] || d.name} — ${d.value} cartes`}
            />
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sorted.map((d) => {
          const pct = ((d.value / total) * 100).toFixed(0)
          const isActive = activeFilter === d.name
          const isDimmed = hasFilter && !isActive
          return (
            <div
              key={d.name}
              onClick={() => handleClick(d.name)}
              className="flex items-center gap-1.5 text-xs"
              style={{
                opacity: isDimmed ? 0.4 : 1,
                cursor: isFilterable ? 'pointer' : 'default',
                transition: 'opacity 0.15s',
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: COLORS[d.name],
                  outline: isActive ? `2px solid ${COLORS[d.name]}` : 'none',
                  outlineOffset: '1px',
                }}
              />
              <span style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400 }}>
                {LABELS[d.name] || d.name}
              </span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.value}</span>
              <span style={{ color: 'var(--text-quaternary)' }}>({pct}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
