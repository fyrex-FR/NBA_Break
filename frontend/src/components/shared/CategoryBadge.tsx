import { categoryMeta } from '../../constants/categories'

interface CategoryBadgeProps {
  category: string
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  const meta = categoryMeta(category)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full h-[22px] px-2 text-[11.5px] font-medium whitespace-nowrap"
      style={{
        background: `color-mix(in srgb, ${meta.color} 13%, transparent)`,
        color: `color-mix(in srgb, ${meta.color} 85%, var(--text-primary))`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}
