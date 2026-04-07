import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { fetchDetection, saveOverrides, type CardTypeCandidate } from '../../api/client'

export function DetectionView() {
  const { selectedSport, selectedChecklistIds, masterKey } = useAppStore()

  const [candidates, setCandidates] = useState<CardTypeCandidate[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [textFilter, setTextFilter] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])

  // Track overrides per normalized box type
  const [autoSet, setAutoSet] = useState<Set<string>>(new Set())
  const [caseSet, setCaseSet] = useState<Set<string>>(new Set())

  // Load candidates
  useEffect(() => {
    if (selectedChecklistIds.length === 0) return
    setLoading(true)
    fetchDetection(selectedSport, selectedChecklistIds, masterKey)
      .then((data) => {
        setCandidates(data.candidates)
        setFiles(data.files)
        setSelectedFiles(data.files)
        // Init sets from current overrides
        const auto = new Set<string>()
        const cas = new Set<string>()
        for (const c of data.candidates) {
          if (c.is_auto) auto.add(c.norm)
          if (c.is_case) cas.add(c.norm)
        }
        setAutoSet(auto)
        setCaseSet(cas)
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [selectedSport, selectedChecklistIds, masterKey])

  // Filtered candidates
  const filtered = useMemo(() => {
    let list = candidates
    if (selectedFiles.length < files.length) {
      list = list.filter((c) => selectedFiles.includes(c.file))
    }
    if (textFilter.trim()) {
      const q = textFilter.trim().toLowerCase()
      list = list.filter((c) => c.box_type.toLowerCase().includes(q))
    }
    return list
  }, [candidates, selectedFiles, textFilter, files.length])

  // Group by file
  const groupedByFile = useMemo(() => {
    const map = new Map<string, CardTypeCandidate[]>()
    for (const c of filtered) {
      const arr = map.get(c.file) || []
      arr.push(c)
      map.set(c.file, arr)
    }
    return map
  }, [filtered])

  function toggleAuto(norm: string, boxType: string) {
    setAutoSet((prev) => {
      const next = new Set(prev)
      if (next.has(norm)) next.delete(norm)
      else next.add(norm)
      return next
    })
  }

  function toggleCase(norm: string, boxType: string) {
    setCaseSet((prev) => {
      const next = new Set(prev)
      if (next.has(norm)) next.delete(norm)
      else next.add(norm)
      return next
    })
  }

  // Resolve box_type labels from norm keys
  function resolveLabels(normSet: Set<string>): string[] {
    const normToLabel = new Map<string, string>()
    for (const c of candidates) {
      if (!normToLabel.has(c.norm)) normToLabel.set(c.norm, c.box_type)
    }
    return Array.from(normSet).map((n) => normToLabel.get(n) || n)
  }

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    try {
      const result = await saveOverrides(
        selectedSport,
        resolveLabels(autoSet),
        resolveLabels(caseSet),
      )
      setMsg(`Sauvegardé : ${result.auto_mem_count} Auto/Mem, ${result.case_hit_count} Case Hit`)
      setTimeout(() => setMsg(null), 3000)
    } catch (err: any) {
      setMsg(`Erreur : ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const autoCount = autoSet.size
  const caseCount = caseSet.size
  const overlapCount = [...autoSet].filter((n) => caseSet.has(n)).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="text-3xl mb-3 animate-pulse">🧪</div>
          <p style={{ color: 'var(--text-tertiary)' }}>Chargement des card types...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-medium mb-1">🧪 Détection Auto/Mem + Case Hit</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Coche Auto/Mem et/ou Case Hit pour chaque Card Type, puis enregistre.
      </p>

      {candidates.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          Aucun Card Type à corriger.
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Filtrer les Card Type..."
              className="flex-1 min-w-[200px] rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
            />
            <select
              multiple
              value={selectedFiles}
              onChange={(e) => setSelectedFiles(Array.from(e.target.selectedOptions, (o) => o.value))}
              className="rounded-lg px-3 py-2 text-xs max-h-20"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)' }}
            >
              {files.map((f) => (
                <option key={f} value={f}>{f.replace('.parquet', '')}</option>
              ))}
            </select>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span>💎 {autoCount} Auto/Mem</span>
            <span>✨ {caseCount} Case Hit</span>
            {overlapCount > 0 && (
              <span style={{ color: '#eab308' }}>⚠ {overlapCount} en doublon (priorité Case Hit)</span>
            )}
            <span>{filtered.length} card types affichés</span>
          </div>

          {/* Card types grouped by file */}
          <div className="space-y-3 mb-6">
            {Array.from(groupedByFile.entries()).map(([file, items]) => (
              <details key={file} className="rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <summary
                  className="px-4 py-2.5 cursor-pointer text-sm font-medium flex items-center justify-between"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>{file.replace('.parquet', '')}</span>
                  <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{items.length} types</span>
                </summary>
                <div className="px-4 pb-3">
                  {/* Header row */}
                  <div className="flex items-center gap-2 py-1.5 text-xs font-medium" style={{ color: 'var(--text-quaternary)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="flex-1">Card Type</div>
                    <div className="w-14 text-center">Hits</div>
                    <div className="w-20 text-center">Auto/Mem</div>
                    <div className="w-20 text-center">Case Hit</div>
                  </div>
                  {items.map((item) => (
                    <div
                      key={`${item.file}||${item.box_type}`}
                      className="flex items-center gap-2 py-1.5 text-sm"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <div className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {item.box_type}
                      </div>
                      <div className="w-14 text-center text-xs" style={{ color: 'var(--text-quaternary)' }}>
                        {item.hits}
                      </div>
                      <div className="w-20 text-center">
                        <input
                          type="checkbox"
                          checked={autoSet.has(item.norm)}
                          onChange={() => toggleAuto(item.norm, item.box_type)}
                          style={{ accentColor: '#3b82f6' }}
                        />
                      </div>
                      <div className="w-20 text-center">
                        <input
                          type="checkbox"
                          checked={caseSet.has(item.norm)}
                          onChange={() => toggleCase(item.norm, item.box_type)}
                          style={{ accentColor: '#eab308' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer la sélection'}
            </button>
            {msg && (
              <span className="text-sm" style={{ color: msg.startsWith('Erreur') ? '#ef4444' : 'var(--accent)' }}>
                {msg}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
