import { useEffect, useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useAppStore } from '../stores/appStore'
import { fetchOddsIndex, fetchOddsSheet } from '../api/client'
import type { OddsConfig } from '../types'

export const ODDS_CHANNEL_LABELS_FR: Record<string, string> = {
  hobby: 'Hobby',
  retail: 'Retail',
  special: 'Spécial',
}
export const ODDS_CHANNEL_ORDER = ['hobby', 'retail', 'special']

/**
 * Feuilles d'odds Topps : quelles checklists en ont une, et l'union des
 * configurations de box ("Hobby", "Jumbo"…) des checklists sélectionnées.
 */
export function useOddsConfig() {
  const { selectedSport, selectedChecklistIds, selectedConfigKeys, setSelectedConfigKeys } = useAppStore()

  const { data: oddsIndexData } = useQuery({
    queryKey: ['odds-index', selectedSport],
    queryFn: () => fetchOddsIndex(selectedSport),
    enabled: !!selectedSport,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const oddsChecklistIds = useMemo(() => new Set(oddsIndexData?.checklist_ids ?? []), [oddsIndexData])

  const selectedWithOdds = useMemo(
    () => selectedChecklistIds.filter((id) => oddsChecklistIds.has(id)),
    [selectedChecklistIds, oddsChecklistIds],
  )

  const sheetQueries = useQueries({
    queries: selectedWithOdds.map((id) => ({
      queryKey: ['odds-sheet', selectedSport, id],
      queryFn: () => fetchOddsSheet(selectedSport, id),
      enabled: !!selectedSport,
      retry: false,
      staleTime: 5 * 60 * 1000,
    })),
  })

  const configOptions = useMemo(() => {
    const byKey = new Map<string, OddsConfig>()
    for (const q of sheetQueries) {
      for (const c of q.data?.configs ?? []) {
        if (!byKey.has(c.key)) byKey.set(c.key, c)
      }
    }
    return Array.from(byKey.values())
  }, [sheetQueries])

  useEffect(() => {
    if (configOptions.length === 0 || selectedConfigKeys.length === 0) return
    const validKeys = new Set(configOptions.map((c) => c.key))
    const next = selectedConfigKeys.filter((key) => validKeys.has(key))
    if (next.length !== selectedConfigKeys.length) setSelectedConfigKeys(next)
  }, [configOptions, selectedConfigKeys, setSelectedConfigKeys])

  return { oddsChecklistIds, configOptions }
}
