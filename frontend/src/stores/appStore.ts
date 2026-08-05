/**
 * Global app state with localStorage persistence.
 * Replaces Streamlit's ~50 session_state keys.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ViewName, AnalyzeResponse, ChecklistInfo, BreakContext } from '../types'

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

  // Navigation
  activeView: ViewName
  setActiveView: (view: ViewName) => void

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
  selectedConfigKey: string | null
  setSelectedConfigKey: (key: string | null) => void

  // Break mode (Voggt show context). When set, the app shows the break overview.
  breakContext: BreakContext | null
  setBreakContext: (ctx: BreakContext | null) => void
  clearBreakContext: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Theme
      theme: 'dark',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      // Sport
      selectedSport: 'nba',
      setSport: (sport) => set({ selectedSport: sport, analysisData: null, selectedChecklistIds: [] }),

      // Checklists
      availableChecklists: [],
      setAvailableChecklists: (checklists) => set({ availableChecklists: checklists }),
      selectedChecklistIds: [],
      setSelectedChecklistIds: (ids) => set({ selectedChecklistIds: ids }),
      toggleChecklist: (id) => {
        const current = get().selectedChecklistIds
        if (current.includes(id)) {
          set({ selectedChecklistIds: current.filter((i) => i !== id) })
        } else {
          set({ selectedChecklistIds: [...current, id] })
        }
      },
      selectAllChecklists: () => {
        set({ selectedChecklistIds: get().availableChecklists.map((c) => c.checklist_id) })
      },
      deselectAllChecklists: () => set({ selectedChecklistIds: [] }),
      masterKey: null,
      setMasterKey: (key) => set({ masterKey: key }),

      // Navigation
      activeView: '🌍 Vue Globale',
      setActiveView: (view) => set({ activeView: view }),

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
      selectedConfigKey: null,
      setSelectedConfigKey: (key) => set({ selectedConfigKey: key }),

      // Break mode
      breakContext: null,
      setBreakContext: (ctx) => set({ breakContext: ctx }),
      clearBreakContext: () => set({ breakContext: null }),
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
        selectedConfigKey: state.selectedConfigKey,
      }),
    },
  ),
)
