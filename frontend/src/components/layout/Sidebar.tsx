import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../../stores/appStore'
import { fetchSports, fetchChecklists, fetchAnalysis, fetchPresets, savePreset, deletePreset, uploadChecklist } from '../../api/client'
import {
  Sun, Moon, Plus, FileSpreadsheet, UploadCloud, Copy, Check, Trash2,
  ChevronDown, ChevronRight, Save, Play, Folder, Database
} from 'lucide-react'

import type { ChecklistInfo, PresetInfo } from '../../types'

type SidebarTab = 'selection' | 'presets'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

function formatChecklistName(raw: string) {
  const clean = raw.replace(/\.(parquet|xlsx)$/i, '')
  const match = clean.match(/^(\d{4}-\d{2})-(.+)$/)
  if (match) {
    const year = match[1]
    const name = match[2].replace(/-/g, ' ')
    // title case
    const titleCaseName = name.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
    return { name: titleCaseName, year }
  }
  const fallback = clean.replace(/-/g, ' ')
  return { name: fallback.charAt(0).toUpperCase() + fallback.slice(1), year: '' }
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const {
    selectedSport, setSport,
    availableChecklists, setAvailableChecklists,
    selectedChecklistIds, setSelectedChecklistIds, toggleChecklist,
    selectAllChecklists, deselectAllChecklists,
    masterKey, setMasterKey,
    setAnalysisData, setIsAnalyzing, isAnalyzing,
    theme, toggleTheme,
  } = useAppStore()

  const [tab, setTab] = useState<SidebarTab>('selection')
  const [presetName, setPresetName] = useState('')
  const [presetMsg, setPresetMsg] = useState<string | null>(null)
  const [confirmSelectAll, setConfirmSelectAll] = useState(false)
  const [openYears, setOpenYears] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
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

  function toggleYearOpen(year: string) {
    setOpenYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
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
          fixed inset-y-0 left-0 z-50 w-80 flex flex-col h-dvh
          transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:flex-shrink-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: 'var(--bg-panel)', borderRight: '1px solid var(--border-subtle)' }}
      >
        {/* ── Header fixe ── */}
        <div className="flex-shrink-0">
          {/* Logo NoClim */}
          {(() => {
            const currentSport = sports?.find(s => s.key === selectedSport)
            const icon = currentSport?.page_icon
            return (
              <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                {icon
                  ? <span className="text-2xl w-8 h-8 flex items-center justify-center flex-shrink-0">{icon}</span>
                  : <img src="/logo.png" alt="NoClim" className="w-8 h-8 flex-shrink-0 shadow-sm" style={{ borderRadius: '24%' }} />
                }
                <span className="font-extrabold text-lg tracking-tight" style={{ color: 'var(--text-primary)' }}>NoClim</span>
              </div>
            )
          })()}</div>

          {/* Titre + sport + bouton upload */}
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="flex items-center bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 flex-1 shadow-sm">
              <Database className="w-4 h-4 text-[var(--accent)] mr-2" />
              <select
                value={selectedSport}
                onChange={(e) => setSport(e.target.value)}
                className="flex-1 font-semibold text-sm outline-none bg-transparent cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                {sports?.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { setUploadOpen((v) => !v); setUploadStatus(null) }}
              title="Ajouter une checklist"
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-all flex-shrink-0 shadow-sm"
              style={{
                background: uploadOpen ? 'var(--accent)' : 'var(--bg-surface)',
                color: uploadOpen ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Panel upload inline */}
          {uploadOpen && (
            <div className="mx-4 mb-3 p-4 rounded-xl space-y-3 shadow-glass" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <label
                className="flex items-center justify-center gap-2 rounded-lg py-4 cursor-pointer text-sm font-medium transition-colors"
                style={{
                  border: `2px dashed ${uploadFile ? 'var(--accent)' : 'var(--border-standard)'}`,
                  color: uploadFile ? 'var(--accent)' : 'var(--text-tertiary)',
                  background: uploadFile ? 'transparent' : 'var(--bg-panel)'
                }}
              >
                {uploadFile ? <FileSpreadsheet className="w-4 h-4" /> : <UploadCloud className="w-4 h-4" />}
                <span>{uploadFile ? uploadFile.name : 'Choisir un fichier .xlsx'}</span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setUploadFile(e.target.files?.[0] || null); setUploadStatus(null) }} />
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer font-medium" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={uploadOverwrite} onChange={(e) => setUploadOverwrite(e.target.checked)} className="rounded" style={{ accentColor: 'var(--accent)' }} />
                Remplacer si existant
              </label>
              <button
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
                style={{
                  background: uploadFile && !uploading ? 'var(--accent)' : 'var(--bg-hover)',
                  color: uploadFile && !uploading ? '#fff' : 'var(--text-quaternary)',
                }}
              >
                {uploading ? 'Upload en cours...' : 'Envoyer'}
              </button>
              {uploadStatus && (
                <div className="text-sm px-3 py-2 rounded-lg" style={{
                  background: uploadStatus.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: uploadStatus.type === 'ok' ? '#22c55e' : '#ef4444',
                }}>
                  {uploadStatus.msg}
                </div>
              )}
            </div>
          )}

          {/* Onglets */}
          <div className="flex mx-4 mt-2 mb-3 rounded-lg overflow-hidden p-1 shadow-sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setTab('selection')}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex justify-center items-center gap-1.5"
              style={{
                background: tab === 'selection' ? 'var(--bg-panel)' : 'transparent',
                color: tab === 'selection' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: tab === 'selection' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Folder className="w-3.5 h-3.5" /> Sélection
            </button>
            <button
              onClick={() => setTab('presets')}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex justify-center items-center gap-1.5"
              style={{
                background: tab === 'presets' ? 'var(--bg-panel)' : 'transparent',
                color: tab === 'presets' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: tab === 'presets' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Save className="w-3.5 h-3.5" /> Presets{presets.length > 0 ? ` (${presets.length})` : ''}
            </button>
          </div>

          {/* Barre sélection — visible seulement sur l'onglet sélection */}
          {tab === 'selection' && (
            <div className="flex items-center justify-between px-5 pb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                  {selectedCount > 0 ? `${selectedCount} / ${totalCount} sel.` : `${totalCount} items`}
                </span>
                {selectedCount > 0 && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                    className="text-xs px-2 py-1 rounded flex items-center transition-colors"
                    style={{
                      color: copied ? '#22c55e' : 'var(--text-secondary)',
                      background: copied ? 'rgba(34,197,94,0.1)' : 'var(--bg-surface)'
                    }}
                    title="Copier le lien de partage"
                  >
                    {copied ? <><Check className="w-3 h-3 mr-1" /> Copié</> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {selectedCount > 0 && (
                  <button
                    onClick={deselectAllChecklists}
                    className="text-xs px-2 py-1 rounded transition-colors hover:text-red-400"
                    style={{ color: 'var(--text-quaternary)', background: 'var(--bg-surface)' }}
                  >
                    Effacer
                  </button>
                )}
                {confirmSelectAll ? (
                  <button
                    onClick={() => { selectAllChecklists(); setConfirmSelectAll(false) }}
                    className="text-xs px-2 py-1 rounded font-semibold text-white shadow-sm"
                    style={{ background: 'var(--accent)' }}
                    onBlur={() => setConfirmSelectAll(false)}
                    autoFocus
                  >
                    Confirmer
                  </button>
                ) : (
                  !allSelected && (
                    <button
                      onClick={() => totalCount > 20 ? setConfirmSelectAll(true) : selectAllChecklists()}
                      className="text-xs px-2 py-1 rounded font-medium"
                      style={{ color: 'var(--accent)', background: 'var(--bg-surface)' }}
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
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {tab === 'selection' ? (
            <div className="space-y-3">
              {sortedYears.map((year) => {
                const yearChecklists = checklistsByYear[year]
                const yearSelectedCount = yearChecklists.filter((cl) => selectedChecklistIds.includes(cl.checklist_id)).length
                const allYearSelected = yearSelectedCount === yearChecklists.length

                const isOpen = openYears.has(year)
                return (
                  <div key={year} className="rounded-xl overflow-hidden shadow-sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    {/* En-tête année — clic = expand/collapse */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-[var(--bg-hover)] transition-colors"
                      onClick={() => toggleYearOpen(year)}
                    >
                      <span className="flex-shrink-0 text-[var(--accent)]">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <span className="font-bold text-sm flex-1 tracking-wide" style={{ color: 'var(--text-primary)' }}>{year}</span>
                      <span className="text-xs font-semibold flex-shrink-0" style={{ color: yearSelectedCount > 0 ? 'var(--accent)' : 'var(--text-quaternary)' }}>
                        {yearSelectedCount}/{yearChecklists.length}
                      </span>
                      {/* Checkbox pour sélectionner/désélectionner toute l'année */}
                      <input
                        type="checkbox"
                        checked={allYearSelected}
                        ref={(el) => { if (el) el.indeterminate = yearSelectedCount > 0 && !allYearSelected }}
                        onChange={(e) => { e.stopPropagation(); toggleYear(year) }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0 rounded w-3.5 h-3.5 ml-2"
                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                    </div>
                    {/* Checklists de l'année */}
                    {isOpen && (
                      <div className="pb-2 pt-1 px-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        {yearChecklists.map((cl) => {
                          const formatted = formatChecklistName(cl.checklist_name);
                          const isSelected = selectedChecklistIds.includes(cl.checklist_id);
                          return (
                            <label
                              key={cl.checklist_id}
                              className={`flex items-start gap-3 px-3 py-2 text-sm cursor-pointer rounded-lg transition-colors my-0.5 ${isSelected ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'}`}
                              style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleChecklist(cl.checklist_id)}
                                className="rounded mt-1 w-3.5 h-3.5 flex-shrink-0"
                                style={{ accentColor: 'var(--accent)' }}
                              />
                              <div className="flex-1 flex flex-col justify-center">
                                <span className="font-semibold">{formatted.name}</span>
                                {formatted.year && <span className="text-xs text-[var(--text-tertiary)]">{formatted.year}</span>}
                              </div>
                              <span className="flex-shrink-0 text-xs font-medium py-1" style={{ color: 'var(--text-quaternary)' }}>{cl.rows} items</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="px-1">
              {/* Sauver preset */}
              <div className="mb-6 mt-2 p-4 rounded-xl shadow-glass" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <label className="text-sm font-semibold mb-2 block" style={{ color: 'var(--text-primary)' }}>
                  Sauver la sélection ({selectedCount})
                </label>
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                    placeholder="Nom du preset..."
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-border"
                    style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={!presetName.trim() || selectedCount === 0}
                    className="px-3 py-2 rounded-lg shadow-sm transition-colors"
                    style={{
                      background: presetName.trim() && selectedCount > 0 ? 'var(--accent)' : 'var(--bg-hover)',
                      color: presetName.trim() && selectedCount > 0 ? '#fff' : 'var(--text-quaternary)',
                    }}
                  >
                    <Save className="w-5 h-5" />
                  </button>
                </div>
                {presetMsg && <div className="text-sm font-medium mt-3" style={{ color: 'var(--accent)' }}>{presetMsg}</div>}
              </div>

              {/* Liste presets */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <BookmarkIcon />
                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Presets sauvegardés</label>
              </div>

              {presets.length === 0 ? (
                <div className="text-sm py-8 text-center rounded-xl dashed-border" style={{ color: 'var(--text-quaternary)', border: '1px dashed var(--border-solid)' }}>
                  Aucun preset existant
                </div>
              ) : (
                <div className="space-y-2">
                  {presets.map((p) => (
                    <div key={p.name} className="flex items-center gap-3 px-3 py-3 rounded-xl group transition-all" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                      <button onClick={() => handleLoadPreset(p)} className="flex-1 text-left flex items-baseline gap-2 truncate">
                        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                        <span className="text-xs font-medium" style={{ color: 'var(--text-quaternary)' }}>{p.checklist_ids.length} items</span>
                      </button>
                      <button
                        onClick={() => handleDeletePreset(p.name)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-500/10 text-[var(--text-quaternary)] hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bouton Lancer — toujours visible ── */}
        <div className="flex-shrink-0 p-5" style={{ background: 'var(--bg-panel)', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={handleLancer}
            disabled={selectedCount === 0 || isAnalyzing}
            className="w-full py-3.5 rounded-xl text-sm font-bold shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-[var(--accent)] focus:ring-offset-[var(--bg-panel)] flex items-center justify-center gap-2"
            style={{
              background: selectedCount > 0 ? 'var(--accent)' : 'var(--bg-surface)',
              color: selectedCount > 0 ? '#fff' : 'var(--text-quaternary)',
              opacity: isAnalyzing ? 0.8 : 1,
            }}
          >
            {isAnalyzing ? 'Analyse en cours...' : (
              <>
                <Play className="w-4 h-4 fill-current" />
                {selectedCount > 0 ? `LANCER L'ANALYSE (${selectedCount})` : 'SÉLECTIONNEZ DES DONNÉES'}
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  )
}

function BookmarkIcon() {
  return <Save className="w-4 h-4 text-[var(--text-tertiary)]" />;
}
