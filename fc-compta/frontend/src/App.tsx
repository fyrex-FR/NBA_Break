import { useState } from 'react'
import { fetchAudit } from './api'
import type { AuditReport, BreakReport } from './types'
import { BreakCard } from './components/BreakCard'
import { CompareView } from './components/CompareView'
import { Search, Loader2, GitCompare, Plus, X, CheckCircle } from 'lucide-react'

export default function App() {
  const [urlA, setUrlA] = useState('')
  const [urlB, setUrlB] = useState('')
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)
  const [errorA, setErrorA] = useState<string | null>(null)
  const [errorB, setErrorB] = useState<string | null>(null)
  const [reportA, setReportA] = useState<AuditReport | null>(null)
  const [reportB, setReportB] = useState<AuditReport | null>(null)
  const [showCompareInput, setShowCompareInput] = useState(false)
  const [selectedA, setSelectedA] = useState<BreakReport | null>(null)
  const [selectedB, setSelectedB] = useState<BreakReport | null>(null)

  async function handleAuditA() {
    if (!urlA.trim()) return
    setLoadingA(true); setErrorA(null); setReportA(null); setSelectedA(null)
    try {
      const r = await fetchAudit(urlA.trim())
      setReportA(r)
      const valid = r.breaks.filter(b => !b.error)
      if (valid.length === 1) setSelectedA(valid[0])
    } catch (err) {
      setErrorA(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoadingA(false)
    }
  }

  async function handleAuditB() {
    if (!urlB.trim()) return
    setLoadingB(true); setErrorB(null); setReportB(null); setSelectedB(null)
    try {
      const r = await fetchAudit(urlB.trim())
      setReportB(r)
      const valid = r.breaks.filter(b => !b.error)
      if (valid.length === 1) {
        setSelectedB(valid[0])
      } else if (valid.length > 1 && selectedA) {
        const aWords = new Set(selectedA.title.toLowerCase().split(/\s+/).filter(w => w.length > 3))
        let bestMatch = valid[0]
        let bestScore = 0
        for (const b of valid) {
          const bWords = b.title.toLowerCase().split(/\s+/).filter(w => w.length > 3)
          const score = bWords.filter(w => aWords.has(w)).length
          if (score > bestScore) { bestScore = score; bestMatch = b }
        }
        if (bestScore > 0) setSelectedB(bestMatch)
      }
    } catch (err) {
      setErrorB(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoadingB(false)
    }
  }

  function closeCompare() {
    setShowCompareInput(false)
    setReportB(null)
    setUrlB('')
    setSelectedA(null)
    setSelectedB(null)
    setErrorB(null)
  }

  const isCompareMode = showCompareInput || reportB !== null
  const isCompareReady = selectedA !== null && selectedB !== null

  return (
    <div className="min-h-screen px-4 py-8 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <header className="flex flex-col items-center mb-10 gap-3">
        <img src="/logo.png" alt="FC Compta" className="h-24" />
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          Vérification de breaks Voggt — grille, incohérences, marge estimée.
        </p>
      </header>

      {/* ── URL inputs ── */}
      <div className="max-w-3xl mx-auto mb-8 space-y-2">
        <div className="flex gap-2">
          <div className="flex items-center flex-1 rounded-xl px-4 py-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Search className="w-4 h-4 flex-shrink-0 mr-3" style={{ color: 'var(--text-3)' }} />
            <input
              value={urlA}
              onChange={(e) => setUrlA(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAuditA() }}
              placeholder="URL du show Voggt (ex: https://voggt.com/fr/shows/353312)"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--text)' }}
            />
          </div>
          <button
            onClick={handleAuditA}
            disabled={loadingA || !urlA.trim()}
            className="px-5 py-3 rounded-xl text-sm font-bold transition-colors"
            style={{
              background: urlA.trim() && !loadingA ? 'var(--accent)' : 'var(--surface-2)',
              color: urlA.trim() && !loadingA ? '#fff' : 'var(--text-3)',
            }}
          >
            {loadingA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Auditer'}
          </button>
        </div>

        {isCompareMode ? (
          <div className="flex gap-2">
            <div className="flex items-center flex-1 rounded-xl px-4 py-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--blue-border)' }}>
              <GitCompare className="w-4 h-4 flex-shrink-0 mr-3" style={{ color: 'var(--blue)' }} />
              <input
                value={urlB}
                onChange={(e) => setUrlB(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAuditB() }}
                placeholder="URL du 2e show pour comparer"
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text)' }}
              />
            </div>
            <button
              onClick={handleAuditB}
              disabled={loadingB || !urlB.trim()}
              className="px-5 py-3 rounded-xl text-sm font-bold transition-colors"
              style={{
                background: urlB.trim() && !loadingB ? 'var(--blue)' : 'var(--surface-2)',
                color: urlB.trim() && !loadingB ? '#fff' : 'var(--text-3)',
              }}
            >
              {loadingB ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go'}
            </button>
            <button
              onClick={closeCompare}
              className="px-3 py-3 rounded-xl"
              style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
              title="Fermer la comparaison"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : reportA && (
          <div className="flex justify-center">
            <button
              onClick={() => setShowCompareInput(true)}
              className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg transition-colors"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Comparer avec un autre show
            </button>
          </div>
        )}
      </div>

      {/* ── Errors ── */}
      {errorA && <ErrorBanner msg={errorA} />}
      {errorB && <ErrorBanner msg={errorB} />}

      {/* ── Compare view ── */}
      {isCompareReady && (
        <div className="mb-8">
          <CompareView
            breakA={selectedA!}
            breakB={selectedB!}
            sellerA={reportA?.seller ?? null}
            sellerB={reportB?.seller ?? null}
            onClose={() => { setSelectedA(null); setSelectedB(null) }}
          />
        </div>
      )}

      {/* ── Breaks display ── */}
      {isCompareMode && (reportA || reportB) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BreakColumn
            report={reportA}
            label="A"
            color="var(--accent)"
            selected={selectedA}
            onSelect={setSelectedA}
          />
          <BreakColumn
            report={reportB}
            label="B"
            color="var(--blue)"
            selected={selectedB}
            onSelect={setSelectedB}
          />
        </div>
      ) : reportA && (
        <div>
          <div className="flex justify-center mb-6">
            <span className="text-xs px-4 py-1.5 rounded-full font-semibold"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              {reportA.seller && (
                <span className="font-bold" style={{ color: 'var(--text)' }}>{reportA.seller}</span>
              )}
              {reportA.seller && ' — '}
              {reportA.breaks_count} break{reportA.breaks_count > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-6 max-w-3xl mx-auto">
            {reportA.breaks.map((b) => (
              <BreakCard key={b.break_id} data={b} />
            ))}
          </div>
        </div>
      )}

      <footer className="text-center mt-16 text-xs" style={{ color: 'var(--text-3)' }}>
        FC Compta — Aucune donnée stockée. Tout est récupéré en direct depuis Voggt.
      </footer>
    </div>
  )
}

function BreakColumn({
  report, label, color, selected, onSelect,
}: {
  report: AuditReport | null; label: string; color: string
  selected: BreakReport | null; onSelect: (b: BreakReport) => void
}) {
  if (!report) return <div />
  return (
    <div>
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest"
          style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
          {label}
        </span>
        {report.seller && (
          <span className="text-sm font-bold" style={{ color }}>{report.seller}</span>
        )}
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          — {report.breaks_count} break{report.breaks_count > 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-4">
        {report.breaks.map((b) => (
          <div key={b.break_id}>
            <BreakCard data={b} />
            {!b.error && (
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => onSelect(b)}
                  className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition-colors"
                  style={{
                    background: selected?.break_id === b.break_id
                      ? `color-mix(in srgb, ${color} 20%, transparent)`
                      : 'var(--surface-2)',
                    color: selected?.break_id === b.break_id ? color : 'var(--text-3)',
                    border: `1px solid ${selected?.break_id === b.break_id ? color + '40' : 'var(--border)'}`,
                  }}
                >
                  {selected?.break_id === b.break_id ? (
                    <><CheckCircle className="w-3 h-3" /> Sélectionné</>
                  ) : (
                    <><GitCompare className="w-3 h-3" /> Comparer</>
                  )}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="max-w-3xl mx-auto mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
      style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red-border)' }}>
      {msg}
    </div>
  )
}
