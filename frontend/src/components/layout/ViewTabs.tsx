import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import type { ViewName, ViewCategory } from '../../types'

interface ViewTabsProps {
  enabledViews: Record<string, boolean>
}

const VIEW_CATEGORIES: { label: ViewCategory; short: string; views: { name: ViewName; key: string; short: string }[] }[] = [
  {
    label: '📊 Analyse',
    short: '📊',
    views: [
      { name: '🌍 Vue Globale', key: 'global', short: 'Globale' },
      { name: '💎 Autos & Patchs', key: 'autos_patchs', short: 'Autos' },
      { name: '🔥 Logoman', key: 'logoman', short: 'Logoman' },
      { name: '✨ Case Hits', key: 'case_hits', short: 'Case Hits' },
      { name: '👥 Multi-Joueurs', key: 'multi_players', short: 'Multi' },
      { name: '📈 Tendances', key: 'trends', short: 'Tendances' },
      { name: '🧨 Rookies', key: 'rookies', short: 'Rookies' },
    ],
  },
  {
    label: '🔍 Détails',
    short: '🔍',
    views: [
      { name: '🔍 Analyse Joueur', key: 'player_detail', short: 'Joueur' },
      { name: '🛡️ Analyse Équipe', key: 'team_detail', short: 'Équipe' },
      { name: '📁 Par Fichier', key: 'file_analysis', short: 'Fichier' },
    ],
  },
  {
    label: '🛠️ Outils',
    short: '🛠️',
    views: [
      { name: '🧪 Détection Auto/Mem', key: 'detection', short: 'Détection' },
      { name: '🔗 Mapping Odds', key: 'odds_mapping', short: 'Mapping Odds' },
      { name: '🦸 Attribution Marvel', key: 'marvel_attribution', short: 'Marvel' },
      { name: '⚖️ Comparateur Joueurs', key: 'comparator', short: 'Comparer' },
      { name: '📥 Import Intelligent', key: 'smart_import', short: 'Import IA' },
    ],
  },
  {
    label: '🎲 Break',
    short: '🎲',
    views: [
      { name: '🧩 Simulation de Break', key: 'break_simulation', short: 'Simulation' },
      { name: '🎯 Odds', key: 'odds', short: 'Odds' },
      { name: '📤 Export', key: 'export', short: 'Export' },
    ],
  },
]

export function ViewTabs({ enabledViews }: ViewTabsProps) {
  const { activeView, setActiveView } = useAppStore()

  // Find which category the active view belongs to
  const activeCategory = VIEW_CATEGORIES.find((cat) =>
    cat.views.some((v) => v.name === activeView),
  ) || VIEW_CATEGORIES[0]

  const [selectedCategory, setSelectedCategory] = useState(activeCategory.label)

  const currentCat = VIEW_CATEGORIES.find((c) => c.label === selectedCategory) || VIEW_CATEGORIES[0]
  const visibleViews = currentCat.views.filter((v) => enabledViews[v.key] !== false)


  return (
    <div className="mb-5">
      {/* ── Catégories ── */}
      <div className="flex gap-1 mb-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        {VIEW_CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.label
          const hasActiveView = cat.views.some((v) => v.name === activeView)
          return (
            <button
              key={cat.label}
              onClick={() => setSelectedCategory(cat.label)}
              className="py-1.5 text-sm font-medium transition-colors relative"
              style={{
                // Mobile : emoji seul + padding réduit / Desktop : label complet
                padding: undefined,
                color: isActive ? 'var(--text-primary)' : 'var(--text-quaternary)',
                background: 'transparent',
                border: 'none',
              }}
            >
              {/* Emoji seul sur mobile, label complet sur desktop */}
              <span className="md:hidden px-3">{cat.short}</span>
              <span className="hidden md:inline px-4">{cat.label}</span>

              {isActive && (
                <div
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
              {!isActive && hasActiveView && (
                <div
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Sous-vues : scroll horizontal sur mobile, wrap sur desktop ── */}
      <div
        className="flex gap-1.5 md:flex-wrap overflow-x-auto pb-0.5"
        style={{ scrollbarWidth: 'none' }}
      >
        {visibleViews.map((view) => {
          const isActive = activeView === view.name
          return (
            <button
              key={view.key}
              onClick={() => setActiveView(view.name)}
              className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: isActive ? 'var(--accent)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-tertiary)',
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-standard)'}`,
              }}
            >
              {view.short}
            </button>
          )
        })}
      </div>
    </div>
  )
}
