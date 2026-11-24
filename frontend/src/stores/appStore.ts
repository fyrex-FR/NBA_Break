/**
 * Global app state with localStorage persistence.
 * Replaces Streamlit's ~50 session_state keys.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ViewName, AnalyzeResponse, ChecklistInfo, BreakContext } from '../types'
import { DESTINATIONS, navItemFor, type DestinationId } from '../navigation'

interface AppState {
  // Theme
  theme: 'dark' | 'light'
  toggleTheme: () => void

  // Sport selection
  selectedSport: string
  setSport: (sport: string) => void

  // Checklists
  availableChecklists: ChecklistInfo[]
  setAvailableChecklists: (checklists: ChecklistInfo[]) => void
  selectedChecklistIds: string[]
  setSelectedChecklistIds: (ids: string[]) => void
  toggleChecklist: (id: string) => void
  selectAllChecklists: () => void
  deselectAllChecklists: () => void
  masterKey: string | null
  setMasterKey: (key: string | null) => void

  // Spots entourés (visés), par sport : « team:Nom » / « player:Nom »
  markedSpots: string[]
  /** Spots par équipe ou par joueur (gardé au retour d'une fiche). */
  spotsKind: 'team' | 'player'
  setSpotsKind: (k: 'team' | 'player') => void
  toggleMarkedSpot: (key: string) => void

  // Navigation
  activeView: ViewName
  setActiveView: (view: ViewName) => void
  /** Dernier onglet ouvert dans chaque destination (retour au même endroit). */
  lastViews: Partial<Record<DestinationId, ViewName>>
  /** Ouvre une destination ; re-toucher la destination courante revient à son onglet par défaut. */
  goToDestination: (id: DestinationId) => void

  // Analysis results (not persisted)
  analysisData: AnalyzeResponse | null
  setAnalysisData: (data: AnalyzeResponse | null) => void
  isAnalyzing: boolean
  setIsAnalyzing: (v: boolean) => void

  // Filters
  checklistFilter: string[]
  setChecklistFilter: (filter: string[]) => void

  // Detail navigation
  targetPlayer: string | null
  setTargetPlayer: (player: string | null) => void
  targetTeam: string | null
  setTargetTeam: (team: string | null) => void

  // Odds — configuration ouverte ("je break du Hobby"). null = aucune pondération,
  // les badges restent purement descriptifs.
  selectedConfigKeys: string[]
  setSelectedConfigKeys: (keys: string[]) => void
  toggleConfigKey: (key: string) => void
  clearConfigKeys: () => void

  // Break mode (Voggt show context). When set, the app shows the break overview.
  breakContext: BreakContext | null
  setBreakContext: (ctx: BreakContext | null) => void
  clearBreakContext: () => void

  // Checklists effectivement analysées (pour détecter une sélection modifiée)
  analyzedChecklistIds: string[]
  setAnalyzedChecklistIds: (ids: string[]) => void

  // Shell UI
  selectionOpen: boolean
  selectionTab: SelectionTab
  openSelection: (tab?: SelectionTab) => void
  closeSelection: () => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  navCollapsed: boolean
  toggleNavCollapsed: () => void
  chatOpen: boolean
  setChatOpen: (open: boolean) => void
}

export type SelectionTab = 'catalog' | 'presets' | 'upload'

/**
 * Coupe toutes les transitions le temps d'un changement de thème : sinon des
 * dizaines de fondus de couleur partent ensemble et le navigateur laisse
 * certains éléments peints avec l'ancien thème jusqu'au prochain repaint.
 */
function suspendTransitions() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.add('theme-switching')
  // Deux frames : le nouveau thème est calculé et peint sans transition, puis on les rétablit.
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
}

/**
 * Nouvelle sélection. Vide = on repart de zéro : l'analyse affichée ne
 * correspond plus à rien, on l'efface pour revenir à l'accueil.
 */
