import { useState, useMemo, useRef, useEffect } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { MultiSearchSelect } from '../shared/MultiSearchSelect'
import { Save, Trash2, Download, Plus } from 'lucide-react'
import { fetchBreakSimulation, fetchSimulationPresets, saveSimulationPreset, deleteSimulationPreset } from '../../api/client'
import type { BreakSpotRecord, BreakSimulationResponse, SimulationPreset } from '../../types'

const columnHelper = createColumnHelper<BreakSpotRecord>()

const spotColumns = [
  columnHelper.accessor('Spot', { header: 'Spot' }),
  columnHelper.accessor('Cartes', { header: 'Cartes' }),
  columnHelper.accessor('Auto/Memo', { header: 'Auto/Memo' }),
  columnHelper.accessor('Auto garanties', {
    header: 'Auto garanties',
    cell: (info) => {
      const val = info.getValue() as number
      return val > 0
        ? <span className="font-medium" style={{ color: 'var(--accent)' }}>{val}</span>
        : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
    },
  }),
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
      return val ? <span className="text-[10px] leading-tight opacity-70 block max-w-[200px] truncate">{val}</span> : '—'
    },
  }),
  columnHelper.accessor('Joueurs', {
    header: 'Joueurs',
    cell: (info) => {
      const val = info.getValue()
      return val ? <span className="text-[10px] leading-tight opacity-70 block max-w-[200px] truncate">{val}</span> : '—'
    },
  }),
]

const METHODS = [
  { value: 'team', label: 'Break par Équipe' },
  { value: 'player', label: 'Break par Joueur' },
  { value: 'letter', label: 'Break par Lettre' },
  { value: 'player_letter', label: 'Mixte (Joueur + Lettre)' },
]

