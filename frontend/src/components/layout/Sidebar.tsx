import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../../stores/appStore'
import { fetchSports, fetchChecklists, fetchAnalysis } from '../../api/client'
import type { ChecklistInfo } from '../../types'

export function Sidebar() {
  const {
    selectedSport, setSport,
    availableChecklists, setAvailableChecklists,
    selectedChecklistIds, setSelectedChecklistIds, toggleChecklist,
    selectAllChecklists, deselectAllChecklists,
    masterKey, setMasterKey,
    setAnalysisData, setIsAnalyzing, isAnalyzing,
  } = useAppStore()

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

  // Update available checklists when data arrives
  useEffect(() => {
    if (checklistsData) {
      setAvailableChecklists(checklistsData.checklists)
      setMasterKey(checklistsData.master_key)
      // Auto-select all if nothing selected
      if (selectedChecklistIds.length === 0 && checklistsData.checklists.length > 0) {
        setSelectedChecklistIds(checklistsData.checklists.map((c) => c.checklist_id))
      }
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

  const currentSport = sports?.find((s) => s.key === selectedSport)

  return (
    <aside
      className="w-72 flex-shrink-0 flex flex-col h-screen overflow-y-auto"
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

      {/* Checklist selection */}
      <div className="px-4 py-2 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
            Checklists ({selectedCount}/{totalCount})
          </label>
          <button
            onClick={allSelected ? deselectAllChecklists : selectAllChecklists}
            className="text-xs px-2 py-0.5 rounded"
            style={{ color: 'var(--accent)' }}
          >
            {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        </div>

        {sortedYears.map((year) => (
          <div key={year} className="mb-2">
            <div className="text-xs font-medium mb-1 px-1" style={{ color: 'var(--text-quaternary)' }}>
              {year}
            </div>
            {checklistsByYear[year].map((cl) => (
              <label
                key={cl.checklist_id}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <input
                  type="checkbox"
                  checked={selectedChecklistIds.includes(cl.checklist_id)}
                  onChange={() => toggleChecklist(cl.checklist_id)}
                  className="rounded"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span className="truncate flex-1">{cl.checklist_name.replace('.parquet', '')}</span>
                <span style={{ color: 'var(--text-quaternary)' }}>{cl.rows}</span>
              </label>
            ))}
          </div>
        ))}
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
  )
}
