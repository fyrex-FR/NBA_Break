/**
 * Synchronise la sélection (sport + checklists) avec l'URL.
 * - Au chargement : lit les params et restaure la sélection
 * - À chaque changement : met à jour l'URL sans recharger la page
 *
 * Format : ?sport=nba&s=<base64(JSON)>
 */

import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'

function encode(ids: string[]): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(ids))))
}

function decode(s: string): string[] {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s))))
  } catch {
    return []
  }
}

export function useUrlSync() {
  const { selectedSport, selectedChecklistIds, setSport, setSelectedChecklistIds } = useAppStore()

  // Lecture initiale de l'URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sport = params.get('sport')
    const s = params.get('s')
    if (sport) setSport(sport)
    if (s) {
      const ids = decode(s)
      if (ids.length > 0) setSelectedChecklistIds(ids)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mise à jour de l'URL à chaque changement de sélection
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('sport', selectedSport)
    if (selectedChecklistIds.length > 0) {
      params.set('s', encode(selectedChecklistIds))
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', newUrl)
  }, [selectedSport, selectedChecklistIds])
}

export function buildShareUrl(): string {
  return window.location.href
}
