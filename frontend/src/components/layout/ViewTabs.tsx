import { useAppStore } from '../../stores/appStore'
import type { ViewName, ViewCategory } from '../../types'

interface ViewTabsProps {
  enabledViews: Record<string, boolean>
}

const VIEW_CATEGORIES: { label: ViewCategory; views: { name: ViewName; key: string }[] }[] = [
  {
    label: '📊 Analyse',
    views: [
      { name: '🌍 Vue Globale', key: 'global' },
      { name: '💎 Autos & Patchs', key: 'autos_patchs' },
      { name: '🔥 Logoman', key: 'logoman' },
      { name: '✨ Case Hits', key: 'case_hits' },
      { name: '👥 Multi-Joueurs', key: 'multi_players' },
      { name: '🧠 Value Picks', key: 'value_picks' },
      { name: '🧨 Rookies', key: 'rookies' },
    ],
  },
  {
    label: '🔍 Détails',
    views: [
      { name: '🔍 Analyse Joueur', key: 'player_detail' },
      { name: '🛡️ Analyse Équipe', key: 'team_detail' },
      { name: '📁 Par Fichier', key: 'file_analysis' },
    ],
  },
  {
    label: '🛠️ Outils',
    views: [
      { name: '🧪 Détection Auto/Mem', key: 'detection' },
      { name: '⚖️ Comparateur Joueurs', key: 'comparator' },
      { name: '💸 Cost par Pick', key: 'cost_by_pick' },
      { name: '⚡ Live Mode', key: 'live_mode' },
    ],
  },
  {
    label: '🎲 Break',
    views: [
      { name: '🧩 Simulation de Break', key: 'break_simulation' },
      { name: '📤 Export', key: 'export' },
    ],
  },
]

export function ViewTabs({ enabledViews }: ViewTabsProps) {
  const { activeView, setActiveView } = useAppStore()

  return (
    <div className="mb-4">
      {VIEW_CATEGORIES.map((category) => {
        const visibleViews = category.views.filter((v) => enabledViews[v.key] !== false)
        if (visibleViews.length === 0) return null

        return (
          <div key={category.label} className="mb-2">
            <div className="text-xs font-medium mb-1 px-1" style={{ color: 'var(--text-quaternary)' }}>
              {category.label}
            </div>
            <div className="flex flex-wrap gap-1">
              {visibleViews.map((view) => {
                const isActive = activeView === view.name
                return (
                  <button
                    key={view.key}
                    onClick={() => setActiveView(view.name)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: isActive ? 'var(--accent)' : 'var(--bg-surface)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    {view.name}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
