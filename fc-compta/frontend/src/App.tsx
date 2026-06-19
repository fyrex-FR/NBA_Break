import { useState } from 'react'
import { fetchAudit } from './api'
import type { AuditReport } from './types'
import { BreakCard } from './components/BreakCard'
import { Search, Loader2 } from 'lucide-react'

export default function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<AuditReport | null>(null)

  async function handleAudit() {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    setReport(null)
    try {
      const r = await fetchAudit(url.trim())
      setReport(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
      <header className="text-center mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">
          <span className="opacity-60">🔍</span> FC Compta
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          Vérification de breaks Voggt — grille, incohérences, marge estimée.
        </p>
      </header>

      <div className="flex gap-2 mb-8 max-w-2xl mx-auto">
        <div className="flex items-center flex-1 rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Search className="w-4 h-4 flex-shrink-0 mr-3" style={{ color: 'var(--text-3)' }} />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAudit() }}
            placeholder="URL du show Voggt (ex: https://voggt.com/fr/shows/353312)"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text)' }}
          />
        </div>
        <button
          onClick={handleAudit}
          disabled={loading || !url.trim()}
          className="px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
          style={{
            background: url.trim() && !loading ? 'var(--accent)' : 'var(--surface-2)',
            color: url.trim() && !loading ? '#fff' : 'var(--text-3)',
          }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Auditer'}
        </button>
      </div>

      {error && (
        <div className="max-w-2xl mx-auto mb-6 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {report && (
        <div>
          <div className="text-center mb-6">
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
              Show {report.show_id} — {report.breaks_count} break{report.breaks_count > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-6">
            {report.breaks.map((b) => (
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
