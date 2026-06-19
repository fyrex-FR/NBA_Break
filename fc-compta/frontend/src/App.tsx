import { useState } from 'react'
import { fetchAudit } from './api'
import type { AuditReport, BreakReport } from './types'
import { BreakCard } from './components/BreakCard'
import { CompareView } from './components/CompareView'
import { Search, Loader2, GitCompare } from 'lucide-react'

export default function App() {
  const [urlA, setUrlA] = useState('')
  const [urlB, setUrlB] = useState('')
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)
  const [errorA, setErrorA] = useState<string | null>(null)
  const [errorB, setErrorB] = useState<string | null>(null)
  const [reportA, setReportA] = useState<AuditReport | null>(null)
  const [reportB, setReportB] = useState<AuditReport | null>(null)
  const [selectedA, setSelectedA] = useState<BreakReport | null>(null)
  const [selectedB, setSelectedB] = useState<BreakReport | null>(null)

  async function handleAuditA() {
    if (!urlA.trim()) return
    setLoadingA(true); setErrorA(null); setReportA(null); setSelectedA(null)
    try { setReportA(await fetchAudit(urlA.trim())) }
    catch (err) { setErrorA(err instanceof Error ? err.message : 'Erreur') }
    finally { setLoadingA(false) }
  }

  async function handleAuditB() {
    if (!urlB.trim()) return
    setLoadingB(true); setErrorB(null); setReportB(null); setSelectedB(null)
    try { setReportB(await fetchAudit(urlB.trim())) }
    catch (err) { setErrorB(err instanceof Error ? err.message : 'Erreur') }
    finally { setLoadingB(false) }
  }

  const isCompareReady = selectedA !== null && selectedB !== null

  return (
    <div className="min-h-screen px-4 py-8 max-w-6xl mx-auto">
      <header className="text-center mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">
          <span className="opacity-60">🔍</span> FC Compta
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          Vérification de breaks Voggt — grille, incohérences, marge estimée.
        </p>
      </header>

      {/* Two URL inputs side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <UrlInput
          label="Show A"
          value={urlA}
          onChange={setUrlA}
          onSubmit={handleAuditA}
          loading={loadingA}
          color="var(--accent)"
        />
        <UrlInput
          label="Show B"
          value={urlB}
          onChange={setUrlB}
          onSubmit={handleAuditB}
          loading={loadingB}
          color="#3b82f6"
        />
      </div>

      {/* Errors */}
      {errorA && <ErrorBanner msg={errorA} />}
      {errorB && <ErrorBanner msg={errorB} />}

      {/* Compare view */}
      {isCompareReady && (
        <div className="mb-8">
          <CompareView
            breakA={selectedA!}
            breakB={selectedB!}
            onClose={() => { setSelectedA(null); setSelectedB(null) }}
          />
        </div>
      )}

      {/* Two columns of breaks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column A */}
        <div>
          {reportA && (
            <>
              <div className="text-center mb-4">
                <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(249,115,22,0.1)', color: 'var(--accent)' }}>
                  Show A — {reportA.breaks_count} break{reportA.breaks_count > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-4">
                {reportA.breaks.map((b) => (
                  <div key={b.break_id}>
                    <BreakCard data={b} />
                    {!b.error && (
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => setSelectedA(b)}
                          className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                          style={{
                            background: selectedA?.break_id === b.break_id ? 'rgba(249,115,22,0.2)' : 'var(--surface-2)',
                            color: selectedA?.break_id === b.break_id ? 'var(--accent)' : 'var(--text-2)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <GitCompare className="w-3 h-3" />
                          {selectedA?.break_id === b.break_id ? 'Sélectionné A' : 'Sélectionner A'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Column B */}
        <div>
          {reportB && (
            <>
              <div className="text-center mb-4">
                <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                  Show B — {reportB.breaks_count} break{reportB.breaks_count > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-4">
                {reportB.breaks.map((b) => (
                  <div key={b.break_id}>
                    <BreakCard data={b} />
                    {!b.error && (
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => setSelectedB(b)}
                          className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                          style={{
                            background: selectedB?.break_id === b.break_id ? 'rgba(59,130,246,0.2)' : 'var(--surface-2)',
                            color: selectedB?.break_id === b.break_id ? '#3b82f6' : 'var(--text-2)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <GitCompare className="w-3 h-3" />
                          {selectedB?.break_id === b.break_id ? 'Sélectionné B' : 'Sélectionner B'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="text-center mt-16 text-xs" style={{ color: 'var(--text-3)' }}>
        FC Compta — Aucune donnée stockée. Tout est récupéré en direct depuis Voggt.
      </footer>
    </div>
  )
}

function UrlInput({ label, value, onChange, onSubmit, loading, color }: {
  label: string; value: string; onChange: (v: string) => void; onSubmit: () => void; loading: boolean; color: string
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color }}>{label}</div>
      <div className="flex gap-2">
        <div className="flex items-center flex-1 rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Search className="w-4 h-4 flex-shrink-0 mr-3" style={{ color: 'var(--text-3)' }} />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
            placeholder="URL du show Voggt"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text)' }}
          />
        </div>
        <button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
          style={{
            background: value.trim() && !loading ? color : 'var(--surface-2)',
            color: value.trim() && !loading ? '#fff' : 'var(--text-3)',
          }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go'}
        </button>
      </div>
    </div>
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="max-w-2xl mx-auto mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>
      {msg}
    </div>
  )
}
