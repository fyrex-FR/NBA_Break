import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { tabsOf, navItemFor, type DestinationId } from '../../navigation'
import { useOddsConfig } from '../../hooks/useOddsConfig'
import { useBoxGuideIndex } from '../../hooks/useCollections'
import { Popover } from '../ui/primitives'

/**
 * Onglets d'une destination (Collections : Spots · Hits · Boîte · Checklist…).
 * Les onglets secondaires sont rangés dans « Plus ». Une fiche (équipe, joueur)
 * garde l'onglet Spots actif. Sans collection ouverte, seuls les onglets qui
 * cherchent dans tout le catalogue restent, à côté du catalogue lui-même.
 */
export function DestinationTabs({ destination }: { destination: DestinationId }) {
  const { activeView, setActiveView, analysisData, analyzedChecklistIds, selectedSport, breakContext } = useAppStore()
  const { oddsChecklistIds } = useOddsConfig()
  const { index: guideIndex } = useBoxGuideIndex()
  const [moreOpen, setMoreOpen] = useState(false)
  const activeItem = navItemFor(activeView)
  const current = activeItem?.sheet ? '🌡️ Spots' : activeItem?.view
  const catalogOnly = destination === 'collections' && !analysisData

  const items = tabsOf(destination, analysisData?.enabled_views, selectedSport)
    .filter((i) => !catalogOnly || !i.needsAnalysis || i.view === '🌡️ Spots')
    .map((i) => (catalogOnly ? { ...i, overflow: false, tab: i.view === '🌡️ Spots' ? 'Catalogue' : i.tab } : i))
    // Odds : seulement si une collection ouverte a sa feuille.
    .filter((i) => i.view !== '🎯 Odds' || analyzedChecklistIds.some((id) => oddsChecklistIds.has(id)))
    // Boîte : seulement si une collection ouverte a son guide des boîtes.
    .filter((i) => i.view !== '📦 Guide des boîtes' || analyzedChecklistIds.some((id) => guideIndex.has(id)))
  const main = items.filter((i) => !i.overflow)
  const more = items.filter((i) => i.overflow)
  const activeMore = more.find((i) => i.view === current)

  if (items.length < 2) return null

  return (
    // Le menu « Plus » vit hors de la zone défilante, sinon son popover serait rogné.
    <div className="ui-tabs mb-5 -mx-4 pl-4 pr-2 md:mx-0 md:px-0">
      <div className="ui-tabs-scroll" role="tablist" aria-label="Onglets">
      {main.map((i) => (
        <button
          key={i.view}
          role="tab"
          aria-selected={current === i.view}
          onClick={() => setActiveView(i.view)}
          className="ui-tab"
        >
          {i.tab}
          {i.view === '🎲 État du Break' && breakContext && (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} aria-label="en direct" />
          )}
        </button>
      ))}
      </div>
      {more.length > 0 && (
        <div className="relative flex-shrink-0">
          <button
            role="tab"
            aria-selected={!!activeMore}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            className="ui-tab"
            aria-label={activeMore ? undefined : "Plus d'onglets"}
          >
            {activeMore ? activeMore.tab : <span className="hidden sm:inline">Plus</span>}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
          <Popover open={moreOpen} onClose={() => setMoreOpen(false)} align="right" width={280}>
            <div role="menu">
              {more.map((i) => {
                const Icon = i.icon
                return (
                  <button
                    key={i.view}
                    role="menuitem"
                    onClick={() => { setActiveView(i.view); setMoreOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] ui-row-hover"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Icon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    <span className="flex-1 text-left">{i.label}</span>
                    {current === i.view && <Check className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
                  </button>
                )
              })}
            </div>
          </Popover>
        </div>
      )}
    </div>
  )
}
