import { useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '../../stores/appStore'
import { fetchBreakSimulation } from '../../api/client'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import type { BreakSpotRecord, BreakSimulationResponse } from '../../types'

const columnHelper = createColumnHelper<BreakSpotRecord>()

const spotColumns = [
  columnHelper.accessor('Spot', { header: 'Spot' }),
  columnHelper.accessor('Cartes', { header: 'Cartes' }),
  columnHelper.accessor('Auto/Memo', { header: 'Auto/Memo' }),
  columnHelper.accessor('Case Hit', { header: 'Case Hit' }),
  columnHelper.accessor('Logoman', { header: 'Logoman' }),
  columnHelper.accessor('Break Score', { header: 'Score' }),
  columnHelper.accessor('Part du break', { header: 'Part %', cell: (info) => `${info.getValue()}%` }),
  columnHelper.accessor('Hot Spot', { header: 'Hot', cell: (info) => info.getValue() || '—' }),
  columnHelper.accessor('Rareté', { header: 'Rareté' }),
  columnHelper.accessor('Équipes', {
    header: 'Équipes',
    cell: (info) => {
      const val = info.getValue()
      return val ? <span className="text-xs">{val.slice(0, 60)}{val.length > 60 ? '...' : ''}</span> : '—'
    },
  }),
]

const METHODS = [
  { value: 'team', label: 'Break par Équipe' },
  { value: 'player', label: 'Break par Joueur' },
  { value: 'letter', label: 'Break par Lettre (A-Z)' },
]

export function BreakSimulationView() {
  const { selectedSport, selectedChecklistIds, masterKey } = useAppStore()
  const [method, setMethod] = useState('team')
  const [result, setResult] = useState<BreakSimulationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSimulate() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchBreakSimulation({
        sport_key: selectedSport,
        checklist_ids: selectedChecklistIds,
        master_key: masterKey,
        method,
      })
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la simulation.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const topSpots = result?.spots
    .filter((s) => s['Break Score'] > 0)
    .sort((a, b) => b['Break Score'] - a['Break Score'])
    .slice(0, 15) || []

  return (
    <div>
      <h2 className="text-xl font-medium mb-4">🧩 Simulation de Break</h2>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Méthode</label>
          <select
            value={method}
            onChange={(e) => { setMethod(e.target.value); setResult(null) }}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={handleSimulate}
            disabled={loading || selectedChecklistIds.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '⏳ Simulation...' : '🎲 Simuler'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-2 mb-4 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <MetricCard label="Total Cartes" value={result.summary.total_cartes} icon="📊" />
            <MetricCard label="Break Score Total" value={result.summary.total_break_score} icon="⚡" />
            <MetricCard label="Hot Spots" value={result.summary.hot_spots} icon="🔥" />
            <MetricCard label="Spots" value={result.spots.length} icon="🎯" />
          </div>

          {/* Top spots chart */}
          {topSpots.length > 0 && (
            <div className="mb-6 rounded-lg p-4" style={{ background: 'var(--bg-surface)' }}>
              <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>Top Spots par Break Score</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topSpots} layout="vertical">
                  <XAxis type="number" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                  <YAxis type="category" dataKey="Spot" width={140} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-hover)', border: '1px solid var(--border-standard)', borderRadius: 8 }} />
                  <Bar dataKey="Break Score" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Full table */}
          <DataTable data={result.spots} columns={spotColumns as any} pageSize={100} searchable searchPlaceholder="Rechercher un spot..." />
        </>
      )}
    </div>
  )
}
