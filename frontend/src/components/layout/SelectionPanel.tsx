import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, ChevronDown, ChevronRight, Trash2, Target, Bookmark, Radio, UploadCloud,
  FileSpreadsheet, Play, Check, X, Wand2, Loader2, Library, Link as LinkIcon,
} from 'lucide-react'
import { useAppStore, type SelectionTab } from '../../stores/appStore'
import { fetchPresets, savePreset, deletePreset, uploadChecklist, deleteChecklist } from '../../api/client'
import { useRunAnalysis, sameIds } from '../../hooks/useRunAnalysis'
import { useOddsConfig } from '../../hooks/useOddsConfig'
import { formatChecklistName, sortChecklists, formatCount, plural, type ChecklistSort } from '../../utils/checklists'
import { Sheet, SheetHeader, Segmented, EmptyState, CheckboxMark } from '../ui/primitives'
import { BreakModePanel } from './BreakModePanel'
import type { ChecklistInfo, PresetInfo } from '../../types'

/**
 * Panneau de sélection des checklists (catalogue, presets, break Voggt, ajout).
 * Remplace l'ancienne sidebar : la sélection est un moment, pas un décor permanent.
 */
export function SelectionPanel() {
  const { selectionOpen, closeSelection, selectionTab, openSelection, selectedSport } = useAppStore()
  const sportLabel = useSportLabel(selectedSport)

  return (
    <Sheet open={selectionOpen} onClose={closeSelection} labelledBy="selection-title" width={540}>
      <SheetHeader
        id="selection-title"
        title="Sélection des checklists"
        subtitle={sportLabel}
        onClose={closeSelection}
      />
      <div className="px-5 pb-3 flex-shrink-0 overflow-x-auto no-scrollbar">
        <Segmented<SelectionTab>
          value={selectionTab}
          onChange={(t) => openSelection(t)}
          ariaLabel="Mode de sélection"
          options={[
            { value: 'catalog', label: 'Catalogue', icon: Library },
            { value: 'presets', label: 'Presets', icon: Bookmark },
            { value: 'voggt', label: 'Break Voggt', icon: Radio },
            { value: 'upload', label: 'Ajouter', icon: UploadCloud },
          ]}
        />
      </div>
      <div className="flex-1 min-h-0 flex flex-col" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {selectionTab === 'catalog' && <CatalogTab />}
        {selectionTab === 'presets' && <PresetsTab />}
        {selectionTab === 'voggt' && (
          <div className="flex-1 overflow-y-auto p-5"><BreakModePanel onAfterLoad={closeSelection} /></div>
        )}
        {selectionTab === 'upload' && <UploadTab />}
      </div>
      <SelectionFooter />
    </Sheet>
  )
}

function useSportLabel(sport: string) {
  const { data } = useQuery<{ key: string; label: string }[]>({ queryKey: ['sports'], enabled: false })
  return data?.find((s) => s.key === sport)?.label ?? sport.toUpperCase()
}

/* ── Catalogue ──────────────────────────────────────────────────────────── */

