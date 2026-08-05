/**
 * Badges odds Topps pour les checklists actuellement sélectionnées.
 *
 * Ne doit JAMAIS faire échouer l'affichage : `retry: false`, et en cas
 * d'erreur ou d'absence de données, `badgesFor` renvoie `undefined` — les
 * tableaux s'affichent normalement, sans pastille.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchOddsBadges } from '../api/client'
import { useAppStore } from '../stores/appStore'
import type { OddsBadgeEntry } from '../types'

export function useOddsBadges() {
  const selectedSport = useAppStore((s) => s.selectedSport)
  const selectedChecklistIds = useAppStore((s) => s.selectedChecklistIds)

  const { data } = useQuery({
    queryKey: ['odds-badges', selectedSport, selectedChecklistIds],
    queryFn: () => fetchOddsBadges(selectedSport, selectedChecklistIds),
    enabled: selectedChecklistIds.length > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const badges = data?.badges ?? {}
  const hasOdds = Object.keys(badges).length > 0

  function badgesFor(checklistId: string, boxType: string): OddsBadgeEntry | undefined {
    if (!checklistId || !boxType) return undefined
    return badges[`${checklistId}::${boxType}`]
  }

  return { badgesFor, hasOdds }
}
