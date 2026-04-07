import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../../stores/appStore'
import { fetchSports, fetchChecklists, fetchAnalysis, fetchPresets, savePreset, deletePreset } from '../../api/client'
import type { ChecklistInfo, PresetInfo } from '../../types'

type SidebarTab = 'selection' | 'presets'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const {
    selectedSport, setSport,
    availableChecklists, setAvailableChecklists,
    selectedChecklistIds, setSelectedChecklistIds, toggleChecklist,
    selectAllChecklists, deselectAllChecklists,
    masterKey, setMasterKey,
    setAnalysisData, setIsAnalyzing, isAnalyzing,
  } = useAppStore()

  const [tab, setTab] = useState<SidebarTab>('selection')
  const [presetName, setPresetName] = useState('')
  const [presetMsg, setPresetMsg] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Fetch sports list
  const { data: sports } = useQuery({
    queryKey: ['sports'],
    queryFn: fetchSports,
  })

  // Fetch checklists when sport changes
  const { data: checklistsData } = useQuery({
    queryKey: ['checklists', selectedSport],
    queryFn: () => fetchChecklists(selectedSport),
    enabled: !!selectedSport,
  })

  // Fetch presets
  const { data: presetsData } = useQuery({
    queryKey: ['presets', selectedSport],
    queryFn: () => fetchPresets(selectedSport),
    enabled: !!selectedSport,
  })

  const presets: PresetInfo[] = presetsData?.presets || []

  // Update available checklists when data arrives (don't auto-select)
  useEffect(() => {
    if (checklistsData) {
      setAvailableChecklists(checklistsData.checklists)
      setMasterKey(checklistsData.master_key)
    }
  }, [checklistsData])

  // Group checklists by year
  const checklistsByYear = availableChecklists.reduce<Record<string, ChecklistInfo[]>>((acc, c) => {
    const year = c.year || 'Inconnue'
    if (!acc[year]) acc[year] = []
    acc[year].push(c)
    return acc
  }, {})
  const sortedYears = Object.keys(checklistsByYear).sort().reverse()

  const selectedCount = selectedChecklistIds.length
  const totalCount = availableChecklists.length
  const allSelected = selectedCount === totalCount && totalCount > 0

  async function handleLancer() {
    if (selectedChecklistIds.length === 0) return
    onClose()
    setIsAnalyzing(true)
    try {
      const data = await fetchAnalysis(selectedSport, selectedChecklistIds, masterKey)
      setAnalysisData(data)
    } catch (err) {
      console.error('Analysis failed:', err)
      setAnalysisData(null)
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleSavePreset() {
    if (!presetName.trim()) return
    try {
      await savePreset(selectedSport, presetName.trim(), selectedChecklistIds)
      setPresetMsg(`"${presetName.trim()}" sauvegardé`)
      setPresetName('')
      queryClient.invalidateQueries({ queryKey: ['presets', selectedSport] })
      setTimeout(() => setPresetMsg(null), 2000)
    } catch (err) {
      setPresetMsg('Erreur lors de la sauvegarde')
      setTimeout(() => setPresetMsg(null), 2000)
    }
  }

  async function handleDeletePreset(name: string) {
    try {
      await deletePreset(selectedSport, name)
      queryClient.invalidateQueries({ queryKey: ['presets', selectedSport] })
    } catch (err) {
      console.error('Delete preset failed:', err)
    }
  }

  function handleLoadPreset(preset: PresetInfo) {
    setSelectedChecklistIds(preset.checklist_ids)
    setTab('selection')
  }

  const currentSport = sports?.find((s) => s.key === selectedSport)

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 flex flex-col h-screen overflow-y-auto
          transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:flex-shrink-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: 'var(--bg-panel)', borderRight: '1px solid var(--border-subtle)' }}
      >
      {/* Header */}
      <div className="p-4 pb-2">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          {currentSport?.page_icon || '🏀'} Checklist Optimizer
        </h1>
      </div>

      {/* Sport selector */}
      <div className="px-4 py-2">
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
          Sport
        </label>
        <select
          value={selectedSport}
          onChange={(e) => setSport(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-standard)',
            color: 'var(--text-primary)',
          }}
        >
          {sports?.map((s) => (
            <option key={s.key} value={s.key}>
              {s.page_icon} {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tab switch: Sélection / Presets */}
      <div className="flex mx-4 mt-2 rounded-lg overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => setTab('selection')}
          className="flex-1 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: tab === 'selection' ? 'var(--accent)' : 'transparent',
            color: tab === 'selection' ? '#fff' : 'var(--text-tertiary)',
          }}
        >
          📋 Sélection
        </button>
        <button
          onClick={() => setTab('presets')}
          className="flex-1 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: tab === 'presets' ? 'var(--accent)' : 'transparent',
            color: tab === 'presets' ? '#fff' : 'var(--text-tertiary)',
          }}
        >
          💾 Presets{presets.length > 0 ? ` (${presets.length})` : ''}
        </button>
      </div>

      {/* Tab content */}
      <div className="px-4 py-2 flex-1 overflow-y-auto">
        {tab === 'selection' ? (
          <>
            {/* Checklist selection */}
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                Checklists ({selectedCount}/{totalCount})
              </label>
              <button
                onClick={allSelected ? deselectAllChecklists : selectAllChecklists}
                className="text-xs px-2 py-0.5 rounded"
                style={{ color: 'var(--accent)' }}
              >
                {allSelected ? 'Désélectionner' : 'Tout'}
              </button>
            </div>

            {sortedYears.map((year) => {
              const yearChecklists = checklistsByYear[year]
              const yearSelectedCount = yearChecklists.filter((cl) => selectedChecklistIds.includes(cl.checklist_id)).length
              return (
                <details key={year} className="mb-1 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <summary
                    className="px-2.5 py-2 cursor-pointer text-xs font-medium flex items-center justify-between select-none"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span>{year}</span>
                    <span style={{ color: yearSelectedCount > 0 ? 'var(--accent)' : 'var(--text-quaternary)' }}>
                      {yearSelectedCount}/{yearChecklists.length}
                    </span>
                  </summary>
                  <div className="pb-1">
                    {yearChecklists.map((cl) => (
                      <label
                        key={cl.checklist_id}
                        className="flex items-start gap-2 px-2.5 py-1.5 text-xs cursor-pointer"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <input
                          type="checkbox"
                          checked={selectedChecklistIds.includes(cl.checklist_id)}
                          onChange={() => toggleChecklist(cl.checklist_id)}
                          className="rounded mt-0.5 flex-shrink-0"
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        <span className="flex-1 break-words leading-snug">{cl.checklist_name.replace('.parquet', '')}</span>
                        <span className="flex-shrink-0" style={{ color: 'var(--text-quaternary)' }}>{cl.rows}</span>
                      </label>
                    ))}
                  </div>
                </details>
              )
            })}
          </>
        ) : (
          <>
            {/* Presets tab */}
            {/* Save current selection */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
                Sauver la sélection actuelle ({selectedCount})
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                  placeholder="Nom du preset..."
                  className="flex-1 rounded-lg px-2.5 py-1.5 text-xs"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-standard)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  onClick={handleSavePreset}
                  disabled={!presetName.trim() || selectedCount === 0}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: presetName.trim() && selectedCount > 0 ? 'var(--accent)' : 'var(--bg-surface)',
                    color: presetName.trim() && selectedCount > 0 ? '#fff' : 'var(--text-quaternary)',
                  }}
                >
                  💾
                </button>
              </div>
              {presetMsg && (
                <div className="text-xs mt-1" style={{ color: 'var(--accent)' }}>{presetMsg}</div>
              )}
            </div>

            {/* Saved presets list */}
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
              Presets sauvegardés
            </label>
            {presets.length === 0 ? (
              <div className="text-xs py-4 text-center" style={{ color: 'var(--text-quaternary)' }}>
                Aucun preset sauvegardé
              </div>
            ) : (
              <div className="space-y-1">
                {presets.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-2 px-2 py-2 rounded text-xs group"
                    style={{ border: '1px solid var(--border-subtle)' }}
                  >
                    <button
                      onClick={() => handleLoadPreset(p)}
                      className="flex-1 text-left truncate"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-1.5" style={{ color: 'var(--text-quaternary)' }}>
                        ({p.checklist_ids.length})
                      </span>
                    </button>
                    <button
                      onClick={() => handleDeletePreset(p.name)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity px-1"
                      style={{ color: 'var(--text-quaternary)' }}
                      title="Supprimer"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Lancer button */}
      <div className="p-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={handleLancer}
          disabled={selectedCount === 0 || isAnalyzing}
          className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: selectedCount > 0 ? 'var(--accent)' : 'var(--bg-surface)',
            color: selectedCount > 0 ? '#fff' : 'var(--text-quaternary)',
            opacity: isAnalyzing ? 0.6 : 1,
          }}
        >
          {isAnalyzing ? '⏳ Analyse...' : `🚀 Lancer (${selectedCount})`}
        </button>
      </div>
    </aside>
    </>
  )
}
