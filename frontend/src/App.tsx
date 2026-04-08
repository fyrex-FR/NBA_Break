import { useState, useRef, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAppStore } from './stores/appStore'
import { fetchAnalysis } from './api/client'
import { useUrlSync } from './hooks/useUrlSync'
import { Sidebar } from './components/layout/Sidebar'
import { ViewTabs } from './components/layout/ViewTabs'
import { GlobalView } from './components/views/GlobalView'
import { CategoryFilteredView } from './components/views/CategoryFilteredView'
import { MultiPlayersView } from './components/views/MultiPlayersView'
import { PlayerDetailView } from './components/views/PlayerDetailView'
import { TeamDetailView } from './components/views/TeamDetailView'
import { FileAnalysisView } from './components/views/FileAnalysisView'
import { ComparatorView } from './components/views/ComparatorView'
import { BreakSimulationView } from './components/views/BreakSimulationView'
import { ExportView } from './components/views/ExportView'
import { DetectionView } from './components/views/DetectionView'
import { RookiesView } from './components/views/RookiesView'
import { CATEGORY_AUTO_MEM, CATEGORY_LOGOMAN, CATEGORY_CASE_HIT } from './types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 2 * 60 * 1000, retry: 1 },
  },
})

function MainContent() {
  const { analysisData, activeView, isAnalyzing } = useAppStore()

  if (isAnalyzing) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">⏳</div>
          <p style={{ color: 'var(--text-secondary)' }}>Analyse en cours...</p>
        </div>
      </div>
    )
  }

  if (!analysisData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🃏</div>
          <h2 className="text-xl font-medium mb-2">Checklist Optimizer</h2>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Sélectionnez vos checklists dans la barre latérale puis cliquez sur
            <span className="font-medium" style={{ color: 'var(--accent)' }}> 🚀 Lancer </span>
            pour analyser vos cartes.
          </p>
        </div>
      </div>
    )
  }

  const renderView = () => {
    switch (activeView) {
      case '🌍 Vue Globale':
        return <GlobalView />
      case '💎 Autos & Patchs':
        return (
          <CategoryFilteredView
            title="Autos & Patchs"
            icon="💎"
            category={CATEGORY_AUTO_MEM}
            description="Cartes autographiées et memorabilia (patches, swatches, etc.)."
          />
        )
      case '🔥 Logoman':
        return (
          <CategoryFilteredView
            title="Logoman"
            icon="🔥"
            category={CATEGORY_LOGOMAN}
            description="Cartes Logoman — les plus rares et recherchées."
          />
        )
      case '✨ Case Hits':
        return (
          <CategoryFilteredView
            title="Case Hits"
            icon="✨"
            category={CATEGORY_CASE_HIT}
            description="Inserts spéciaux (Downtown, Kaboom, Color Blast, etc.)."
          />
        )
      case '👥 Multi-Joueurs':
        return <MultiPlayersView />
      case '🔍 Analyse Joueur':
        return <PlayerDetailView />
      case '🛡️ Analyse Équipe':
        return <TeamDetailView />
      case '📁 Par Fichier':
        return <FileAnalysisView />
      case '🧨 Rookies':
        return <RookiesView />
      case '🧪 Détection Auto/Mem':
        return <DetectionView />
      case '⚖️ Comparateur Joueurs':
        return <ComparatorView />
      case '🧩 Simulation de Break':
        return <BreakSimulationView />
      case '📤 Export':
        return <ExportView />
      default:
        return (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="text-4xl mb-3">🚧</div>
              <p style={{ color: 'var(--text-tertiary)' }}>
                Vue <strong>{activeView}</strong> — bientôt disponible
              </p>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="p-4 md:p-6">
      {/* Navigation tabs */}
      <ViewTabs enabledViews={analysisData.enabled_views} />

      {/* Active view */}
      {renderView()}
    </div>
  )
}


export default function App() {
  const { selectedSport, analysisData, activeView, selectedChecklistIds, masterKey, setAnalysisData, setIsAnalyzing } = useAppStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  useUrlSync()

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [activeView])

  // Auto-relance l'analyse au retour sur la page si une sélection existe mais pas de données
  useEffect(() => {
    if (analysisData || selectedChecklistIds.length === 0) return
    setIsAnalyzing(true)
    fetchAnalysis(selectedSport, selectedChecklistIds, masterKey)
      .then(setAnalysisData)
      .catch(() => setAnalysisData(null))
      .finally(() => setIsAnalyzing(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-dvh w-screen overflow-hidden" data-sport={selectedSport} style={{ background: 'var(--bg-primary)' }}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto">
          {/* Mobile topbar */}
          <div
            className="md:hidden flex items-center gap-3 px-4 py-3 sticky top-0 z-30"
            style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)' }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Ouvrir le menu"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <rect y="3" width="20" height="2" rx="1"/>
                <rect y="9" width="20" height="2" rx="1"/>
                <rect y="15" width="20" height="2" rx="1"/>
              </svg>
            </button>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Checklist Optimizer
            </span>
            {analysisData && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                {analysisData.metadata.checklists_count} listes
              </span>
            )}
          </div>
          <MainContent />
        </main>
      </div>
    </QueryClientProvider>
  )
}
