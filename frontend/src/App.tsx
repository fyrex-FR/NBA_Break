import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAppStore } from './stores/appStore'
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
    <div className="p-6">
      {/* Success banner */}
      <div
        className="rounded-lg px-4 py-2 mb-4 text-sm"
        style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)' }}
      >
        ✅ {analysisData.metadata.checklists_count} checklist(s) • {analysisData.metadata.total_rows.toLocaleString('fr-FR')} lignes
      </div>

      {/* Navigation tabs */}
      <ViewTabs enabledViews={analysisData.enabled_views} />

      {/* Active view */}
      {renderView()}
    </div>
  )
}

export default function App() {
  const { selectedSport } = useAppStore()
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen w-screen overflow-hidden" data-sport={selectedSport} style={{ background: 'var(--bg-primary)' }}>
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <MainContent />
        </main>
      </div>
    </QueryClientProvider>
  )
}
