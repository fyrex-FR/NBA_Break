import { Library } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { destinationFor, navItemFor } from '../../navigation'
import { EmptyState } from '../ui/primitives'
import { BreakModePanel } from './BreakModePanel'
import { CollectionCard } from '../shared/CollectionCard'
import { useOpenCollection, useRecentCollections } from '../../hooks/useCollections'

const WHAT: Record<string, string> = {
  teams: 'les équipes',
  players: 'les joueurs',
  break: 'la valeur des spots',
}

/** Une vue qui a besoin d'au moins une collection ouverte, alors qu'aucune ne l'est. */
export function NeedsCollection() {
  const { activeView, openSelection } = useAppStore()
  const destination = destinationFor(activeView)
  const item = navItemFor(activeView)
  const what = (destination && WHAT[destination.id]) ?? item?.label.toLowerCase() ?? 'cette vue'
  const recent = useRecentCollections(4)
  const openCollection = useOpenCollection()
  return (
    <>
    <EmptyState
      icon={destination?.icon ?? item?.icon ?? Library}
      title="Ouvre une collection"
      action={
        <button onClick={() => openSelection('catalog')} className="ui-btn ui-btn-primary">
          <Library className="w-4 h-4" /> Choisir une collection
        </button>
      }
    >
      Pour voir {what}, choisis une ou plusieurs collections : Prizm, Chrome, Select…
    </EmptyState>
    {recent.length > 0 && (
      <section className="mt-6 @container">
        <h2 className="text-[13px] font-semibold mb-2.5" style={{ color: 'var(--text-secondary)' }}>Ou ouvre une des dernières</h2>
        <div className="grid gap-2.5 @xl:grid-cols-2">
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