export function BreakSimulationView() {
  const { selectedSport, selectedChecklistIds, masterKey, availableChecklists } = useAppStore()
  const [method, setMethod] = useState('team')
  const [result, setResult] = useState<BreakSimulationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hitsGuaranteed, setHitsGuaranteed] = useState<Record<string, string>>({})
  const [extractedPlayers, setExtractedPlayers] = useState<string[]>([])
  const [panelOpen, setPanelOpen] = useState(true)

  // Presets state
  const [presets, setPresets] = useState<SimulationPreset[]>([])
  const [newPresetName, setNewPresetName] = useState('')
  const [presetsLoading, setPresetsLoading] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)

  const resultsRef = useRef<HTMLDivElement>(null)

  // Load presets on mount or sport change
  useEffect(() => {
    if (!selectedSport) return
    setPresetsLoading(true)
    fetchSimulationPresets(selectedSport)
      .then(data => setPresets(data.presets))
      .catch(err => console.error('Failed to fetch sim presets:', err))
      .finally(() => setPresetsLoading(false))
  }, [selectedSport])

  const checklistsInfo = useMemo(() =>
    selectedChecklistIds.map(id => availableChecklists.find(c => c.checklist_id === id)).filter(Boolean),
    [selectedChecklistIds, availableChecklists]
  )

  const hasAnyGuaranteed = Object.values(hitsGuaranteed).some(v => parseInt(v) > 0)

  async function handleSimulate() {
    setLoading(true)
    setError(null)
    // Toutes les checklists sont envoyées : blank/0 = pas de garantie, >0 = garantie
    const guaranteedMap: Record<string, number> = {}
    for (const id of selectedChecklistIds) {
      const raw = hitsGuaranteed[id]
      const n = (raw !== undefined && raw !== '') ? parseInt(raw) : 0
      guaranteedMap[id] = isNaN(n) ? 0 : Math.max(0, n)
    }
    try {
      const data = await fetchBreakSimulation({
        sport_key: selectedSport,
        checklist_ids: selectedChecklistIds,
        master_key: masterKey,
        method,
        checklist_hits_guaranteed: hasAnyGuaranteed ? guaranteedMap : undefined,
        extracted_players: extractedPlayers,
      })
      setResult(data)
      setPanelOpen(false)
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la simulation.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSavePreset() {
    if (!newPresetName.trim() || !selectedSport) return
    const guaranteedMap: Record<string, number> = {}
    for (const id of selectedChecklistIds) {
      const raw = hitsGuaranteed[id]
      const n = (raw !== undefined && raw !== '') ? parseInt(raw) : 0
      guaranteedMap[id] = isNaN(n) ? 0 : Math.max(0, n)
    }

    const preset: SimulationPreset = {
      name: newPresetName,
      checklist_ids: selectedChecklistIds,
      method,
      extracted_players: extractedPlayers,
      hits_guaranteed: guaranteedMap
    }

    try {
      await saveSimulationPreset(selectedSport, preset)
      const data = await fetchSimulationPresets(selectedSport)
      setPresets(data.presets)
      setNewPresetName('')
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function handleDeletePreset(name: string) {
    if (!selectedSport || !confirm(`Supprimer la configuration "${name}" ?`)) return
    try {
      await deleteSimulationPreset(selectedSport, name)
      setPresets(prev => prev.filter(p => p.name !== name))
    } catch (err: any) {
      alert(err.message)
    }
  }

  function handleLoadPreset(p: SimulationPreset) {
    // We can't directly set selectedChecklistIds because it's in the store
    // But we can update the other local states
    setMethod(p.method)
    setExtractedPlayers(p.extracted_players)
    const hg: Record<string, string> = {}
    Object.entries(p.hits_guaranteed).forEach(([id, val]) => {
      hg[id] = String(val)
    })
    setHitsGuaranteed(hg)
    // For checklist IDs, we might need a store action or just inform the user that it loads selection too
    useAppStore.getState().setSelectedChecklistIds(p.checklist_ids)
    setPresetsOpen(false)
  }



  return (
    <div>
      <h2 className="text-xl font-medium mb-1">🧩 Simulation de Break</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Renseignez les autos garanties par box pour pondérer le score.
      </p>

      {/* Presets Management */}
      <div className="mb-4 rounded-xl" style={{ border: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => setPresetsOpen(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-left"
          style={{ background: 'var(--bg-surface)' }}
        >
          <div className="flex items-center gap-2">
            <Save size={14} style={{ color: 'var(--text-tertiary)' }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              Configurations enregistrées
            </span>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{presetsOpen ? '▲' : '▼'}</span>
        </button>

        {presetsOpen && (
          <div className="px-4 pb-4 pt-2" style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', borderRadius: '0 0 0.75rem 0.75rem' }}>
            {/* List of presets */}
            <div className="space-y-1 mb-4">
              {presets.length === 0 && !presetsLoading && (
                <p className="text-xs italic px-2 py-1" style={{ color: 'var(--text-quaternary)' }}>Aucune configuration sauvegardée.</p>
              )}
              {presetsLoading && <p className="text-xs px-2 py-1">Chargement...</p>}
              {presets.map(p => (
                <div key={p.name} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-quaternary)' }}>
                      {p.checklist_ids.length} checklists • {p.method}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleLoadPreset(p)}
                      title="Charger"
                      className="p-1.5 rounded-md hover:bg-[var(--bg-surface)] text-blue-400"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => handleDeletePreset(p.name)}
                      title="Supprimer"
                      className="p-1.5 rounded-md hover:bg-[var(--bg-surface)] text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Save current config */}
            <div className="flex gap-2 items-center pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <input
                type="text"
                placeholder="Nom de la configuration..."
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="flex-1 rounded-lg px-3 py-1.5 text-sm"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={handleSavePreset}
                disabled={!newPresetName.trim() || selectedChecklistIds.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: (!newPresetName.trim() || selectedChecklistIds.length === 0) ? 0.5 : 1
                }}
              >
                <Plus size={14} />
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hits garantis par checklist */}
      {checklistsInfo.length > 0 && (
        <div className="mb-6 rounded-xl" style={{ border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setPanelOpen(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-left"
            style={{ background: 'var(--bg-surface)' }}
          >
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              Autos / Memo garanties par box
            </span>
            <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{panelOpen ? '▲' : '▼'}</span>
          </button>
          {panelOpen && <div className="px-4 pb-4 pt-1" style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', borderRadius: '0 0 0.75rem 0.75rem' }}>
            <div className="space-y-2">
              {checklistsInfo.map((cl) => (
                <div key={cl!.checklist_id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                    {cl!.checklist_name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{cl!.year}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      placeholder="0"
                      value={hitsGuaranteed[cl!.checklist_id] ?? ''}
                      onChange={(e) => setHitsGuaranteed(prev => ({ ...prev, [cl!.checklist_id]: e.target.value }))}
                      className="w-16 text-center rounded-lg px-2 py-1.5 text-sm"
                      style={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-standard)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>hits/box</span>
                  </div>
                </div>
              ))}
            </div>
            {!hasAnyGuaranteed && (
              <p className="text-xs mt-3" style={{ color: 'var(--text-quaternary)' }}>
                Sans saisie, toutes les checklists ont un poids égal (×1).
              </p>
            )}
          </div>}
        </div>
      )}

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

        {method === 'player_letter' && (
          <div className="flex-1 min-w-[300px]">
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Joueurs à sortir du break par lettre</label>
            <MultiSearchSelect
              options={useAppStore.getState().analysisData?.player_rankings.map(p => p.Player!).filter(Boolean) || []}
              value={extractedPlayers}
              onChange={setExtractedPlayers}
              placeholder="Sélectionner les joueurs à isoler..."
            />
          </div>
        )}

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
        <div ref={resultsRef}>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <MetricCard label="Total Cartes" value={result.summary.total_cartes} icon="📊" />
            <MetricCard label="Break Score Total" value={result.summary.total_break_score} icon="⚡" />
            <MetricCard label="Hot Spots" value={result.summary.hot_spots} icon="🔥" />
            <MetricCard label="Spots" value={result.spots.length} icon="🎯" />
          </div>

          {/* Full table */}
          <DataTable data={result.spots} columns={spotColumns as any} pageSize={100} searchable searchPlaceholder="Rechercher un spot..." exportName={`break_${method}`} />
        </div>
      )}
    </div>
  )
}
