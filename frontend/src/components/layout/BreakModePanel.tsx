import { useState } from 'react'
import { Link2, Loader2, X, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import {
  fetchVoggtShow,
  fetchVoggtBreak,
  fetchChecklists,
  fetchAnalysis,
} from '../../api/client'
import type { VoggtBreakSummary } from '../../types'

const SPORT_EMOJI: Record<string, string> = {
  nba: '🏀', nfl: '🏈', mlb: '⚾', soccer: '⚽', tennis: '🎾', wwe: '🤼', disney: '🏰',
}

interface BreakModePanelProps {
  onAfterLoad?: () => void
}

export function BreakModePanel({ onAfterLoad }: BreakModePanelProps) {
  const {
    setSport, setAvailableChecklists, setMasterKey, setSelectedChecklistIds,
    setBreakContext, breakContext, clearBreakContext,
    setActiveView, setAnalysisData, setIsAnalyzing,
  } = useAppStore()

  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingBreakId, setLoadingBreakId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showId, setShowId] = useState<string | null>(null)
  const [breaks, setBreaks] = useState<VoggtBreakSummary[]>([])

  async function handleFetchShow() {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    setBreaks([])
    try {
      const res = await fetchVoggtShow(url.trim())
      setShowId(res.show_id)
      setBreaks(res.breaks)
      if (res.breaks.length === 0) setError('Aucun break trouvé pour ce show.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la récupération du show.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePickBreak(b: VoggtBreakSummary) {
    setLoadingBreakId(b.break_id)
    setError(null)
    try {
      const detail = await fetchVoggtBreak(b.break_id, showId)
      const sport = detail.sport || b.sport_guess || useAppStore.getState().selectedSport

      // Switch sport (resets selection + analysis), then load its catalog.
      setSport(sport)
      const cl = await fetchChecklists(sport)
      setAvailableChecklists(cl.checklists)
      setMasterKey(cl.master_key)

      // Keep only detected checklists that actually exist in this master.
      const existing = new Set(cl.checklists.map((c) => c.checklist_id))
      const ids = detail.checklist_ids.filter((id) => existing.has(id))
      setSelectedChecklistIds(ids)

      setBreakContext({ showId: showId || '', detail })
      setActiveView('🎲 État du Break')
      onAfterLoad?.()

      if (ids.length > 0 && cl.master_key) {
        setIsAnalyzing(true)
        try {
          const data = await fetchAnalysis(sport, ids, cl.master_key)
          setAnalysisData(data)
        } catch {
          setAnalysisData(null)
        } finally {
          setIsAnalyzing(false)
        }
      } else {
        setAnalysisData(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement du break.')
    } finally {
      setLoadingBreakId(null)
    }
  }

  function reset() {
    setBreaks([])
    setShowId(null)
    setUrl('')
    setError(null)
  }

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-sm font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        <span className="text-base">🎲</span>
        <span>Mode Break (Voggt)</span>
        <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${open ? 'rotate-90' : ''}`} style={{ color: 'var(--text-tertiary)' }} />
      </button>

      {breakContext && (
        <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
          <span className="truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
            🎟️ {breakContext.detail.title || 'Break actif'}
          </span>
          <button onClick={() => { setActiveView('🎲 État du Break'); onAfterLoad?.() }} className="font-medium" style={{ color: 'var(--accent)' }}>Voir</button>
          <button onClick={clearBreakContext} title="Quitter" style={{ color: 'var(--text-quaternary)' }}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {open && (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <div className="flex items-center flex-1 rounded-lg px-2" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-standard)' }}>
              <Link2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleFetchShow() }}
                placeholder="URL du show Voggt"
                className="flex-1 bg-transparent outline-none text-xs py-2 px-1.5"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
            <button
              onClick={handleFetchShow}
              disabled={loading || !url.trim()}
              className="px-3 rounded-lg text-xs font-semibold flex items-center justify-center"
              style={{ background: url.trim() && !loading ? 'var(--accent)' : 'var(--bg-hover)', color: url.trim() && !loading ? '#fff' : 'var(--text-quaternary)' }}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'OK'}
            </button>
          </div>

          {error && (
            <div className="text-xs px-2 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</div>
          )}

          {breaks.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-quaternary)' }}>
                  {breaks.length} break{breaks.length > 1 ? 's' : ''}
                </span>
                <button onClick={reset} className="text-[10px]" style={{ color: 'var(--text-quaternary)' }}>Réinitialiser</button>
              </div>
              {breaks.map((b) => (
                <button
                  key={b.break_id}
                  onClick={() => handlePickBreak(b)}
                  disabled={!!loadingBreakId}
                  className="w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg transition-colors"
                  style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
                >
                  <span className="text-sm">{SPORT_EMOJI[b.sport_guess || ''] || '🃏'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{b.title || 'Break'}</span>
                    <span className="block text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      {b.available ?? '?'}/{b.total ?? '?'} spots
                      {b.coverage === 'complete' && ' · ✅ reconnu'}
                      {b.coverage === 'partial' && ' · ⚠️ partiel'}
                      {(b.coverage === 'unknown' || b.coverage === 'unmapped') && ' · ❔ non reconnu'}
                    </span>
                  </span>
                  {loadingBreakId === b.break_id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent)' }} />
                    : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-quaternary)' }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
