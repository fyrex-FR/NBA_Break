import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../../stores/appStore'
import { fetchSports, fetchChecklists, fetchAnalysis, fetchPresets, savePreset, deletePreset, uploadChecklist } from '../../api/client'
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
  const [confirmSelectAll, setConfirmSelectAll] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadOverwrite, setUploadOverwrite] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const queryClient = useQueryClient()

  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })

  const { data: checklistsData } = useQuery({
    queryKey: ['checklists', selectedSport],
    queryFn: () => fetchChecklists(selectedSport),
    enabled: !!selectedSport,
  })

  const { data: presetsData } = useQuery({
    queryKey: ['presets', selectedSport],
    queryFn: () => fetchPresets(selectedSport),
    enabled: !!selectedSport,
  })

  const presets: PresetInfo[] = presetsData?.presets || []

  useEffect(() => {
    if (checklistsData) {
      setAvailableChecklists(checklistsData.checklists)
      setMasterKey(checklistsData.master_key)
    }
  }, [checklistsData])

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

  function toggleYear(year: string) {
    const ids = checklistsByYear[year].map((c) => c.checklist_id)
    const allYearSelected = ids.every((id) => selectedChecklistIds.includes(id))
    if (allYearSelected) {
      setSelectedChecklistIds(selectedChecklistIds.filter((id) => !ids.includes(id)))
    } else {
      const merged = Array.from(new Set([...selectedChecklistIds, ...ids]))
      setSelectedChecklistIds(merged)
    }
  }

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
    } catch {
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

  async function handleUpload() {
    if (!uploadFile) return
    setUploading(true)
    setUploadStatus(null)
    try {
      const res = await uploadChecklist(uploadFile, selectedSport, uploadOverwrite)
      setUploadStatus({ type: 'ok', msg: `✅ ${res.checklist_id} — ${res.rows} lignes` })
      setUploadFile(null)
      setUploadOverwrite(false)
      queryClient.invalidateQueries({ queryKey: ['checklists', selectedSport] })
    } catch (err: any) {
      setUploadStatus({ type: 'err', msg: err.message || 'Erreur upload' })
    } finally {
      setUploading(false)
    }
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
          fixed inset-y-0 left-0 z-50 w-72 flex flex-col h-screen
          transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:flex-shrink-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: 'var(--bg-panel)', borderRight: '1px solid var(--border-subtle)' }}
      >
        {/* ── Header fixe ── */}
        <div className="flex-shrink-0">
          {/* Titre + sport sur une ligne */}
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="text-lg">{currentSport?.page_icon || '🏀'}</span>
            <select
              value={selectedSport}
              onChange={(e) => setSport(e.target.value)}
              className="flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {sports?.map((s) => (
                <option key={s.key} value={s.key}>{s.page_icon} {s.label}</option>
              ))}
            </select>
          </div>

          {/* Onglets */}
          <div className="flex mx-4 mb-2 rounded-lg overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setTab('selection')}
              className="flex-1 py-1.5 text-xs font-medium transition-colors"
              style={{ background: tab === 'selection' ? 'var(--accent)' : 'transparent', color: tab === 'selection' ? '#fff' : 'var(--text-tertiary)' }}
            >
              📋 Sélection
            </button>
            <button
              onClick={() => setTab('presets')}
              className="flex-1 py-1.5 text-xs font-medium transition-colors"
              style={{ background: tab === 'presets' ? 'var(--accent)' : 'transparent', color: tab === 'presets' ? '#fff' : 'var(--text-tertiary)' }}
            >
              💾 Presets{presets.length > 0 ? ` (${presets.length})` : ''}
            </button>
          </div>

          {/* Barre sélection — visible seulement sur l'onglet sélection */}
          {tab === 'selection' && (
            <div className="flex items-center justify-between px-4 pb-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                {selectedCount > 0 ? `${selectedCount} / ${totalCount} sélectionnées` : `${totalCount} checklists`}
              </span>
              <div className="flex gap-2">
                {selectedCount > 0 && (
                  <button
                    onClick={deselectAllChecklists}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ color: 'var(--text-quaternary)', border: '1px solid var(--border-subtle)' }}
                  >
                    ✕ Effacer
                  </button>
                )}
                {confirmSelectAll ? (
                  <button
                    onClick={() => { selectAllChecklists(); setConfirmSelectAll(false) }}
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ color: '#fff', background: 'var(--accent)' }}
                    onBlur={() => setConfirmSelectAll(false)}
                    autoFocus
                  >
                    ⚠️ {totalCount} — ok ?
                  </button>
                ) : (
                  !allSelected && (
                    <button
                      onClick={() => totalCount > 20 ? setConfirmSelectAll(true) : selectAllChecklists()}
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ color: 'var(--accent)' }}
                    >
                      Tout
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Contenu scrollable ── */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {tab === 'selection' ? (
            <>
              {sortedYears.map((year) => {
                const yearChecklists = checklistsByYear[year]
                const yearSelectedCount = yearChecklists.filter((cl) => selectedChecklistIds.includes(cl.checklist_id)).length
                const allYearSelected = yearSelectedCount === yearChecklists.length

                return (
                  <details key={year} className="mb-1 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <summary className="px-2.5 py-2 cursor-pointer select-none list-none">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{year}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.preventDefault(); toggleYear(year) }}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ color: allYearSelected ? 'var(--text-quaternary)' : 'var(--accent)', border: '1px solid var(--border-subtle)' }}
                          >
                            {allYearSelected ? '✕' : '+'}
                          </button>
                          <span className="text-xs" style={{ color: yearSelectedCount > 0 ? 'var(--accent)' : 'var(--text-quaternary)' }}>
                            {yearSelectedCount}/{yearChecklists.length}
                          </span>
                        </div>
                      </div>
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
              {/* Sauver preset */}
              <div className="mb-4 mt-1">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
                  Sauver la sélection ({selectedCount})
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                    placeholder="Nom du preset..."
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-xs"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
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
                {presetMsg && <div className="text-xs mt-1" style={{ color: 'var(--accent)' }}>{presetMsg}</div>}
              </div>

              {/* Liste presets */}
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-tertiary)' }}>Presets sauvegardés</label>
              {presets.length === 0 ? (
                <div className="text-xs py-4 text-center" style={{ color: 'var(--text-quaternary)' }}>Aucun preset sauvegardé</div>
              ) : (
                <div className="space-y-1 mb-6">
                  {presets.map((p) => (
                    <div key={p.name} className="flex items-center gap-2 px-2 py-2 rounded text-xs group" style={{ border: '1px solid var(--border-subtle)' }}>
                      <button onClick={() => handleLoadPreset(p)} className="flex-1 text-left truncate" style={{ color: 'var(--text-secondary)' }}>
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-1.5" style={{ color: 'var(--text-quaternary)' }}>({p.checklist_ids.length})</span>
                      </button>
                      <button
                        onClick={() => handleDeletePreset(p.name)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity px-1"
                        style={{ color: 'var(--text-quaternary)' }}
                      >🗑️</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-tertiary)' }}>📤 Ajouter une checklist</label>
                <label
                  className="flex items-center justify-center gap-2 rounded-lg py-3 cursor-pointer text-xs"
                  style={{
                    border: `2px dashed ${uploadFile ? 'var(--accent)' : 'var(--border-standard)'}`,
                    color: uploadFile ? 'var(--accent)' : 'var(--text-quaternary)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <span>{uploadFile ? `📄 ${uploadFile.name}` : '+ Choisir un fichier .xlsx'}</span>
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setUploadFile(e.target.files?.[0] || null); setUploadStatus(null) }} />
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer mt-2 mb-2" style={{ color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={uploadOverwrite} onChange={(e) => setUploadOverwrite(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                  Remplacer si existant
                </label>
                <button
                  onClick={handleUpload}
                  disabled={!uploadFile || uploading}
                  className="w-full py-2 rounded-lg text-xs font-medium"
                  style={{
                    background: uploadFile && !uploading ? 'var(--accent)' : 'var(--bg-hover)',
                    color: uploadFile && !uploading ? '#fff' : 'var(--text-quaternary)',
                  }}
                >
                  {uploading ? '⏳ Upload...' : '⬆️ Envoyer'}
                </button>
                {uploadStatus && (
                  <div className="text-xs px-2 py-1.5 rounded mt-2" style={{
                    background: uploadStatus.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: uploadStatus.type === 'ok' ? '#22c55e' : '#ef4444',
                  }}>
                    {uploadStatus.msg}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Bouton Lancer — toujours visible ── */}
        <div className="flex-shrink-0 p-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={handleLancer}
            disabled={selectedCount === 0 || isAnalyzing}
            className="w-full py-3 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: selectedCount > 0 ? 'var(--accent)' : 'var(--bg-surface)',
              color: selectedCount > 0 ? '#fff' : 'var(--text-quaternary)',
              opacity: isAnalyzing ? 0.6 : 1,
            }}
          >
            {isAnalyzing ? '⏳ Analyse...' : selectedCount > 0 ? `🚀 Lancer (${selectedCount})` : 'Sélectionnez des checklists'}
          </button>
        </div>
      </aside>
    </>
  )
}
