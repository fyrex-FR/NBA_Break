interface MetricCardProps {
  label: string
  value: string | number
  icon?: string
  valueColor?: string
}

export function MetricCard({ label, value, icon, valueColor }: MetricCardProps) {
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
        {icon && <span className="mr-1">{icon}</span>}
        {label}
      </div>
      <div className="text-2xl font-semibold mt-2" style={{ color: valueColor || 'var(--text-primary)' }}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </div>
    </div>
  )
}
