import { useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { fetchAnalysis } from '../api/client'
import type { ViewName } from '../types'

/**
 * Lance l'analyse de la sélection courante et mémorise les ids analysés,
 * ce qui permet au shell de signaler une sélection modifiée non appliquée.
 */
export function useRunAnalysis() {
  return useCallback(async (opts?: { ids?: string[]; goTo?: ViewName | null }) => {
    const s = useAppStore.getState()
    const ids = opts?.ids ?? s.selectedChecklistIds
    if (ids.length === 0) return
    s.setIsAnalyzing(true)
    try {
      const data = await fetchAnalysis(s.selectedSport, ids, s.masterKey)
      s.setAnalysisData(data)
      s.setAnalyzedChecklistIds(ids)
      const next = opts?.goTo === undefined ? null : opts.goTo
      // En mode break, on reste sur la vue du break en cours.
      const stayOnBreak = !!s.breakContext && useAppStore.getState().activeView === '🎲 État du Break'
      if (next && !stayOnBreak) s.setActiveView(next)
    } catch (err) {
      console.error('Analysis failed:', err)
      s.setAnalysisData(null)
      s.setAnalyzedChecklistIds([])
    } finally {
      s.setIsAnalyzing(false)
    }
  }, [])
}

export function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}
