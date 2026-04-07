import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { SearchSelect } from '../shared/SearchSelect'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM } from '../../types'

const MAX_PLAYERS = 5

interface PlayerComparison {
  Joueur: string
  Cartes: number
  'Auto/Mem': number
  'Case Hit': number
  Logoman: number
  Checklists: number
}

const columnHelper = createColumnHelper<PlayerComparison>()

const columns = [
  columnHelper.accessor('Joueur', { header: 'Joueur' }),
  columnHelper.accessor('Cartes', { header: 'Cartes' }),
  columnHelper.accessor('Auto/Mem', { header: '💎 Auto/Mem' }),
  columnHelper.accessor('Case Hit', { header: '✨ Case Hit' }),
  columnHelper.accessor('Logoman', { header: '🔥 Logoman' }),
  columnHelper.accessor('Checklists', { header: '📁 Checklists' }),
]

export function ComparatorView() {
  const { analysisData } = useAppStore()
  const [slots, setSlots] = useState<string[]>(['', ''])

  if (!analysisData) return null

  const allPlayers = useMemo(() => {
    const names = new Set<string>()
    for (const card of analysisData.cards) {
      for (const name of card.Player.split('/').map((p) => p.trim())) {
        if (name) names.add(name)
      }
    }
    return Array.from(names).sort()
  }, [analysisData.cards])

  function setSlot(index: number, value: string) {
    setSlots((prev) => prev.map((s, i) => (i === index ? value : s)))
  }

  function removeSlot(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index))
  }

  function addSlot() {
    if (slots.length < MAX_PLAYERS) setSlots((prev) => [...prev, ''])
  }

  const selectedPlayers = slots.filter(Boolean)

  const comparisons = useMemo(() => {
    return selectedPlayers.map((name) => {
      const cards = analysisData.cards.filter((c) =>
        c.Player.split('/').map((p) => p.trim().toLowerCase()).includes(name.toLowerCase()),
      )
      return {
        Joueur: name,
        Cartes: cards.reduce((s, c) => s + c.Hits, 0),
        'Auto/Mem': cards.filter((c) => c.Category === CATEGORY_AUTO_MEM).reduce((s, c) => s + c.Hits, 0),
        'Case Hit': cards.filter((c) => c.Category === CATEGORY_CASE_HIT).reduce((s, c) => s + c.Hits, 0),
        Logoman: cards.filter((c) => c.Category === CATEGORY_LOGOMAN).reduce((s, c) => s + c.Hits, 0),
        Checklists: new Set(cards.map((c) => c.checklist_name)).size,
      }
    })
  }, [selectedPlayers, analysisData.cards])

  return (
    <div>
      <h2 className="text-xl font-medium mb-1">⚖️ Comparateur Joueurs</h2>
      <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>
        Sélectionnez jusqu'à {MAX_PLAYERS} joueurs à comparer.
      </p>

      <div className="max-w-lg">
        {slots.map((slot, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1">
              <SearchSelect
                options={allPlayers.filter((p) => !slots.includes(p) || p === slot)}
                value={slot}
                onChange={(v) => setSlot(i, v)}
                placeholder={`Joueur ${i + 1}…`}
              />
            </div>
            {slots.length > 1 && (
              <button
                onClick={() => removeSlot(i)}
                className="mt-2 px-1.5 py-1 rounded text-xs"
                style={{ color: 'var(--text-quaternary)' }}
                title="Retirer ce joueur"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {slots.length < MAX_PLAYERS && (
          <button
            onClick={addSlot}
            className="text-sm px-3 py-1.5 rounded-lg mb-6"
            style={{
              color: 'var(--accent)',
              border: '1px dashed color-mix(in srgb, var(--accent) 50%, transparent)',
              background: 'transparent',
            }}
          >
            + Ajouter un joueur
          </button>
        )}
      </div>

      {comparisons.length > 0 && (
        <DataTable
          data={comparisons}
          columns={columns as any}
          pageSize={50}
          exportName={`comparaison_${selectedPlayers.length}_joueurs`}
        />
      )}
    </div>
  )
}
