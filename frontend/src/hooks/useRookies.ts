import { useQuery } from '@tanstack/react-query'
import { fetchRookies, type RookieRecord } from '../api/client'
import { useAppStore } from '../stores/appStore'

export function useRookies() {
  const selectedSport = useAppStore((s) => s.selectedSport)

  const { data } = useQuery({
    queryKey: ['rookies', selectedSport],
    queryFn: () => fetchRookies(selectedSport),
    enabled: selectedSport === 'nba',
    staleTime: 24 * 60 * 60 * 1000, // 24h
  })

  const rookies: RookieRecord[] = data?.rookies ?? []

  // Set pour lookup O(1)
  function normalize(s: string) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  const rookieNamesNorm = new Set(rookies.map((r) => normalize(r.player_name)))

  function isRookie(playerName: string): boolean {
    return rookieNamesNorm.has(normalize(playerName))
  }

  function getRookie(playerName: string): RookieRecord | undefined {
    const norm = normalize(playerName)
    return rookies.find((r) => normalize(r.player_name) === norm)
  }

  return { rookies, isRookie, getRookie }
}
