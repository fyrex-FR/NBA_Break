/**
 * Synchronise sport, sélection, vue active et fiche ouverte avec l'URL.
 * - Au chargement : lit les params et restaure l'état
 * - Changement de vue ou de fiche : nouvelle entrée d'historique (le bouton retour marche)
 * - Changement de sélection : remplace l'entrée courante
 *
 * Format : ?sport=nba&v=player&p=Cooper%20Flagg&s=<base64(JSON)>
 *   p = joueur (vue joueur), t = équipe (vue équipe)
 */

import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { slugForView, viewForSlug } from '../navigation'
import type { ViewName } from '../types'

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

const PLAYER_VIEW: ViewName = '🔍 Analyse Joueur'
const TEAM_VIEW: ViewName = '🛡️ Analyse Équipe'

const INITIAL_PARAMS = new URLSearchParams(window.location.search)
let initialApplied = false

/** Applique la vue et la fiche décrites par des params d'URL. */
function applyLocation(params: URLSearchParams) {
  const s = useAppStore.getState()
  const view = viewForSlug(params.get('v'))
  if (view) s.setActiveView(view)
  const p = params.get('p')
  const t = params.get('t')
  if (view === PLAYER_VIEW) s.setTargetPlayer(p)
  if (view === TEAM_VIEW) s.setTargetTeam(t)
}

/** Clé d'historique : ce qui, quand ça change, mérite une entrée « retour ». */
function locationKey(view: ViewName, player: string | null, team: string | null) {
  return `${view}|${view === PLAYER_VIEW ? player ?? '' : ''}|${view === TEAM_VIEW ? team ?? '' : ''}`
}

export function useUrlSync() {
  const { selectedSport, selectedChecklistIds, activeView, targetPlayer, targetTeam, setSport, setSelectedChecklistIds } = useAppStore()
  const lastKey = useRef<string | null>(null)

  // Lecture initiale de l'URL — capturée au chargement du module et appliquée
  // une seule fois (StrictMode rejoue les effets avec un état périmé).
  useEffect(() => {
    if (!initialApplied) {
      initialApplied = true
      const sport = INITIAL_PARAMS.get('sport')
      const s = INITIAL_PARAMS.get('s')
      if (sport) setSport(sport)
      if (s) {
        const ids = decode(s)
        if (ids.length > 0) setSelectedChecklistIds(ids)
      }
      applyLocation(INITIAL_PARAMS)
    }

    function onPop() {
      const params = new URLSearchParams(window.location.search)
      applyLocation(params)
      const st = useAppStore.getState()
      lastKey.current = locationKey(st.activeView, st.targetPlayer, st.targetTeam)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialApplied) return
    // État courant plutôt que la closure : évite d'écrire une URL périmée.
    const st = useAppStore.getState()
    const params = new URLSearchParams()
    params.set('sport', st.selectedSport)
    params.set('v', slugForView(st.activeView))
    if (st.activeView === PLAYER_VIEW && st.targetPlayer) params.set('p', st.targetPlayer)
    if (st.activeView === TEAM_VIEW && st.targetTeam) params.set('t', st.targetTeam)
    if (st.selectedChecklistIds.length > 0) params.set('s', encode(st.selectedChecklistIds))

    const newUrl = `${window.location.pathname}?${params.toString()}`
    if (newUrl === `${window.location.pathname}${window.location.search}`) return
    const key = locationKey(st.activeView, st.targetPlayer, st.targetTeam)
    const navigated = lastKey.current !== null && lastKey.current !== key
    lastKey.current = key
    if (navigated) window.history.pushState(null, '', newUrl)
    else window.history.replaceState(null, '', newUrl)
  }, [selectedSport, selectedChecklistIds, activeView, targetPlayer, targetTeam])
}

export function buildShareUrl(): string {
  return window.location.href
}
