import { useState, useRef } from 'react'
import { useAppStore } from '../../stores/appStore'
import { smartPreview, smartConfirm } from '../../api/client'
import { Upload, Sparkles, Check, RotateCcw, Trash2 } from 'lucide-react'

type Row = { Player: string; Team: string; 'Box Type': string; Numbering: string }
type Step = 'input' | 'preview' | 'done'

export function SmartImportView() {
  const { selectedSport } = useAppStore()
  const [step, setStep] = useState<Step>('input')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checklistName, setChecklistName] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [overwrite, setOverwrite] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handlePreview() {
    if (!text.trim() && !file) return
    setLoading(true)
    setError(null)
    try {
      const res = await smartPreview(selectedSport, { text: text || undefined, file: file || undefined })
      setChecklistName(res.checklist_name)
      setRows(res.rows)
      setStep('preview')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const res = await smartConfirm({ sport_key: selectedSport, checklist_name: checklistName, rows, overwrite })
      setImportedCount(res.rows)
      setStep('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setStep('input')
    setText('')
    setFile(null)
    setRows([])
    setChecklistName('')
    setError(null)
    setOverwrite(false)
  }

  function updateRow(index: number, field: keyof Row, value: string) {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function deleteRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          Import Intelligent
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Collez n'importe quel contenu ou uploadez un fichier — Gemini s'occupe de la mise en forme.
        </p>
      </div>

      {step === 'input' && (
        <div className="space-y-4">
          {/* Zone texte */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <label className="text-sm font-semibold mb-2 block" style={{ color: 'var(--text-primary)' }}>
              Coller du texte
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Collez ici un tableau copié depuis un site, un CSV, du texte brut..."
              rows={10}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y font-mono"
              style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex items-center gap-3" style={{ color: 'var(--text-quaternary)' }}>
            <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
            <span className="text-xs font-semibold uppercase">ou</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
          </div>

          {/* Zone fichier */}
          <div
            className="rounded-xl p-6 text-center cursor-pointer transition-colors"
            style={{ background: 'var(--bg-surface)', border: '2px dashed var(--border-standard)' }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
          >
            <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--text-quaternary)' }} />
            {file ? (
              <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{file.name}</p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Glissez un fichier Excel ou CSV ici
              </p>
            )}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handlePreview}
            disabled={loading || (!text.trim() && !file)}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            style={{
              background: (!text.trim() && !file) ? 'var(--bg-hover)' : 'var(--accent)',
              color: (!text.trim() && !file) ? 'var(--text-quaternary)' : '#fff',
            }}
          >
            <Sparkles className="w-4 h-4" />
            {loading ? 'Analyse en cours...' : 'Analyser avec Gemini'}
          </button>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-quaternary)' }}>Nom de la checklist</label>
              <input
                type="text"
                value={checklistName}
                onChange={(e) => setChecklistName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <input type="checkbox" id="overwrite" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
              <label htmlFor="overwrite" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Remplacer si existant</label>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
            <div className="px-4 py-2 flex items-center justify-between" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{rows.length} lignes détectées</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Modifiez les cellules si nécessaire</span>
            </div>
            <div className="overflow-auto max-h-96">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--bg-panel)', color: 'var(--text-quaternary)' }}>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Player</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Team</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Box Type</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Numbering</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-panel)' }}>
                      {(['Player', 'Team', 'Box Type', 'Numbering'] as (keyof Row)[]).map((field) => (
                        <td key={field} className="px-2 py-1">
                          <input
                            value={row[field]}
                            onChange={(e) => updateRow(i, field, e.target.value)}
                            className="w-full bg-transparent outline-none px-1 py-0.5 rounded text-xs"
                            style={{ color: 'var(--text-primary)', border: '1px solid transparent' }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                            onBlur={(e) => e.target.style.borderColor = 'transparent'}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1">
                        <button onClick={() => deleteRow(i)} className="opacity-40 hover:opacity-100 transition-opacity text-red-400">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-xl text-sm flex items-center gap-2"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
            >
              <RotateCcw className="w-4 h-4" /> Recommencer
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || rows.length === 0 || !checklistName.trim()}
              className="flex-1 py-2 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              style={{
                background: rows.length > 0 && checklistName.trim() ? 'var(--accent)' : 'var(--bg-hover)',
                color: rows.length > 0 && checklistName.trim() ? '#fff' : 'var(--text-quaternary)',
              }}
            >
              <Check className="w-4 h-4" />
              {loading ? 'Import en cours...' : `Confirmer l'import (${rows.length} lignes)`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--accent)' }}>
            <Check className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Import réussi</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
            {importedCount} lignes importées dans <strong>{checklistName}</strong>
          </p>
          <button
            onClick={handleReset}
            className="px-6 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Nouvel import
          </button>
        </div>
      )}
    </div>
  )
}
