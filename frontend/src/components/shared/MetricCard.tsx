import { useAppStore } from '../../stores/appStore'

interface MetricCardProps {
  label: string
  value: string | number
  icon?: string
  valueColor?: string
}

export function MetricCard({ label, value, icon, valueColor }: MetricCardProps) {
  const theme = useAppStore((s) => s.theme)
  const useTint = valueColor && theme === 'dark'
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1"
      style={{
        background: useTint ? `${valueColor}0d` : 'var(--bg-surface)',
        border: `1px solid ${useTint ? `${valueColor}25` : 'var(--border-subtle)'}`,
      }}
    >
      <div className="flex items-center justify-between">
        {icon && <span className="text-xl">{icon}</span>}
        <span className="text-xs font-medium ml-auto" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1" style={{ color: valueColor || 'var(--text-primary)' }}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </div>
    </div>
  )
}
