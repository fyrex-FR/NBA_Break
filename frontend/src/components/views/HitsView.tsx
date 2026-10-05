import { Gem, Flame, Sparkles } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { CategoryFilteredView } from './CategoryFilteredView'
import { Segmented } from '../ui/primitives'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM } from '../../types'
import type { ViewName } from '../../types'

type HitsViewName = '💎 Autos & Patchs' | '🔥 Logoman' | '✨ Case Hits'

/** Regroupe les trois vues « hits » sous une seule entrée, avec bascule interne. */
export function HitsView() {
  const { activeView, setActiveView, analysisData } = useAppStore()
  const enabled = analysisData?.enabled_views ?? {}
  const current = (['💎 Autos & Patchs', '🔥 Logoman', '✨ Case Hits'].includes(activeView) ? activeView : '💎 Autos & Patchs') as HitsViewName
  const summary = analysisData?.category_summary

  const options = [
    { value: '💎 Autos & Patchs' as const, label: 'Autos & memo', icon: Gem, count: summary ? summary.auto + summary.mem + summary.auto_mem : undefined, key: 'autos_patchs' },
    { value: '🔥 Logoman' as const, label: 'Logoman', icon: Flame, count: summary?.logoman, key: 'logoman' },
    { value: '✨ Case Hits' as const, label: 'Case hits', icon: Sparkles, count: summary?.case_hit, key: 'case_hits' },
  ].filter((o) => enabled[o.key] !== false)

  return (
    <div>
      <div className="mb-5 overflow-x-auto no-scrollbar">
        <Segmented<HitsViewName>
          value={current}
          onChange={(v) => setActiveView(v as ViewName)}
          options={options}
          ariaLabel="Type de hit"
        />
      </div>
      {current === '💎 Autos & Patchs' && (
        <CategoryFilteredView
          key="autos"
          title="Autos & memorabilia"
          hitTypes={[HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM]}
          description="Cartes autographiées, memorabilia pur et auto/memorabilia."
        />
      )}
      {current === '🔥 Logoman' && (
        <CategoryFilteredView key="logoman" title="Logoman" category={CATEGORY_LOGOMAN} description="Les patchs Logoman — les plus rares et les plus recherchés." />
      )}
      {current === '✨ Case Hits' && (
        <CategoryFilteredView key="case" title="Case hits" category={CATEGORY_CASE_HIT} description="Inserts spéciaux (Downtown, Kaboom, Color Blast…)." />
      )}
    </div>
  )
}
