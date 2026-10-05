import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { EmptyState } from '../ui/primitives'
import { Users } from 'lucide-react'
import { PlayerCell } from '../shared/PlayerCell'

interface MultiCard {
  Player: string
  Team: string
  'Box Type': string
  Numbering: string
  Category: string
  File: string
  Hits: number
}

const columnHelper = createColumnHelper<MultiCard>()

const columns = [
  columnHelper.accessor('Player', { header: 'Joueurs', cell: (info) => <PlayerCell name={info.getValue() ?? ''} requireRookieInSelection /> }),
  columnHelper.accessor('Team', { header: 'Équipe(s)' }),
  columnHelper.accessor('Box Type', { header: 'Type' }),
  columnHelper.accessor('Category', { header: 'Catégorie' }),
  columnHelper.accessor('File', {
    header: 'Checklist',
    cell: (info) => {
      const name = (info.getValue() ?? '').replace('.parquet', '')
      return <span title={name} className="inline-block max-w-[260px] whitespace-normal break-words align-top">{name}</span>
    },
  }),
]

function MultiPlayersViewContent() {
  const { analysisData: storeAnalysisData } = useAppStore()
  // Garanti non nul par le composant enveloppe ci-dessous.
  const analysisData = storeAnalysisData!
  const [filterPlayer, setFilterPlayer] = useState('')


  const multiCards = useMemo(
    () => analysisData.cards.filter((c) => c.Player.includes('/')),
    [analysisData.cards],
  )

  // All individual players in multi-player cards
  const allPlayers = useMemo(() => {
    const set = new Set<string>()
    for (const c of multiCards) {
      c.Player.split('/').map((p) => p.trim()).filter(Boolean).forEach((p) => set.add(p))
    }
    return Array.from(set).sort()
  }, [multiCards])

  const filtered = useMemo(() => {
    if (!filterPlayer) return multiCards
    return multiCards.filter((c) =>
      c.Player.toLowerCase().includes(filterPlayer.toLowerCase()),
    )
  }, [multiCards, filterPlayer])

  return (
    <div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <MetricCard label="Cartes multi" value={multiCards.length} />
        <MetricCard label="Joueurs" value={allPlayers.length} />
        <MetricCard label="Exemplaires" value={multiCards.reduce((s, c) => s + c.Hits, 0)} />
      </div>

      {/* Filter by player */}
      <div className="flex gap-2 mb-4">
        <select
          value={filterPlayer}
          onChange={(e) => setFilterPlayer(e.target.value)}
          className="ui-input flex-1 !h-10"
        >
          <option value="">Tous les joueurs</option>
          {allPlayers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {filterPlayer && (
          <button onClick={() => setFilterPlayer('')} className="ui-btn ui-btn-secondary !h-10">
            Effacer
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Aucune carte multi-joueurs">Pas de dual, triple ou combo dans cette sélection.</EmptyState>
      ) : (
        <DataTable data={filtered as MultiCard[]} columns={columns} pageSize={50} exportName={filterPlayer ? `multi_${filterPlayer.replace(/\s+/g, '_')}` : 'multi_joueurs'} />
      )}
    </div>
  )
}

/** Attend qu'une analyse soit chargée : les hooks du contenu s'exécutent toujours dans le même ordre. */
export function MultiPlayersView() {
  const ready = useAppStore((s) => !!s.analysisData)
  return ready ? <MultiPlayersViewContent /> : null
}