function withSelection(ids: string[]): Partial<AppState> {
  if (ids.length > 0) return { selectedChecklistIds: ids }
  return { selectedChecklistIds: [], analysisData: null, analyzedChecklistIds: [] }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Theme
      theme: 'dark',
      toggleTheme: () => {
        suspendTransitions()
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }))
      },

      // Sport
      selectedSport: 'nba',
      setSport: (sport) => set((s) => (
        s.selectedSport === sport ? {} : { selectedSport: sport, analysisData: null, selectedChecklistIds: [], analyzedChecklistIds: [] }
      )),

      // Checklists
      availableChecklists: [],
      setAvailableChecklists: (checklists) => set({ availableChecklists: checklists }),
      selectedChecklistIds: [],
      setSelectedChecklistIds: (ids) => set(withSelection(ids)),
      toggleChecklist: (id) => {
        const current = get().selectedChecklistIds
        set(withSelection(current.includes(id) ? current.filter((i) => i !== id) : [...current, id]))
      },
      selectAllChecklists: () => {
        set({ selectedChecklistIds: get().availableChecklists.map((c) => c.checklist_id) })
      },
      deselectAllChecklists: () => set(withSelection([])),
      masterKey: null,
      setMasterKey: (key) => set({ masterKey: key }),

      spotsKind: 'team',
      setSpotsKind: (k) => set({ spotsKind: k }),
      markedSpots: [],
      toggleMarkedSpot: (key) => set((s) => ({
        markedSpots: s.markedSpots.includes(key) ? s.markedSpots.filter((k) => k !== key) : [...s.markedSpots, key],
      })),

      // Navigation
      activeView: '🌡️ Spots',
      setActiveView: (view) => {
        const group = navItemFor(view)?.group
        const isDestination = DESTINATIONS.some((d) => d.id === group)
        set((s) => ({
          activeView: view,
          lastViews: isDestination ? { ...s.lastViews, [group as DestinationId]: view } : s.lastViews,
        }))
      },
      lastViews: {},
      goToDestination: (id) => {
        const dest = DESTINATIONS.find((d) => d.id === id)
        if (!dest) return
        const current = navItemFor(get().activeView)?.group
        const target = current === id ? dest.defaultView : get().lastViews[id] ?? dest.defaultView
        get().setActiveView(target)
      },

      // Analysis
      analysisData: null,
      setAnalysisData: (data) => set({ analysisData: data }),
      isAnalyzing: false,
      setIsAnalyzing: (v) => set({ isAnalyzing: v }),

      // Filters
      checklistFilter: [],
      setChecklistFilter: (filter) => set({ checklistFilter: filter }),

      // Detail navigation
      targetPlayer: null,
      setTargetPlayer: (player) => set({ targetPlayer: player }),
      targetTeam: null,
      setTargetTeam: (team) => set({ targetTeam: team }),

      // Odds
      selectedConfigKeys: [],
      setSelectedConfigKeys: (keys) => set({ selectedConfigKeys: Array.from(new Set(keys)) }),
      toggleConfigKey: (key) => {
        const current = get().selectedConfigKeys
        if (current.includes(key)) {
          set({ selectedConfigKeys: current.filter((k) => k !== key) })
        } else {
          set({ selectedConfigKeys: [...current, key] })
        }
      },
      clearConfigKeys: () => set({ selectedConfigKeys: [] }),

      // Break mode
      breakContext: null,
      setBreakContext: (ctx) => set({ breakContext: ctx }),
      clearBreakContext: () => set({ breakContext: null }),

      analyzedChecklistIds: [],
      setAnalyzedChecklistIds: (ids) => set({ analyzedChecklistIds: ids }),

      selectionOpen: false,
      selectionTab: 'catalog',
      openSelection: (tab) => set((s) => ({ selectionOpen: true, selectionTab: tab ?? s.selectionTab })),
      closeSelection: () => set({ selectionOpen: false }),
      paletteOpen: false,
      setPaletteOpen: (open) => set({ paletteOpen: open }),
      navCollapsed: false,
      toggleNavCollapsed: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      chatOpen: false,
      setChatOpen: (open) => set({ chatOpen: open }),
    }),
    {
      name: 'checklist-optimizer',
      // Only persist user preferences, not ephemeral analysis data
      partialize: (state) => ({
        theme: state.theme,
        selectedSport: state.selectedSport,
        selectedChecklistIds: state.selectedChecklistIds,
        activeView: state.activeView,
        masterKey: state.masterKey,
        selectedConfigKeys: state.selectedConfigKeys,
        navCollapsed: state.navCollapsed,
        markedSpots: state.markedSpots,
      }),
    },
  ),
)

// Accès console en dev uniquement (debug, maquettes) — absent du build de prod.
if (import.meta.env.DEV) {
  ;(window as unknown as { __noclim: typeof useAppStore }).__noclim = useAppStore
}
