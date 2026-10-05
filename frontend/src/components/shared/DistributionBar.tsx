import { prettyChecklist } from '../../utils/checklists'
/**
 * Generic horizontal stacked bar for any named distribution.
 * Used for checklist distribution, file distribution, etc.
 */

// Palette séquentielle dérivée de l'accent du sport : on lit la part de
// chaque source sans multiplier les teintes.
const PALETTE = [100, 78, 60, 46, 36, 28, 22].map(
  (pct) => `color-mix(in srgb, var(--accent) ${pct}%, var(--bg-hover))`,
)

interface DistributionBarProps {
  data: { name: string; value: number }[]
  title?: string
}

export function DistributionBar({ data, title }: DistributionBarProps) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null

  const sorted = [...data].sort((a, b) => b.value - a.value)

  return (
    <div className="ui-card p-4">
      {title && (
        <div className="text-xs font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>{title}</div>
      )}

      {/* Stacked bar */}
      <div className="flex rounded-full overflow-hidden h-2.5 mb-3 gap-[2px]">
        {sorted.map((d, i) => (
          <div
            key={d.name}
            title={`${d.name.replace('.parquet', '')} · ${d.value}`}
            style={{
              width: `${(d.value / total) * 100}%`,
              background: PALETTE[i % PALETTE.length],
              minWidth: d.value > 0 ? '3px' : 0,
            }}
          />
        ))}
      </div>

      {/* Legend - compact, max 6 shown */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sorted.slice(0, 6).map((d, i) => {
          const label = d.name.includes(' ') ? d.name : prettyChecklist(d.name)
          return (
            <div key={d.name} className="flex min-w-0 items-center gap-1.5 text-xs" title={`${label} · ${d.value}`}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="max-w-[260px] truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <span className="font-medium num" style={{ color: 'var(--text-primary)' }}>{d.value}</span>
            </div>
          )
        })}
        {sorted.length > 6 && (
          <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
            +{sorted.length - 6} autres
          </span>
        )}
      </div>
    </div>
  )
}
