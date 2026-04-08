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
import { TrendView } from './components/views/TrendView'
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
        <div className="text-center max-w-lg px-6">
          <img src="/logo.png" alt="NoClim" className="w-40 h-40 mb-6 mx-auto" style={{ borderRadius: '24%' }} />
          <h2 className="text-3xl font-bold mb-3">NoClim</h2>
          <p className="text-base mb-2" style={{ color: 'var(--text-secondary)' }}>
            Parce que climatiser en silence, c'est un art.
          </p>
          <p className="text-sm mb-6" style={{ color: 'var(--text-quaternary)' }}>
            Sélectionne tes checklists à gauche, analyse tes spots et évite de te retrouver avec une carte base de 2012.
          </p>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Prêt à ne plus clim ? Clique sur
            <span className="font-semibold" style={{ color: 'var(--accent)' }}> 🚀 Lancer</span>.
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
      case '📈 Tendances':
        return <TrendView />
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
      <ViewTabs enabledViews={analysisData.enabled_views} />
      <div key={activeView} style={{ animation: 'fadeIn 0.15s ease-out' }}>
        {renderView()}
      </div>
    </div>
  )
}


export default function App() {
  const { selectedSport, analysisData, activeView, selectedChecklistIds, masterKey, setAnalysisData, setIsAnalyzing, theme, toggleTheme } = useAppStore()
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
      <div className="flex h-dvh w-screen overflow-hidden" data-sport={selectedSport} data-theme={theme} style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
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
              NoClim
            </span>
            <div className="ml-auto flex items-center gap-2">
              {analysisData && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                  {analysisData.metadata.checklists_count} listes
                </span>
              )}
              <button onClick={toggleTheme} className="p-1.5 rounded-md text-base" style={{ color: 'var(--text-secondary)' }} title="Changer le thème">
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
          <MainContent />
        </main>
      </div>
    </QueryClientProvider>
  )
}
