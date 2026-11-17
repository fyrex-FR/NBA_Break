import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { itemsOf, navItemFor, type DestinationId } from '../../navigation'
import { useOddsConfig } from '../../hooks/useOddsConfig'
import { Popover } from '../ui/primitives'

/**
 * Onglets d'une destination (Collections : Aperçu · Hits · Boîte · Checklist…).
 * Les onglets secondaires sont rangés dans « Plus ».
 */
export function DestinationTabs({ destination }: { destination: DestinationId }) {
  const { activeView, setActiveView, analysisData, analyzedChecklistIds, selectedSport, breakContext } = useAppStore()
  const { oddsChecklistIds } = useOddsConfig()
  const [moreOpen, setMoreOpen] = useState(false)
  const current = navItemFor(activeView)?.view

  const items = itemsOf(destination, analysisData?.enabled_views, selectedSport)
    // Odds : seulement si une collection ouverte a sa feuille.
    .filter((i) => i.view !== '🎯 Odds' || analyzedChecklistIds.some((id) => oddsChecklistIds.has(id)))
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
          >
            {activeMore ? activeMore.tab : 'Plus'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
          <Popover open={moreOpen} onClose={() => setMoreOpen(false)} align="right" width={220}>
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
                    <span className="flex-1 text-left">{i.tab}</span>
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
