import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'

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
  columnHelper.accessor('Player', { header: 'Joueurs' }),
  columnHelper.accessor('Team', { header: 'Équipe(s)' }),
  columnHelper.accessor('Box Type', { header: 'Type' }),
  columnHelper.accessor('Category', { header: 'Catégorie' }),
  columnHelper.accessor('File', { header: 'Checklist' }),
]

export function MultiPlayersView() {
  const { analysisData } = useAppStore()
  const [filterPlayer, setFilterPlayer] = useState('')

  if (!analysisData) return null

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
      <h2 className="text-xl font-medium mb-2">👥 Multi-Joueurs</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Cartes comportant plusieurs joueurs (ex: Dual Swatch, Combo cards).
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <MetricCard label="Cartes multi-joueurs" value={multiCards.length} icon="👥" />
        <MetricCard label="Joueurs impliqués" value={allPlayers.length} icon="🎴" />
        <MetricCard label="Total hits" value={multiCards.reduce((s, c) => s + c.Hits, 0)} icon="📊" />
      </div>

      {/* Filter by player */}
      <div className="flex gap-2 mb-4">
        <select
          value={filterPlayer}
          onChange={(e) => setFilterPlayer(e.target.value)}
          className="flex-1 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
        >
          <option value="">Tous les joueurs</option>
          {allPlayers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {filterPlayer && (
          <button
            onClick={() => setFilterPlayer('')}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)' }}
          >
            Effacer
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          Aucune carte multi-joueurs trouvée.
        </div>
      ) : (
        <DataTable data={filtered as MultiCard[]} columns={columns as any} pageSize={50} exportName={filterPlayer ? `multi_${filterPlayer.replace(/\s+/g, '_')}` : 'multi_joueurs'} />
      )}
    </div>
  )
}
