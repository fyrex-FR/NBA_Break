import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../../stores/appStore'
import { fetchSports, fetchChecklists, fetchAnalysis, fetchPresets, savePreset, deletePreset, uploadChecklist, deleteChecklist, fetchOddsIndex, fetchOddsSheet } from '../../api/client'
import {
  Sun, Moon, Plus, FileSpreadsheet, UploadCloud, Copy, Check, Trash2,
  ChevronDown, ChevronRight, Save, Play, Folder, Database, Search, ArrowDownAZ, ArrowUpZA, Rows3, Target
} from 'lucide-react'

import type { ChecklistInfo, OddsConfig, PresetInfo } from '../../types'
import { BreakModePanel } from './BreakModePanel'

const ODDS_CHANNEL_LABELS_FR: Record<string, string> = {
  hobby: 'Hobby',
  retail: 'Retail',
  special: 'Spécial',
}
const ODDS_CHANNEL_ORDER = ['hobby', 'retail', 'special']

type SidebarTab = 'selection' | 'presets'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

function formatChecklistName(raw: string, displayName?: string) {
  if (displayName?.trim()) {
    const cleanDisplay = displayName.trim()
    const match = cleanDisplay.match(/^(\d{4}-\d{2})\s+(.+)$/)
    if (match) return { name: match[2], year: match[1] }
    return { name: cleanDisplay, year: '' }
  }
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

function sortChecklists(checklists: ChecklistInfo[], mode: 'year' | 'rows_desc' | 'rows_asc' | 'name_asc' | 'name_desc') {
  const sorted = [...checklists]
  sorted.sort((a, b) => {
    const aName = a.display_name || a.checklist_name
    const bName = b.display_name || b.checklist_name
    if (mode === 'rows_desc') return b.rows - a.rows || aName.localeCompare(bName)
    if (mode === 'rows_asc') return a.rows - b.rows || aName.localeCompare(bName)
    if (mode === 'name_desc') return bName.localeCompare(aName)
    if (mode === 'name_asc') return aName.localeCompare(bName)
    return aName.localeCompare(bName)
  })
  return sorted
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const {
    selectedSport, setSport,
    availableChecklists, setAvailableChecklists,
    selectedChecklistIds, setSelectedChecklistIds, toggleChecklist,
    selectAllChecklists, deselectAllChecklists,
    masterKey, setMasterKey,
    setAnalysisData, setIsAnalyzing, isAnalyzing,
    setActiveView,
    theme, toggleTheme,
    selectedConfigKeys, toggleConfigKey, clearConfigKeys, setSelectedConfigKeys,
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
  const [checklistQuery, setChecklistQuery] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [productFilter, setProductFilter] = useState('all')
  const [sortMode, setSortMode] = useState<'year' | 'rows_desc' | 'rows_asc' | 'name_asc' | 'name_desc'>('year')
  const [deletingChecklistId, setDeletingChecklistId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteToken, setDeleteToken] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
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

  // ── Odds Topps : indicateur "a une feuille d'odds" + sélecteur de config ──
  const { data: oddsIndexData } = useQuery({
    queryKey: ['odds-index', selectedSport],
    queryFn: () => fetchOddsIndex(selectedSport),
    enabled: !!selectedSport,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const oddsChecklistIds = useMemo(() => new Set(oddsIndexData?.checklist_ids ?? []), [oddsIndexData])

  const selectedChecklistIdsWithOdds = useMemo(
    () => selectedChecklistIds.filter((id) => oddsChecklistIds.has(id)),
    [selectedChecklistIds, oddsChecklistIds],
  )

  const oddsSheetQueries = useQueries({
    queries: selectedChecklistIdsWithOdds.map((id) => ({
      queryKey: ['odds-sheet', selectedSport, id],
      queryFn: () => fetchOddsSheet(selectedSport, id),
      enabled: !!selectedSport,
      retry: false,
      staleTime: 5 * 60 * 1000,
    })),
  })

  // Union des configs des checklists sélectionnées qui ont une feuille d'odds, dédupliquées par clé.
  const oddsConfigOptions = useMemo(() => {
    const byKey = new Map<string, OddsConfig>()
    for (const q of oddsSheetQueries) {
      for (const c of q.data?.configs ?? []) {
        if (!byKey.has(c.key)) byKey.set(c.key, c)
      }
    }
    return Array.from(byKey.values())
  }, [oddsSheetQueries])

  useEffect(() => {
    if (oddsConfigOptions.length === 0 || selectedConfigKeys.length === 0) return
    const validKeys = new Set(oddsConfigOptions.map((c) => c.key))
    const next = selectedConfigKeys.filter((key) => validKeys.has(key))
    if (next.length !== selectedConfigKeys.length) setSelectedConfigKeys(next)
  }, [oddsConfigOptions, selectedConfigKeys, setSelectedConfigKeys])

  useEffect(() => {
    if (checklistsData) {
      setAvailableChecklists(checklistsData.checklists)
      setMasterKey(checklistsData.master_key)
    }
  }, [checklistsData])

  const availableProducts = Array.from(new Set(
    availableChecklists.map((c) => formatChecklistName(c.checklist_name, c.display_name).name),
  )).sort((a, b) => a.localeCompare(b))

  const filteredChecklists = availableChecklists.filter((c) => {
    if (selectedOnly && !selectedChecklistIds.includes(c.checklist_id)) return false
    if (productFilter !== 'all' && formatChecklistName(c.checklist_name, c.display_name).name !== productFilter) return false
    if (!checklistQuery.trim()) return true

    const q = checklistQuery.trim().toLowerCase()
    const formatted = formatChecklistName(c.checklist_name, c.display_name)
    const haystack = [
      c.checklist_name,
      c.checklist_id,
      c.canonical_checklist_id,
      ...(c.legacy_checklist_ids || []),
      c.display_name,
      formatted.name,
      formatted.year,
      c.year,
    ].join(' ').toLowerCase()
    return haystack.includes(q)
  })

  const checklistsByYear = filteredChecklists.reduce<Record<string, ChecklistInfo[]>>((acc, c) => {
    const year = c.year || 'Inconnue'
    if (!acc[year]) acc[year] = []
    acc[year].push(c)
    return acc
  }, {})
  const sortedYears = Object.keys(checklistsByYear).sort().reverse()
  const visibleSelectedCount = filteredChecklists.filter((c) => selectedChecklistIds.includes(c.checklist_id)).length
  const visibleRows = filteredChecklists.reduce((sum, c) => sum + c.rows, 0)
  const selectedChecklistDetails = sortChecklists(
    availableChecklists.filter((c) => selectedChecklistIds.includes(c.checklist_id)),
    'year',
  )
  const selectedRows = selectedChecklistDetails.reduce((sum, c) => sum + c.rows, 0)
  const effectiveOpenYears = checklistQuery.trim() || selectedOnly || productFilter !== 'all'
    ? new Set(sortedYears)
    : openYears

  const selectedCount = selectedChecklistIds.length
  const totalCount = availableChecklists.length
  const allSelected = selectedCount === totalCount && totalCount > 0
  const allVisibleSelected = filteredChecklists.length > 0 && filteredChecklists.every((c) => selectedChecklistIds.includes(c.checklist_id))
  const hasSelectionFilters = !!checklistQuery.trim() || selectedOnly || productFilter !== 'all'

  function selectVisibleChecklists() {
    setSelectedChecklistIds(Array.from(new Set([
      ...selectedChecklistIds,
      ...filteredChecklists.map((c) => c.checklist_id),
    ])))
  }

  function toggleYear(yearChecklists: ChecklistInfo[]) {
    const ids = yearChecklists.map((c) => c.checklist_id)
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
      setActiveView('🌍 Vue Globale')
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

  async function handleDeleteChecklist(checklistId: string) {
    setDeleteTarget(checklistId)
    setDeleteToken('')
    setDeleteError(null)
  }

  async function confirmDeleteChecklist() {
    if (!deleteTarget) return
    setDeletingChecklistId(deleteTarget)
    setDeleteError(null)
    try {
      await deleteChecklist(selectedSport, deleteTarget, deleteToken)
      setSelectedChecklistIds(selectedChecklistIds.filter((id) => id !== deleteTarget))
      queryClient.invalidateQueries({ queryKey: ['checklists', selectedSport] })
      setDeleteTarget(null)
      setDeleteToken('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur'
      setDeleteError(msg.includes('401') || msg.includes('Token') ? 'Token invalide.' : msg)
    } finally {
      setDeletingChecklistId(null)
    }
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
          })()}

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
                  {filteredChecklists.length !== totalCount
                    ? `${visibleSelectedCount} / ${filteredChecklists.length} visibles`
                    : selectedCount > 0 ? `${selectedCount} / ${totalCount} sel.` : `${totalCount} items`}
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
                    onClick={() => {
                      hasSelectionFilters ? selectVisibleChecklists() : selectAllChecklists()
                      setConfirmSelectAll(false)
                    }}
                    className="text-xs px-2 py-1 rounded font-semibold text-white shadow-sm"
                    style={{ background: 'var(--accent)' }}
                    onBlur={() => setConfirmSelectAll(false)}
                    autoFocus
                  >
                    Confirmer
                  </button>
                ) : (
                  !(hasSelectionFilters ? allVisibleSelected : allSelected) && (
                    <button
                      onClick={() => {
                        const volume = hasSelectionFilters ? filteredChecklists.length : totalCount
                        if (volume > 20) setConfirmSelectAll(true)
                        else if (hasSelectionFilters) selectVisibleChecklists()
                        else selectAllChecklists()
                      }}
                      className="text-xs px-2 py-1 rounded font-medium"
                      style={{ color: 'var(--accent)', background: 'var(--bg-surface)' }}
                    >
                      {hasSelectionFilters ? 'Tout visible' : 'Tout'}
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
              <BreakModePanel onAfterLoad={onClose} />

              {oddsConfigOptions.length > 0 && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                      <Target className="w-3.5 h-3.5 text-[var(--accent)]" /> Je break du...
                    </label>
                    {selectedConfigKeys.length > 0 && (
                      <button
                        onClick={clearConfigKeys}
                        className="text-[11px] px-2 py-1 rounded-full"
                        style={{ background: 'var(--bg-panel)', color: 'var(--text-quaternary)', border: '1px solid var(--border-standard)' }}
                      >
                        Aucune
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {ODDS_CHANNEL_ORDER.map((channel) => {
                      const opts = oddsConfigOptions.filter((c) => c.channel === channel)
                      if (opts.length === 0) return null
                      return (
                        <div key={channel} className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-quaternary)' }}>
                            {ODDS_CHANNEL_LABELS_FR[channel] || channel}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {opts.map((c) => {
                              const isSelected = selectedConfigKeys.includes(c.key)
                              return (
                                <button
                                  key={c.key}
                                  type="button"
                                  onClick={() => toggleConfigKey(c.key)}
                                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors"
                                  style={{
                                    background: isSelected ? 'var(--accent)' : 'var(--bg-panel)',
                                    color: isSelected ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-standard)'}`,
                                  }}
                                  title={isSelected ? 'Retirer cette configuration' : 'Ajouter cette configuration'}
                                >
                                  <span
                                    className="inline-flex h-3.5 w-3.5 items-center justify-center rounded"
                                    style={{ background: isSelected ? 'rgba(255,255,255,0.18)' : 'var(--bg-surface)', border: '1px solid currentColor' }}
                                  >
                                    {isSelected ? <Check className="w-2.5 h-2.5" /> : null}
                                  </span>
                                  {c.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {selectedConfigKeys.length > 0 && (
                    <p className="text-[11px] leading-snug" style={{ color: 'var(--text-quaternary)' }}>
                      Les pastilles « Best » et la pondération du break tiennent compte des configurations cochées.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-quaternary)' }} />
                  <input
                    type="text"
                    value={checklistQuery}
                    onChange={(e) => setChecklistQuery(e.target.value)}
                    placeholder="Rechercher une checklist, année, id..."
                    className="w-full rounded-lg pl-9 pr-3 py-2 text-sm"
                    style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)' }}
                  >
                    <option value="all">Tous les produits</option>
                    {availableProducts.map((product) => (
                      <option key={product} value={product}>{product}</option>
                    ))}
                  </select>

                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)' }}
                  >
                    <option value="year">Tri: année / alpha</option>
                    <option value="rows_desc">Tri: plus de lignes</option>
                    <option value="rows_asc">Tri: moins de lignes</option>
                    <option value="name_asc">Tri: A → Z</option>
                    <option value="name_desc">Tri: Z → A</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedOnly((v) => !v)}
                    className="text-xs px-2.5 py-1.5 rounded-full transition-colors"
                    style={{
                      background: selectedOnly ? 'var(--accent)' : 'var(--bg-panel)',
                      color: selectedOnly ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${selectedOnly ? 'var(--accent)' : 'var(--border-standard)'}`,
                    }}
                  >
                    {selectedOnly ? 'Sélection active' : 'Voir sélection'}
                  </button>
                  {(checklistQuery || productFilter !== 'all' || selectedOnly) && (
                    <button
                      onClick={() => {
                        setChecklistQuery('')
                        setProductFilter('all')
                        setSelectedOnly(false)
                      }}
                      className="text-xs px-2.5 py-1.5 rounded-full"
                      style={{ background: 'var(--bg-panel)', color: 'var(--text-quaternary)', border: '1px solid var(--border-standard)' }}
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <FilterStat icon={<Folder className="w-3.5 h-3.5" />} label="Visibles" value={filteredChecklists.length} />
                  <FilterStat icon={<Rows3 className="w-3.5 h-3.5" />} label="Lignes" value={visibleRows.toLocaleString('fr-FR')} />
                  <FilterStat
                    icon={sortMode === 'name_desc' ? <ArrowUpZA className="w-3.5 h-3.5" /> : <ArrowDownAZ className="w-3.5 h-3.5" />}
                    label="Tri"
                    value={sortMode === 'rows_desc' ? 'Dense' : sortMode === 'rows_asc' ? 'Léger' : sortMode === 'name_desc' ? 'Z-A' : sortMode === 'name_asc' ? 'A-Z' : 'Saison'}
                  />
                </div>
              </div>

              {selectedChecklistDetails.length > 0 && (
                <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Selection active</p>
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {selectedChecklistDetails.length} checklist{selectedChecklistDetails.length > 1 ? 's' : ''} · {selectedRows.toLocaleString('fr-FR')} lignes
                      </div>
                    </div>
                    <button
                      onClick={deselectAllChecklists}
                      className="text-xs px-2.5 py-1.5 rounded-full"
                      style={{ background: 'var(--bg-panel)', color: 'var(--text-quaternary)', border: '1px solid var(--border-standard)' }}
                    >
                      Tout vider
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {selectedChecklistDetails.slice(0, 6).map((cl) => {
                      const formatted = formatChecklistName(cl.checklist_name, cl.display_name)
                      return (
                        <div
                          key={cl.checklist_id}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{formatted.name}</div>
                            <div className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                              {cl.year || formatted.year || 'Inconnue'} · {cl.rows.toLocaleString('fr-FR')} lignes
                            </div>
                          </div>
                          <button
                            onClick={() => toggleChecklist(cl.checklist_id)}
                            className="px-2 py-1 rounded text-xs"
                            style={{ color: 'var(--text-quaternary)', background: 'transparent' }}
                            title="Retirer de la selection"
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                    {selectedChecklistDetails.length > 6 && (
                      <div className="text-xs px-2.5 pt-1" style={{ color: 'var(--text-quaternary)' }}>
                        +{selectedChecklistDetails.length - 6} autre{selectedChecklistDetails.length - 6 > 1 ? 's' : ''} checklist{selectedChecklistDetails.length - 6 > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {filteredChecklists.length === 0 ? (
                <div className="text-sm py-10 text-center rounded-xl" style={{ color: 'var(--text-quaternary)', border: '1px dashed var(--border-solid)' }}>
                  Aucun résultat pour les filtres courants.
                </div>
              ) : (
                <>
              {sortedYears.map((year) => {
                const yearChecklists = sortChecklists(checklistsByYear[year], sortMode)
                const yearSelectedCount = yearChecklists.filter((cl) => selectedChecklistIds.includes(cl.checklist_id)).length
                const allYearSelected = yearSelectedCount === yearChecklists.length

                const isOpen = effectiveOpenYears.has(year)
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
                        onChange={(e) => { e.stopPropagation(); toggleYear(yearChecklists) }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0 rounded w-3.5 h-3.5 ml-2"
                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                    </div>
                    {/* Checklists de l'année */}
                    {isOpen && (
                      <div className="pb-2 pt-1 px-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        {yearChecklists.map((cl) => {
                          const formatted = formatChecklistName(cl.checklist_name, cl.display_name);
                          const isSelected = selectedChecklistIds.includes(cl.checklist_id);
                          return (
                            <div
                              key={cl.checklist_id}
                              className={`group flex items-start gap-3 px-3 py-2 text-sm rounded-lg transition-colors my-0.5 ${isSelected ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'}`}
                              style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleChecklist(cl.checklist_id)}
                                className="rounded mt-1 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
                                style={{ accentColor: 'var(--accent)' }}
                              />
                              <div className="flex-1 flex flex-col justify-center cursor-pointer" onClick={() => toggleChecklist(cl.checklist_id)}>
                                <span className="font-semibold flex items-center gap-1.5">
                                  {formatted.name}
                                  {oddsChecklistIds.has(cl.checklist_id) && (
                                    <span
                                      className="flex-shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                      style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
                                      title="Feuille d'odds Topps disponible pour ce produit"
                                    >
                                      <Target className="w-2.5 h-2.5" /> odds
                                    </span>
                                  )}
                                </span>
                                {formatted.year && <span className="text-xs text-[var(--text-tertiary)]">{formatted.year}</span>}
                              </div>
                              <span className="flex-shrink-0 text-xs font-medium py-1" style={{ color: 'var(--text-quaternary)' }}>{cl.rows} items</span>
                              <button
                                onClick={(e) => { e.preventDefault(); handleDeleteChecklist(cl.checklist_id) }}
                                disabled={deletingChecklistId === cl.checklist_id}
                                className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded transition-opacity hover:text-red-400"
                                style={{ color: 'var(--text-quaternary)' }}
                                title="Supprimer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
                </>
              )}
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

      {/* Modale suppression checklist */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl p-6 w-80 shadow-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)' }}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Supprimer la checklist</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>Cette action est irréversible. Entrez le token admin pour confirmer.</p>
            <input
              type="password"
              autoFocus
              value={deleteToken}
              onChange={(e) => setDeleteToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmDeleteChecklist()}
              placeholder="Token admin..."
              className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-3"
              style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
            />
            {deleteError && <p className="text-xs text-red-400 mb-3">{deleteError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 text-sm rounded-lg"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
              >Annuler</button>
              <button
                onClick={confirmDeleteChecklist}
                disabled={!deleteToken.trim() || !!deletingChecklistId}
                className="px-3 py-1.5 text-sm rounded-lg font-semibold"
                style={{ background: deleteToken.trim() ? 'var(--accent)' : 'var(--bg-hover)', color: deleteToken.trim() ? '#fff' : 'var(--text-quaternary)' }}
              >Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function BookmarkIcon() {
  return <Save className="w-4 h-4 text-[var(--text-tertiary)]" />;
}

function FilterStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between mb-1" style={{ color: 'var(--text-quaternary)' }}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
