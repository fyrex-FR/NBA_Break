import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM } from '../../types'

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
  const [input, setInput] = useState('')

  if (!analysisData) return null

  const playerNames = useMemo(() => {
    return input
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }, [input])

  const comparisons = useMemo(() => {
    if (playerNames.length === 0) return []

    return playerNames.map((name) => {
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
  }, [playerNames, analysisData.cards])

  return (
    <div>
      <h2 className="text-xl font-medium mb-2">⚖️ Comparateur Joueurs</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Entrez les noms des joueurs à comparer (un par ligne ou séparés par des virgules).
      </p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="LeBron James, Victor Wembanyama, Luka Doncic"
        rows={4}
        className="w-full max-w-lg rounded-lg px-3 py-2 text-sm mb-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)', resize: 'vertical' }}
      />

      {comparisons.length > 0 && (
        <DataTable data={comparisons} columns={columns as any} pageSize={50} />
      )}
    </div>
  )
}
