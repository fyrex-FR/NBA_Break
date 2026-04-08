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
  const rookieNames = new Set(rookies.map((r) => r.player_name.toLowerCase()))

  function isRookie(playerName: string): boolean {
    return rookieNames.has(playerName.toLowerCase())
  }

  function getRookie(playerName: string): RookieRecord | undefined {
    return rookies.find((r) => r.player_name.toLowerCase() === playerName.toLowerCase())
  }

  return { rookies, isRookie, getRookie }
}
