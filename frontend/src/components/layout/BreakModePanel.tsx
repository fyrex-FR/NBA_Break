import { useState } from 'react'
import { Link2, Loader2, ChevronRight, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import {
  fetchVoggtShow,
  fetchVoggtBreak,
  fetchChecklists,
} from '../../api/client'
import { useRunAnalysis } from '../../hooks/useRunAnalysis'
import type { VoggtBreakSummary } from '../../types'

const SPORT_EMOJI: Record<string, string> = {
  nba: '🏀', nfl: '🏈', mlb: '⚾', soccer: '⚽', tennis: '🎾', wwe: '🤼', disney: '🏰', marvel: '🦸', mma: '🥊',
}

interface BreakModePanelProps {
  onAfterLoad?: () => void
}

/** Import d'un show Voggt : URL → liste des breaks → chargement du break choisi. */
export function BreakModePanel({ onAfterLoad }: BreakModePanelProps) {
  const {
    setSport, setAvailableChecklists, setMasterKey, setSelectedChecklistIds,
    setBreakContext, setActiveView, setAnalysisData, setAnalyzedChecklistIds,
  } = useAppStore()
  const runAnalysis = useRunAnalysis()

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

      setSport(sport)
      const cl = await fetchChecklists(sport)
      setAvailableChecklists(cl.checklists)
      setMasterKey(cl.master_key)

      // On ne garde que les checklists détectées qui existent dans ce master.
      const existing = new Set(cl.checklists.map((c) => c.checklist_id))
      const ids = detail.checklist_ids.filter((id) => existing.has(id))
      setSelectedChecklistIds(ids)

      setBreakContext({ showId: showId || '', detail })
      setActiveView('🎲 État du Break')
      onAfterLoad?.()

      if (ids.length > 0 && cl.master_key) {
        await runAnalysis({ ids })
      } else {
        setAnalysisData(null)
        setAnalyzedChecklistIds([])
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
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>URL du show</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-quaternary)' }} />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFetchShow() }}
              placeholder="https://www.voggt.com/fr/show/…"
              className="ui-input pl-8"
            />
          </div>
          <button onClick={handleFetchShow} disabled={loading || !url.trim()} className="ui-btn ui-btn-primary" style={{ height: 34 }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Charger'}
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-quaternary)' }}>
          NoClim détecte les produits du break, sélectionne les checklists et lance l'analyse.
        </p>
      </div>

      {error && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)' }}>{error}</div>
      )}

      {breaks.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="ui-eyebrow">{breaks.length} break{breaks.length > 1 ? 's' : ''}</span>
            <button onClick={reset} className="ui-btn ui-btn-ghost ui-btn-sm">Réinitialiser</button>
          </div>
          {breaks.map((b) => (
            <button
              key={b.break_id}
              onClick={() => handlePickBreak(b)}
              disabled={!!loadingBreakId}
              className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl transition-colors ui-row-hover"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <span className="text-lg w-6 text-center">{SPORT_EMOJI[b.sport_guess || ''] || '🃏'}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{b.title || 'Break'}</span>
                <span className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="num">{b.available ?? '?'}/{b.total ?? '?'} spots</span>
                  {b.coverage === 'complete' && <><CheckCircle2 className="w-3 h-3" style={{ color: 'var(--success)' }} /> reconnu</>}
                  {b.coverage === 'partial' && <><AlertTriangle className="w-3 h-3" style={{ color: 'var(--warning)' }} /> {b.unmatched_products?.length ?? 0} non reconnu(s)</>}
                  {(b.coverage === 'unknown' || b.coverage === 'unmapped') && <><HelpCircle className="w-3 h-3" /> non reconnu</>}
                </span>
              </span>
              {loadingBreakId === b.break_id
                ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
                : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-quaternary)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
