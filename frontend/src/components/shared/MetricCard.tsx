interface MetricCardProps {
  label: string
  value: string | number
  /** Emoji historique — accepté pour compatibilité, plus affiché. */
  icon?: string
  valueColor?: string
  hint?: string
}

export function MetricCard({ label, value, valueColor, hint }: MetricCardProps) {
  return (
    <div className="ui-card px-2.5 py-2 sm:px-4 sm:py-3.5 flex flex-col gap-0.5 sm:gap-1 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        {valueColor && <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: valueColor }} />}
        <span className="text-[11px] sm:text-xs font-medium truncate" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <div className="text-[17px] leading-6 sm:text-[22px] sm:leading-7 font-semibold font-mono-num truncate" style={{ color: valueColor && typeof value === 'number' && value > 0 ? `color-mix(in srgb, ${valueColor} 70%, var(--text-primary))` : 'var(--text-primary)' }}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </div>
      {hint && <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{hint}</div>}
    </div>
  )
}
