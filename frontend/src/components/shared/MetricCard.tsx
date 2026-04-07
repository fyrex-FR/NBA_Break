interface MetricCardProps {
  label: string
  value: string | number
  icon?: string
}

export function MetricCard({ label, value, icon }: MetricCardProps) {
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        {icon && <span className="mr-1">{icon}</span>}
        {label}
      </div>
      <div className="text-2xl font-medium mt-1" style={{ color: 'var(--text-primary)' }}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </div>
    </div>
  )
}
