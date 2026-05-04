import { useState, useMemo, useRef, useEffect } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import ExcelJS from 'exceljs'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { LetterAssignmentUI } from './LetterAssignmentUI'
import { Save, Trash2, Download, Plus } from 'lucide-react'
import { fetchBreakSimulation, fetchSimulationPresets, saveSimulationPreset, deleteSimulationPreset } from '../../api/client'
import type { BreakSpotRecord, BreakSimulationResponse, SimulationPreset, BreakCardDetail } from '../../types'

const columnHelper = createColumnHelper<BreakSpotRecord>()

function buildSpotColumns() {
  return [
    columnHelper.accessor('Spot', {
      header: 'Spot',
      cell: (info) => (
        <span className="font-medium" style={{ color: 'var(--accent)' }}>
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('Cartes', { header: 'Cartes' }),
    columnHelper.accessor('Cartes RC', {
      header: 'RC',
      cell: (info) => {
        const val = (info.getValue() as number) ?? 0
        return val > 0 ? <span className="font-medium" style={{ color: '#34d399' }}>{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Auto/Memo', { header: 'Auto/Memo' }),
    columnHelper.accessor('Auto/Memo RC', {
      header: 'Auto RC',
      cell: (info) => {
        const val = (info.getValue() as number) ?? 0
        return val > 0 ? <span className="font-medium" style={{ color: '#34d399' }}>{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Logoman', {
      header: '🔥',
      cell: (info) => {
        const val = info.getValue() as number
        return val > 0 ? <span className="font-medium" style={{ color: '#f87171' }}>{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Logoman RC', {
      header: '🔥RC',
      cell: (info) => {
        const val = (info.getValue() as number) ?? 0
        return val > 0 ? <span className="font-medium" style={{ color: '#34d399' }}>{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Case Hit', {
      header: '✨',
      cell: (info) => {
        const val = info.getValue() as number
        return val > 0 ? <span className="font-medium" style={{ color: '#fbbf24' }}>{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Case Hit RC', {
      header: '✨RC',
      cell: (info) => {
        const val = (info.getValue() as number) ?? 0
        return val > 0 ? <span className="font-medium" style={{ color: '#34d399' }}>{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Auto garanties', {
      header: 'Garanties',
      cell: (info) => {
        const val = info.getValue() as number
        return val > 0
          ? <span className="font-medium" style={{ color: 'var(--accent)' }}>{val}</span>
          : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Nb Joueurs' as any, { header: 'Joueurs #' }),
    columnHelper.accessor('Immaculate Only', {
      header: 'Immacu. Only',
      cell: (info) => {
        const v = info.getValue() as number
        return v > 0
          ? <span style={{ color: '#a78bfa', fontWeight: 600 }}>{v}</span>
          : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Break Score', { header: 'Score' }),
    columnHelper.accessor('Part du break', { header: 'Part %', cell: (info) => `${info.getValue()}%` }),
    columnHelper.accessor('Hot Spot', { header: 'Hot', cell: (info) => info.getValue() || '—' }),
    columnHelper.accessor('Joueurs', {
      header: 'Joueurs',
      cell: (info) => {
        const val = info.getValue()
        return val ? <span className="text-[10px] leading-tight opacity-70 block max-w-[240px] truncate">{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
  ]
}

const METHODS = [
  { value: 'team', label: 'Break par Équipe' },
  { value: 'player', label: 'Break par Joueur' },
  { value: 'letter', label: 'Break par Lettre' },
  { value: 'letter_assignment', label: 'Break par Lettre (Assignation)' },
]

export function BreakSimulationView() {
  const { selectedSport, selectedChecklistIds, masterKey, availableChecklists } = useAppStore()
  const [method, setMethod] = useState('team')
  const [result, setResult] = useState<BreakSimulationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hitsGuaranteed, setHitsGuaranteed] = useState<Record<string, string>>({})
  const [extractedPlayers, setExtractedPlayers] = useState<string[]>([])
  // Letter Assignment mode state
  const [letterCustomMap, setLetterCustomMap] = useState<Record<string, string>>({})
  const [letterExtracted, setLetterExtracted] = useState<string[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null)

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

  async function runSimulate(overrides?: {
    method?: string
    custom_map?: Record<string, string>
    custom_spots?: string[]
    extracted?: string[]
  }) {
    setLoading(true)
    setError(null)
    const guaranteedMap: Record<string, number> = {}
    for (const id of selectedChecklistIds) {
      const raw = hitsGuaranteed[id]
      const n = (raw !== undefined && raw !== '') ? parseInt(raw) : 0
      guaranteedMap[id] = isNaN(n) ? 0 : Math.max(0, n)
    }
    const effectiveMethod = overrides?.method ?? method
    // letter_assignment → send as custom with players scope
    const apiMethod = effectiveMethod === 'letter_assignment' ? 'custom' : effectiveMethod
    try {
      const data = await fetchBreakSimulation({
        sport_key: selectedSport,
        checklist_ids: selectedChecklistIds,
        master_key: masterKey,
        method: apiMethod,
        custom_scope: effectiveMethod === 'letter_assignment' ? 'players' : undefined,
        custom_map: overrides?.custom_map,
        custom_spots: overrides?.custom_spots,
        checklist_hits_guaranteed: hasAnyGuaranteed ? guaranteedMap : undefined,
        extracted_players: overrides?.extracted ?? extractedPlayers,
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

  async function handleSimulate() {
    await runSimulate()
  }

  function handleLetterAssignmentSubmit(params: {
    custom_map: Record<string, string>
    extracted_players: string[]
    custom_spots: string[]
  }) {
    setLetterCustomMap(params.custom_map)
    setLetterExtracted(params.extracted_players)
    runSimulate({
      method: 'letter_assignment',
      custom_map: params.custom_map,
      custom_spots: params.custom_spots,
      extracted: params.extracted_players,
    })
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
      extracted_players: method === 'letter_assignment' ? letterExtracted : extractedPlayers,
      hits_guaranteed: guaranteedMap,
      custom_map: method === 'letter_assignment' ? letterCustomMap : undefined,
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
    setMethod(p.method)
    if (p.method === 'letter_assignment') {
      setLetterCustomMap(p.custom_map ?? {})
      setLetterExtracted(p.extracted_players)
    } else {
      setExtractedPlayers(p.extracted_players)
    }
    const hg: Record<string, string> = {}
    Object.entries(p.hits_guaranteed).forEach(([id, val]) => {
      hg[id] = String(val)
    })
    setHitsGuaranteed(hg)
    useAppStore.getState().setSelectedChecklistIds(p.checklist_ids)
    setPresetsOpen(false)
  }

  function exportCardDetails(cards: BreakCardDetail[], breakMethod: string) {
    const headers = ['Spot', 'Player', 'Team', 'Box Type', 'Numbering', 'Category', 'Checklist']
    const rows = cards.map(c => [
      c.Spot, c.Player, c.Team, c['Box Type'], c.Numbering, c.Category, c.Checklist
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `break_${breakMethod}_cartes.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportBySpot(spots: BreakSpotRecord[], cards: BreakCardDetail[], breakMethod: string) {
    const isAuto = (c: BreakCardDetail) =>
      c.Category === '💎 Auto/Mem' || c.Category === '💎 Auto/Memo'

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Break par Spot')
    ws.columns = [
      { key: 'joueur', width: 38 },
      { key: 'cartes', width: 10 },
      { key: 'auto', width: 12 },
    ]

    // Global column header
    const headerRow = ws.addRow(['Joueur', 'Cartes', 'Auto/Memo'])
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }
      cell.alignment = { horizontal: 'center' }
    })

    for (const spot of spots) {
      const spotCards = cards.filter(c => c.Spot === spot.Spot && !c.is_multi_ref)

      // Spot header row
      const spotRow = ws.addRow([`Spot ${spot.Spot}`, spot.Cartes, spot['Auto/Memo']])
      spotRow.height = 18
      spotRow.eachCell(cell => {
        cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
        cell.alignment = { horizontal: cell.address.startsWith('A') ? 'left' : 'center' }
      })

      if (spotCards.length === 0) {
        const emptyRow = ws.addRow(['(aucune carte)', 0, 0])
        emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' } }
      } else {
        // Aggregate per player
        const playerMap: Record<string, { cards: number; auto: number }> = {}
        for (const c of spotCards) {
          const key = c.Player || '—'
          if (!playerMap[key]) playerMap[key] = { cards: 0, auto: 0 }
          playerMap[key].cards += 1
          if (isAuto(c)) playerMap[key].auto += 1
        }
        let rowIdx = 0
        for (const [player, data] of Object.entries(playerMap)) {
          const r = ws.addRow([player, data.cards, data.auto])
          r.getCell(1).alignment = { horizontal: 'left' }
          r.getCell(2).alignment = { horizontal: 'center' }
          r.getCell(3).alignment = { horizontal: 'center' }
          // Alternating row background
          if (rowIdx % 2 === 1) {
            r.eachCell(cell => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
            })
          }
          rowIdx++
        }
        // TOTAL row
        const totalRow = ws.addRow(['TOTAL', spotCards.length, spotCards.filter(isAuto).length])
        totalRow.eachCell(cell => {
          cell.font = { bold: true }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
          cell.alignment = { horizontal: cell.address.startsWith('A') ? 'left' : 'center' }
        })
      }

      // Empty separator
      ws.addRow([])
    }

    // Borders on all non-empty rows
    ws.eachRow(row => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        }
      })
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `break_${breakMethod}_par_spot.xlsx`
    a.click()
    URL.revokeObjectURL(url)
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
      <div className="flex flex-wrap gap-3 mb-4">
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

        {method !== 'letter_assignment' && (
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
        )}
      </div>

      {/* Letter Assignment UI */}
      {method === 'letter_assignment' && (
        <div className="mb-6 rounded-xl p-4" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <p className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Assignation des joueurs par lettre
          </p>
          <LetterAssignmentUI
            onSubmit={handleLetterAssignmentSubmit}
            initialCustomMap={Object.keys(letterCustomMap).length > 0 ? letterCustomMap : undefined}
            initialExtractedPlayers={letterExtracted.length > 0 ? letterExtracted : undefined}
            submitLabel={loading ? '⏳ Simulation...' : '🎲 Simuler'}
            disabled={loading || selectedChecklistIds.length === 0}
          />
        </div>
      )}

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

          {/* Export */}
          {result.card_details && result.card_details.length > 0 && (
            <div className="flex justify-end gap-2 mb-3">
              <button
                onClick={() => void exportBySpot(result.spots, result.card_details, method)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)' }}
              >
                <Download size={13} />
                Export par spot (Excel)
              </button>
              <button
                onClick={() => exportCardDetails(result.card_details, method)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
              >
                <Download size={13} />
                Toutes les cartes
              </button>
            </div>
          )}

          {/* Full table */}
          <DataTable
            data={result.spots}
            columns={buildSpotColumns() as any}
            onRowClick={(row: any) => setSelectedSpot(row.Spot)}
            pageSize={100}
            searchable
            searchPlaceholder="Rechercher un spot..."
            exportName={`break_${method}`}
            initialSorting={[{ id: 'Break Score', desc: true }]}
          />

          {/* Panel détail d'un spot */}
          {selectedSpot && (() => {
            const spotCards = result.card_details.filter(c => c.Spot === selectedSpot)
            const spotRow = result.spots.find(s => s.Spot === selectedSpot)
            return (
              <div
                className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.6)' }}
                onClick={() => setSelectedSpot(null)}
              >
                <div
                  className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
                  style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-standard)', maxHeight: '80vh' }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div>
                      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Spot : {selectedSpot}
                      </h3>
                      {spotRow && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          {spotRow.Cartes} carte{spotRow.Cartes > 1 ? 's' : ''} · {spotRow['Auto/Memo']} Auto/Memo · Score {spotRow['Break Score']} · {spotRow['Part du break']}%
                          {spotRow['Hot Spot'] ? ' · 🔥 Hot' : ''}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedSpot(null)}
                      className="text-xl leading-none px-2 py-1 rounded-lg"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Liste des cartes */}
                  <div className="overflow-y-auto flex-1 px-2 py-2">
                    {spotCards.length === 0 ? (
                      <p className="text-sm px-3 py-4 text-center" style={{ color: 'var(--text-quaternary)' }}>
                        Aucune carte pour ce spot.
                      </p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'var(--bg-surface)' }}>
                            {['Joueur', 'Équipe', 'Type', 'Numérotation', 'Catégorie', 'Checklist'].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {spotCards.map((c, i) => (
                            <tr
                              key={i}
                              style={{
                                background: c.is_multi_ref
                                  ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-panel))'
                                  : i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-surface)',
                                opacity: c.is_multi_ref ? 0.85 : 1,
                              }}
                            >
                              <td className="px-3 py-2" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>
                                <span>{c.Player || '—'}</span>
                                {c.is_multi_ref && <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#fff', opacity: 0.8 }}>multi</span>}
                              </td>
                              <td className="px-3 py-2" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>{c.Team || '—'}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>{c['Box Type'] || '—'}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>{c.Numbering || '—'}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>{c.Category || '—'}</td>
                              <td className="px-3 py-2 max-w-[140px] truncate" style={{ color: 'var(--text-quaternary)', borderBottom: '1px solid var(--border-subtle)' }}>{c.Checklist || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
