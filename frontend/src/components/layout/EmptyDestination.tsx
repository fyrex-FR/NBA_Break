import { Library, Search } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { destinationFor, navItemFor } from '../../navigation'
import { EmptyState } from '../ui/primitives'
import type { ViewName } from '../../types'
import { BreakModePanel } from './BreakModePanel'
import { CollectionCard } from '../shared/CollectionCard'
import { useOpenCollection, useRecentCollections } from '../../hooks/useCollections'

const WHAT: Partial<Record<ViewName, string>> = {
  '🛡️ Analyse Équipe': 'une équipe',
  '🔍 Analyse Joueur': 'un joueur',
  '🧨 Rookies': 'les rookies',
  '⚖️ Comparateur Joueurs': 'les joueurs',
  '🧩 Simulation de Break': 'la valeur des spots',
}

/** Une vue qui a besoin d'au moins une collection ouverte, alors qu'aucune ne l'est. */
export function NeedsCollection() {
  const { activeView, openSelection, setActiveView } = useAppStore()
  const destination = destinationFor(activeView)
  const item = navItemFor(activeView)
  const what = WHAT[activeView] ?? item?.label.toLowerCase() ?? 'cette vue'
  const recent = useRecentCollections(4)
  const catalogView = activeView === '🛡️ Analyse Équipe' ? '🏟️ Équipes catalogue' as const
    : ['🔍 Analyse Joueur', '🧨 Rookies', '⚖️ Comparateur Joueurs'].includes(activeView) ? '🖊️ Qui a signé' as const : null
  const openCollection = useOpenCollection()
  return (
    <>
    <EmptyState
      icon={destination?.icon ?? item?.icon ?? Library}
      title="Ouvre une collection"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={() => openSelection('catalog')} className="ui-btn ui-btn-primary">
            <Library className="w-4 h-4" /> Choisir une collection
          </button>
          {catalogView && (
            <button onClick={() => setActiveView(catalogView)} className="ui-btn ui-btn-secondary">
              <Search className="w-4 h-4" /> Chercher dans tout le catalogue
            </button>
          )}
        </div>
      }
    >
      Pour voir {what}, choisis une ou plusieurs collections : Prizm, Chrome, Select…
    </EmptyState>
    {recent.length > 0 && (
      <section className="mt-6 @container">
        <h2 className="text-[13px] font-semibold mb-2.5" style={{ color: 'var(--text-secondary)' }}>Ou ouvre une des dernières</h2>
        <div className="grid grid-cols-1 gap-2.5 @xl:grid-cols-2">
          {/* On reste sur l'onglet courant : l'équipe ou le joueur s'affiche dès que l'analyse arrive. */}
          {recent.map((e) => <CollectionCard key={e.id} entry={e} onOpen={() => openCollection(e.id, activeView)} />)}
        </div>
      </section>
    )}
    </>
  )
}

/** Onglet « En cours » sans break chargé : on colle l'URL du show Voggt ici. */
export function BreakStart() {
  return (
    <div className="max-w-xl">
      <div className="ui-card p-5">
        <h2 className="text-[15px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Charger un break Voggt</h2>
        <BreakModePanel />
      </div>
    </div>
  )
}
