import {
  CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO, CATEGORY_MEM, CATEGORY_AUTO_MEM, CATEGORY_BASE_OTHER,
  type CategorySummary, type ViewName,
} from '../types'

export interface CategoryMeta {
  key: keyof Omit<CategorySummary, 'hit_total'>
  category: string
  label: string
  color: string
  view: ViewName | null
}

/** Ordre de rareté décroissante — sert pour légendes, barres et badges. */
export const CATEGORY_META: CategoryMeta[] = [
  { key: 'logoman', category: CATEGORY_LOGOMAN, label: 'Logoman', color: 'var(--cat-logoman)', view: '🔥 Logoman' },
  { key: 'case_hit', category: CATEGORY_CASE_HIT, label: 'Case hit', color: 'var(--cat-case)', view: '✨ Case Hits' },
  { key: 'auto_mem', category: CATEGORY_AUTO_MEM, label: 'Auto/Memo', color: 'var(--cat-automem)', view: '💎 Autos & Patchs' },
  { key: 'auto', category: CATEGORY_AUTO, label: 'Auto', color: 'var(--cat-auto)', view: '💎 Autos & Patchs' },
  { key: 'mem', category: CATEGORY_MEM, label: 'Memo', color: 'var(--cat-mem)', view: '💎 Autos & Patchs' },
  { key: 'base_other', category: CATEGORY_BASE_OTHER, label: 'Base / autre', color: 'var(--cat-base)', view: null },
]

const BY_CATEGORY = new Map(CATEGORY_META.map((m) => [m.category, m]))

export function categoryMeta(category: string): CategoryMeta {
  return BY_CATEGORY.get(category) ?? CATEGORY_META[CATEGORY_META.length - 1]
}
