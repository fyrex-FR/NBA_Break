import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO, CATEGORY_MEM, CATEGORY_AUTO_MEM, CATEGORY_BASE_OTHER } from '../../types'

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  [CATEGORY_LOGOMAN]: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  [CATEGORY_CASE_HIT]: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' },
  [CATEGORY_AUTO]: { bg: 'rgba(14, 165, 233, 0.15)', text: '#0ea5e9' },
  [CATEGORY_MEM]: { bg: 'rgba(20, 184, 166, 0.15)', text: '#14b8a6' },
  [CATEGORY_AUTO_MEM]: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
  [CATEGORY_BASE_OTHER]: { bg: 'rgba(161, 161, 170, 0.15)', text: '#a1a1aa' },
}

interface CategoryBadgeProps {
  category: string
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS[CATEGORY_BASE_OTHER]
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: colors.bg, color: colors.text }}
    >
      {category}
    </span>
  )
}
