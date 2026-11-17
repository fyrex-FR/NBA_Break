import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { fetchAnalysis } from '../api/client'
import type { AnalyzeResponse, ViewName } from '../types'

/*
 * L'analyse n'est plus une étape : elle suit les collections ouvertes.
 * - une seule requête vit à la fois, la dernière demandée gagne ;
 * - les trois derniers périmètres restent en mémoire, revenir à l'un d'eux est instantané.
 */
let seq = 0
let inflightKey: string | null = null
const CACHE_SIZE = 3
const cache = new Map<string, AnalyzeResponse>()

function keyOf(sport: string, ids: string[]) {
  return `${sport}:${[...ids].sort().join('|')}`
}

/** Lance l'analyse des collections données (ou ouvertes). Renvoie false en cas d'échec. */
export function useRunAnalysis() {
  return useCallback(async (opts?: { ids?: string[]; goTo?: ViewName | null }): Promise<boolean> => {
    const s = useAppStore.getState()
    const ids = opts?.ids ?? s.selectedChecklistIds
    if (ids.length === 0) return false
    const key = keyOf(s.selectedSport, ids)
    const go = () => {
      const next = opts?.goTo ?? null
      // En mode break, on reste sur la vue du break en cours.
      const stayOnBreak = !!s.breakContext && useAppStore.getState().activeView === '🎲 État du Break'
      if (next && !stayOnBreak) useAppStore.getState().setActiveView(next)
    }

    const hit = cache.get(key)
    if (hit) {
      seq++
      inflightKey = null
      s.setAnalysisData(hit)
      s.setAnalyzedChecklistIds(ids)
      s.setIsAnalyzing(false)
      go()
      return true
    }
    if (inflightKey === key) return true

    const mine = ++seq
    inflightKey = key
    s.setIsAnalyzing(true)
    try {
      const data = await fetchAnalysis(s.selectedSport, ids, s.masterKey)
      cache.set(key, data)
      while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
      // Une demande plus récente, ou un périmètre vidé entre-temps : ce résultat ne sert plus.
      if (mine !== seq || useAppStore.getState().selectedChecklistIds.length === 0) return false
      s.setAnalysisData(data)
      s.setAnalyzedChecklistIds(ids)
      go()
      return true
    } catch (err) {
      if (mine !== seq) return false
      console.error('Analysis failed:', err)
      s.setAnalysisData(null)
      s.setAnalyzedChecklistIds([])
      return false
    } finally {
      if (mine === seq) {
        inflightKey = null
        useAppStore.getState().setIsAnalyzing(false)
      }
    }
  }, [])
}

/**
 * Analyse automatique : dès que les collections ouvertes changent, on relance
 * (avec un court délai quand on coche plusieurs collections à la suite).
 */
export function useAutoAnalysis() {
  const ids = useAppStore((s) => s.selectedChecklistIds)
  const analyzed = useAppStore((s) => s.analyzedChecklistIds)
  const hasData = useAppStore((s) => !!s.analysisData)
  const sport = useAppStore((s) => s.selectedSport)
  const ready = useAppStore((s) => s.availableChecklists.length > 0)
  const run = useRunAnalysis()
  const failed = useRef<string | null>(null)

  useEffect(() => {
    if (!ready || ids.length === 0) return
    if (hasData && sameIds(ids, analyzed)) return
    const key = keyOf(sport, ids)
    if (failed.current === key) return
    const t = setTimeout(async () => {
      const ok = await run({ ids })
      // Pas de boucle de relance sur une analyse qui échoue : on attend un autre changement.
      if (!ok && sameIds(useAppStore.getState().selectedChecklistIds, ids)) failed.current = key
      else if (ok) failed.current = null
    }, hasData ? 450 : 0)
    return () => clearTimeout(t)
  }, [ids, analyzed, hasData, sport, ready, run])
}

export function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}
