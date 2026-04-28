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
import { SmartImportView } from './components/views/SmartImportView'
import { CATEGORY_AUTO_MEM, CATEGORY_LOGOMAN, CATEGORY_CASE_HIT } from './types'
import { Loader2, Play, Sun, Moon, Menu } from 'lucide-react'

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
        <div className="text-center p-8 rounded-2xl glass-panel animate-pulse flex flex-col items-center">
          <Loader2 className="w-12 h-12 mb-4 text-[var(--accent)] animate-spin" />
          <p className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Analyse en cours...</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Croisement des données en temps réel</p>
        </div>
      </div>
    )
  }

  if (activeView === '📥 Import Intelligent') {
    return (
      <div className="p-4 md:p-6">
        <SmartImportView />
      </div>
    )
  }

  if (!analysisData) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center max-w-lg p-10 rounded-2xl glass-panel shadow-glass transform transition-all hover:scale-[1.01]">
          <div className="relative inline-block mb-6 group">
            <div className="absolute inset-0 bg-[var(--accent)] rounded-[24%] blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-500"></div>
            <img src="/logo.png" alt="NoClim" className="relative w-32 h-32 mx-auto shadow-xl" style={{ borderRadius: '24%', border: '1px solid var(--border-subtle)' }} />
          </div>
          <h2 className="text-4xl font-extrabold mb-3 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-tertiary)]">
            NoClim
          </h2>
          <p className="text-lg font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
            Parce que climatiser en silence, c'est un art.
          </p>
          <div className="h-px w-16 bg-[var(--border-standard)] mx-auto mb-5"></div>
          <p className="text-sm mb-6 leading-relaxed flex flex-col gap-2" style={{ color: 'var(--text-quaternary)' }}>
            <span>Sélectionne tes checklists à gauche, analyse tes spots et évite de te retrouver avec une carte base de 2012.</span>
          </p>
          <div className="inline-flex items-center justify-center p-1 rounded-full bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-sm font-medium px-4 py-2 mt-2 gap-2" style={{ color: 'var(--text-primary)' }}>
            <Play className="w-4 h-4 text-[var(--accent)]" />
            <span>Sélectionnez des données pour lancer l'analyse</span>
          </div>
          <div className="mt-4">
            <button
              onClick={() => useAppStore.getState().setActiveView('📥 Import Intelligent')}
              className="text-sm underline"
              style={{ color: 'var(--accent)' }}
            >
              📥 Importer une checklist via IA
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderView = () => {
    switch (activeView as string) {
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
      case '📥 Import Intelligent':
        return <SmartImportView />
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
              className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-base font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              NoClim
            </span>
            <div className="ml-auto flex items-center gap-3">
              {analysisData && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                  {analysisData.metadata.checklists_count} listes
                </span>
              )}
              <button
                onClick={toggleTheme}
                className="p-1.5 flex items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                title="Changer le thème"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <MainContent />
        </main>
      </div>
    </QueryClientProvider>
  )
}