function CatalogTab() {
  const {
    availableChecklists, selectedChecklistIds, setSelectedChecklistIds, toggleChecklist, selectedSport,
  } = useAppStore()
  const { oddsChecklistIds } = useOddsConfig()
  const queryClient = useQueryClient()

  const [query, setQuery] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [productFilter, setProductFilter] = useState('all')
  const [sortMode, setSortMode] = useState<ChecklistSort>('year')
  const [openYears, setOpenYears] = useState<Set<string> | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChecklistInfo | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Focus auto uniquement avec un pointeur précis : sur mobile, ça ouvrirait le clavier.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) searchRef.current?.focus()
  }, [])

  const products = useMemo(() => Array.from(new Set(
    availableChecklists.map((c) => formatChecklistName(c.checklist_name, c.display_name).name),
  )).sort((a, b) => a.localeCompare(b)), [availableChecklists])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return availableChecklists.filter((c) => {
      if (selectedOnly && !selectedChecklistIds.includes(c.checklist_id)) return false
      const formatted = formatChecklistName(c.checklist_name, c.display_name)
      if (productFilter !== 'all' && formatted.name !== productFilter) return false
      if (!q) return true
      const haystack = [
        c.checklist_name, c.checklist_id, c.canonical_checklist_id, ...(c.legacy_checklist_ids || []),
        c.display_name, formatted.name, formatted.year, c.year,
      ].join(' ').toLowerCase()
      return q.split(/\s+/).every((token) => haystack.includes(token))
    })
  }, [availableChecklists, query, selectedOnly, productFilter, selectedChecklistIds])

  const byYear = useMemo(() => {
    const acc: Record<string, ChecklistInfo[]> = {}
    for (const c of filtered) {
      const year = c.year || 'Inconnue'
      ;(acc[year] ||= []).push(c)
    }
    return acc
  }, [filtered])
  const years = Object.keys(byYear).sort().reverse()

  const hasFilters = !!query.trim() || selectedOnly || productFilter !== 'all'
  // Par défaut : saison la plus récente + saisons contenant déjà une sélection.
  const defaultOpen = useMemo(() => {
    const set = new Set<string>()
    const allYears = Array.from(new Set(availableChecklists.map((c) => c.year || 'Inconnue'))).sort().reverse()
    if (allYears[0]) set.add(allYears[0])
    for (const c of availableChecklists) if (selectedChecklistIds.includes(c.checklist_id)) set.add(c.year || 'Inconnue')
    return set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableChecklists])
  const effectiveOpen = hasFilters ? new Set(years) : (openYears ?? defaultOpen)

  function toggleYearOpen(year: string) {
    const next = new Set(effectiveOpen)
    if (next.has(year)) next.delete(year)
    else next.add(year)
    setOpenYears(next)
  }

  function toggleYear(list: ChecklistInfo[]) {
    const ids = list.map((c) => c.checklist_id)
    const all = ids.every((id) => selectedChecklistIds.includes(id))
    setSelectedChecklistIds(all
      ? selectedChecklistIds.filter((id) => !ids.includes(id))
      : Array.from(new Set([...selectedChecklistIds, ...ids])))
  }

  const visibleIds = filtered.map((c) => c.checklist_id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedChecklistIds.includes(id))

  return (
    <>
      <div className="px-5 py-3 space-y-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-quaternary)' }} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Prizm 2024, Donruss, Topps Chrome…"
            className="ui-input pl-8 pr-8"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon" aria-label="Effacer la recherche">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="ui-select">
            <option value="all">Tous les produits</option>
            {products.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as ChecklistSort)} className="ui-select">
            <option value="year">A → Z</option>
            <option value="name_desc">Z → A</option>
            <option value="rows_desc">Plus de cartes</option>
            <option value="rows_asc">Moins de cartes</option>
          </select>
          <button onClick={() => setSelectedOnly((v) => !v)} className={`ui-chip !h-7 ${selectedOnly ? 'is-active' : ''}`}>
            {selectedOnly && <Check className="w-3 h-3" />}
            Sélectionnées <span className="num" style={{ color: 'var(--text-quaternary)' }}>{selectedChecklistIds.length}</span>
          </button>
          {hasFilters && (
            <button onClick={() => { setQuery(''); setProductFilter('all'); setSelectedOnly(false) }} className="ui-btn ui-btn-ghost ui-btn-sm">
              Réinitialiser
            </button>
          )}
          <div className="ml-auto">
            {filtered.length > 0 && !allVisibleSelected && (
              <button
                onClick={() => setSelectedChecklistIds(Array.from(new Set([...selectedChecklistIds, ...visibleIds])))}
                className="ui-btn ui-btn-ghost ui-btn-sm"
                style={{ color: 'var(--accent)' }}
              >
                Tout cocher <span className="num">({filtered.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {availableChecklists.length === 0 ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="ui-skeleton h-11" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-2">
            <EmptyState icon={Search} title="Aucune checklist ne correspond">Essaie un autre mot-clé ou réinitialise les filtres.</EmptyState>
          </div>
        ) : years.map((year) => {
          const list = sortChecklists(byYear[year], sortMode)
          const selCount = list.filter((c) => selectedChecklistIds.includes(c.checklist_id)).length
          const all = selCount === list.length
          const open = effectiveOpen.has(year)
          return (
            <section key={year} className="mb-1">
              <div
                className="sticky top-0 z-10 flex items-center gap-2 px-2 h-9 rounded-lg cursor-pointer select-none ui-row-hover"
                style={{ background: 'var(--bg-panel)' }}
                onClick={() => toggleYearOpen(year)}
              >
                <span style={{ color: 'var(--text-quaternary)' }}>
                  {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
                <span className="text-[13px] font-semibold num" style={{ color: 'var(--text-primary)' }}>{year}</span>
                <span className="text-xs num" style={{ color: selCount ? 'var(--accent)' : 'var(--text-quaternary)' }}>
                  {selCount > 0 ? `${selCount}/${list.length}` : list.length}
                </span>
                <span className="flex-1" />
                <Checkbox
                  checked={all}
                  indeterminate={selCount > 0 && !all}
                  onChange={() => toggleYear(list)}
                  label={`Tout ${year}`}
                />
              </div>
              {open && (
                <ul className="pb-1">
                  {list.map((cl) => {
                    const f = formatChecklistName(cl.checklist_name, cl.display_name)
                    const isSel = selectedChecklistIds.includes(cl.checklist_id)
                    return (
                      <li key={cl.checklist_id}>
                        <div
                          role="checkbox"
                          aria-checked={isSel}
                          tabIndex={0}
                          onClick={() => toggleChecklist(cl.checklist_id)}
                          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleChecklist(cl.checklist_id) } }}
                          className="ui-pick-row ui-row-hover group flex items-center gap-3 pl-8 pr-2 py-2 rounded-lg cursor-pointer"
                        >
                          <CheckboxMark checked={isSel} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{f.name}</div>
                            <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>
                              <span className="num">{formatCount(cl.rows)} cartes</span>
                              {oddsChecklistIds.has(cl.checklist_id) && (
                                <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }} title="Feuille d'odds Topps disponible">
                                  <Target className="w-3 h-3" /> odds
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(cl) }}
                            className="hidden sm:inline-flex sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 ui-btn ui-btn-ghost ui-btn-danger ui-btn-sm ui-btn-icon"
                            title="Supprimer (admin)"
                            aria-label={`Supprimer ${f.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {deleteTarget && (
        <DeleteChecklistDialog
          checklist={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setSelectedChecklistIds(selectedChecklistIds.filter((id) => id !== deleteTarget.checklist_id))
            queryClient.invalidateQueries({ queryKey: ['checklists', selectedSport] })
            setDeleteTarget(null)
          }}
        />
      )}
    </>
  )
}

function DeleteChecklistDialog({ checklist, onClose, onDeleted }: { checklist: ChecklistInfo; onClose: () => void; onDeleted: () => void }) {
  const { selectedSport } = useAppStore()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const name = formatChecklistName(checklist.checklist_name, checklist.display_name)

  async function confirm() {
    if (!token.trim()) return
    setBusy(true)
    setError(null)
    try {
      await deleteChecklist(selectedSport, checklist.checklist_id, token)
      onDeleted()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur'
      setError(msg.includes('401') || msg.includes('Token') ? 'Token invalide.' : msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'var(--bg-overlay)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-pop)', animation: 'popIn 0.14s ease-out' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Supprimer « {name.name} » ?</h3>
        <p className="text-xs mt-1 mb-4" style={{ color: 'var(--text-tertiary)' }}>
          {checklist.year} · {formatCount(checklist.rows)} cartes. Action irréversible, réservée aux admins.
        </p>
        <input
          type="password"
          autoFocus
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirm()}
          placeholder="Token admin"
          className="ui-input mb-3"
        />
        {error && <p className="text-xs mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="ui-btn ui-btn-secondary">Annuler</button>
          <button
            onClick={confirm}
            disabled={!token.trim() || busy}
            className="ui-btn"
            style={{ background: 'var(--danger)', color: '#fff', fontWeight: 600 }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Presets ────────────────────────────────────────────────────────────── */

function PresetsTab() {
  const { selectedSport, selectedChecklistIds, setSelectedChecklistIds, openSelection, closeSelection } = useAppStore()
  const queryClient = useQueryClient()
  const runAnalysis = useRunAnalysis()
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const { data } = useQuery({
    queryKey: ['presets', selectedSport],
    queryFn: () => fetchPresets(selectedSport),
    enabled: !!selectedSport,
  })
  const presets: PresetInfo[] = data?.presets || []

  async function save() {
    if (!name.trim() || selectedChecklistIds.length === 0) return
    try {
      await savePreset(selectedSport, name.trim(), selectedChecklistIds)
      setMsg({ ok: true, text: `« ${name.trim()} » enregistré` })
      setName('')
      queryClient.invalidateQueries({ queryKey: ['presets', selectedSport] })
    } catch {
      setMsg({ ok: false, text: "Impossible d'enregistrer le preset" })
    }
    setTimeout(() => setMsg(null), 2500)
  }

  async function remove(presetName: string) {
    try {
      await deletePreset(selectedSport, presetName)
      queryClient.invalidateQueries({ queryKey: ['presets', selectedSport] })
    } catch (err) {
      console.error('Delete preset failed:', err)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
          Enregistrer la sélection actuelle <span className="num" style={{ color: 'var(--text-quaternary)' }}>({selectedChecklistIds.length})</span>
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="Ex. Prizm 2023-25"
            className="ui-input"
            disabled={selectedChecklistIds.length === 0}
          />
          <button onClick={save} disabled={!name.trim() || selectedChecklistIds.length === 0} className="ui-btn ui-btn-primary" style={{ height: 34 }}>
            Enregistrer
          </button>
        </div>
        {selectedChecklistIds.length === 0 && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-quaternary)' }}>Coche d'abord des checklists dans le catalogue.</p>
        )}
        {msg && <p className="text-xs mt-2 font-medium" style={{ color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>{msg.text}</p>}
      </div>

      <div>
        <div className="ui-eyebrow mb-2">Presets enregistrés</div>
        {presets.length === 0 ? (
          <EmptyState icon={Bookmark} title="Aucun preset pour ce sport">Enregistre une sélection pour la retrouver en un clic.</EmptyState>
        ) : (
          <ul className="space-y-1.5">
            {presets.map((p) => (
              <li key={p.name} className="group flex items-center gap-3 pl-3 pr-1.5 py-2 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <Bookmark className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                  <div className="text-xs num" style={{ color: 'var(--text-tertiary)' }}>{plural(p.checklist_ids.length, 'checklist')}</div>
                </div>
                <button onClick={() => remove(p.name)} className="sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 ui-btn ui-btn-ghost ui-btn-danger ui-btn-sm ui-btn-icon" aria-label={`Supprimer ${p.name}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { setSelectedChecklistIds(p.checklist_ids); openSelection('catalog') }} className="ui-btn ui-btn-ghost ui-btn-sm">
                  Modifier
                </button>
                <button
                  onClick={() => { setSelectedChecklistIds(p.checklist_ids); closeSelection(); runAnalysis({ ids: p.checklist_ids, goTo: '🌍 Vue Globale' }) }}
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                >
                  <Play className="w-3 h-3" /> Analyser
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ── Ajout de checklist ─────────────────────────────────────────────────── */

function UploadTab() {
  const { selectedSport, setActiveView, closeSelection } = useAppStore()
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function upload() {
    if (!file) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await uploadChecklist(file, selectedSport, overwrite)
      setStatus({ ok: true, msg: `${res.checklist_id} ajoutée · ${formatCount(res.rows)} lignes` })
      setFile(null)
      setOverwrite(false)
      queryClient.invalidateQueries({ queryKey: ['checklists', selectedSport] })
    } catch (err: unknown) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : 'Erreur upload' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setStatus(null) } }}
        className="flex flex-col items-center justify-center gap-2 rounded-2xl py-10 px-4 cursor-pointer text-center transition-colors"
        style={{
          border: `1.5px dashed ${file || dragging ? 'var(--accent)' : 'var(--border-strong)'}`,
          background: dragging ? 'var(--accent-soft)' : 'var(--bg-surface)',
        }}
      >
        {file ? <FileSpreadsheet className="w-6 h-6" style={{ color: 'var(--accent)' }} /> : <UploadCloud className="w-6 h-6" style={{ color: 'var(--text-tertiary)' }} />}
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{file ? file.name : 'Dépose un fichier .xlsx ou clique pour parcourir'}</span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Format du template NoClim · une ligne par carte</span>
        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setStatus(null) }} />
      </label>

      <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
        Remplacer la checklist si elle existe déjà
      </label>

      <button onClick={upload} disabled={!file || busy} className="ui-btn ui-btn-primary ui-btn-lg w-full">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi…</> : 'Ajouter la checklist'}
      </button>

      {status && (
        <div className="text-sm px-3 py-2 rounded-lg" style={{
          background: `color-mix(in srgb, ${status.ok ? 'var(--success)' : 'var(--danger)'} 10%, transparent)`,
          color: status.ok ? 'var(--success)' : 'var(--danger)',
        }}>
          {status.msg}
        </div>
      )}

      <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <Wand2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
        <div className="text-sm">
          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>Tu n'as qu'un PDF ou une capture ?</div>
          <p className="text-xs mt-0.5 mb-2" style={{ color: 'var(--text-tertiary)' }}>L'import IA lit la checklist et génère le fichier pour toi.</p>
          <button onClick={() => { setActiveView('📥 Import Intelligent'); closeSelection() }} className="ui-btn ui-btn-secondary ui-btn-sm">
            Ouvrir l'import IA
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Pied du panneau : récap + action ───────────────────────────────────── */

function SelectionFooter() {
  const {
    selectedChecklistIds, availableChecklists, analyzedChecklistIds, analysisData,
    deselectAllChecklists, closeSelection, isAnalyzing,
  } = useAppStore()
  const runAnalysis = useRunAnalysis()
  const [copied, setCopied] = useState(false)

  const rows = availableChecklists
    .filter((c) => selectedChecklistIds.includes(c.checklist_id))
    .reduce((sum, c) => sum + c.rows, 0)
  const count = selectedChecklistIds.length
  const upToDate = !!analysisData && sameIds(selectedChecklistIds, analyzedChecklistIds)

  return (
    <div className="flex-shrink-0 px-5 py-4 flex items-center gap-3" style={{ borderTop: '1px solid var(--border-standard)', background: 'var(--bg-panel)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold num" style={{ color: 'var(--text-primary)' }}>
          {count === 0 ? 'Aucune checklist' : plural(count, 'checklist')}
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {count > 0 ? <span className="num">{formatCount(rows)} cartes</span> : <span>Coche au moins une checklist</span>}
          {count > 0 && (
            <>
              <button
                onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
                className="inline-flex items-center gap-1 hover:underline"
                style={{ color: copied ? 'var(--success)' : 'var(--text-tertiary)' }}
              >
                {copied ? <Check className="w-3 h-3" /> : <LinkIcon className="w-3 h-3" />} {copied ? 'Lien copié' : 'Partager'}
              </button>
            </>
          )}
        </div>
      </div>
      {count > 0 && (
        <button onClick={deselectAllChecklists} className="ui-btn ui-btn-ghost ui-btn-danger ui-btn-lg !px-3" title="Décocher toutes les checklists">
          <Trash2 className="w-4 h-4" /> Vider
        </button>
      )}
      {upToDate ? (
        <button onClick={closeSelection} className="ui-btn ui-btn-secondary ui-btn-lg">
          <Check className="w-4 h-4" style={{ color: 'var(--success)' }} /> À jour
        </button>
      ) : (
        <button
          onClick={() => { closeSelection(); runAnalysis({ goTo: analysisData ? null : '🌍 Vue Globale' }) }}
          disabled={count === 0 || isAnalyzing}
          className="ui-btn ui-btn-primary ui-btn-lg"
        >
          {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
          {analysisData ? 'Mettre à jour' : 'Analyser'}
        </button>
      )}
    </div>
  )
}

/* ── Checkbox ───────────────────────────────────────────────────────────── */

function Checkbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange() }}
      className="p-1 -m-1 rounded"
    >
      <CheckboxMark checked={checked} indeterminate={indeterminate} />
    </button>
  )
}
