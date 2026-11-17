import { Library } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { destinationFor, navItemFor } from '../../navigation'
import { EmptyState } from '../ui/primitives'
import { BreakModePanel } from './BreakModePanel'

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
  return (
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
