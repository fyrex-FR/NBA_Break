import { useState, useRef, useEffect } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { LayoutDashboard, User, Shield, Layers, Search } from 'lucide-react'
import { useAppStore } from './stores/appStore'
import { fetchChecklists } from './api/client'
import { useUrlSync } from './hooks/useUrlSync'
import { useRunAnalysis } from './hooks/useRunAnalysis'
import { navItemFor } from './navigation'
import { NavRail } from './components/layout/NavRail'
import { TopBar } from './components/layout/TopBar'
import { SelectionPanel } from './components/layout/SelectionPanel'
import { CommandPalette } from './components/layout/CommandPalette'
import { PageHeader } from './components/ui/primitives'
import { HomeView, AnalysisSkeleton } from './components/views/HomeView'
import { GlobalView } from './components/views/GlobalView'
import { HitsView } from './components/views/HitsView'
import { MultiPlayersView } from './components/views/MultiPlayersView'
import { PlayerDetailView } from './components/views/PlayerDetailView'
import { TeamDetailView } from './components/views/TeamDetailView'
import { ChecklistBrowserView } from './components/views/ChecklistBrowserView'
import { FileAnalysisView } from './components/views/FileAnalysisView'
import { ComparatorView } from './components/views/ComparatorView'
import { BreakSimulationView } from './components/views/BreakSimulationView'
import { ExportView } from './components/views/ExportView'
import { DetectionView } from './components/views/DetectionView'
import { MarvelAttributionView } from './components/views/MarvelAttributionView'
import { RookiesView } from './components/views/RookiesView'
import { TrendView } from './components/views/TrendView'
import { SmartImportView } from './components/views/SmartImportView'
import { BreakOverviewView } from './components/views/BreakOverviewView'
import { OddsView } from './components/views/OddsView'
import { OddsMappingView } from './components/views/OddsMappingView'
import ChatWidget from './components/shared/ChatWidget'
import type { ViewName } from './types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 2 * 60 * 1000, retry: 1 },
  },
})

/** Vues qui portent déjà leur propre en-tête (bandeau, branding…). */
const OWN_HEADER = new Set<ViewName>(['📚 Checklist Beckett', '📥 Import Intelligent', '🎲 État du Break'])

function renderView(view: ViewName) {
  switch (view) {
    case '🌍 Vue Globale': return <GlobalView />
    case '💎 Autos & Patchs':
    case '🔥 Logoman':
    case '✨ Case Hits': return <HitsView />
    case '👥 Multi-Joueurs': return <MultiPlayersView />
    case '🔍 Analyse Joueur': return <PlayerDetailView />
    case '🛡️ Analyse Équipe': return <TeamDetailView />
    case '📚 Checklist Beckett': return <ChecklistBrowserView />
    case '📁 Par Fichier': return <FileAnalysisView />
    case '📈 Tendances': return <TrendView />
    case '🧨 Rookies': return <RookiesView />
    case '🧪 Détection Auto/Mem': return <DetectionView />
    case '🦸 Attribution Marvel': return <MarvelAttributionView />
    case '⚖️ Comparateur Joueurs': return <ComparatorView />
    case '🧩 Simulation de Break': return <BreakSimulationView />
    case '🎯 Odds': return <OddsView />
    case '🔗 Mapping Odds': return <OddsMappingView />
    case '📤 Export': return <ExportView />
    case '📥 Import Intelligent': return <SmartImportView />
    case '🎲 État du Break': return <BreakOverviewView />
    default: return <GlobalView />
  }
}

function MainContent() {
  const { analysisData, activeView, isAnalyzing, breakContext } = useAppStore()
  const item = navItemFor(activeView)

  const standalone = activeView === '📥 Import Intelligent' || (activeView === '🎲 État du Break' && !!breakContext)

  let body: React.ReactNode
  if (isAnalyzing && !standalone) {
    body = <AnalysisSkeleton />
  } else if (!analysisData && !standalone) {
    body = <HomeView />
  } else {
    body = (
      <>
        {item && !OWN_HEADER.has(activeView) && (
          <PageHeader title={item.label} description={item.description} icon={item.icon} />
        )}
        {renderView(activeView)}
      </>
    )
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 pb-24 md:pb-10 max-w-[1440px] mx-auto w-full">
      <div key={isAnalyzing ? 'loading' : activeView} style={{ animation: 'fadeIn 0.18s ease-out' }}>
        {body}
      </div>
    </div>
  )
}

/** Charge le catalogue du sport courant dès l'ouverture (plus besoin d'ouvrir la sidebar). */
function useCatalogSync() {
  const { selectedSport, setAvailableChecklists, setMasterKey } = useAppStore()
  const { data } = useQuery({
    queryKey: ['checklists', selectedSport],
    queryFn: () => fetchChecklists(selectedSport),
    enabled: !!selectedSport,
  })
  useEffect(() => {
    if (data) {
      setAvailableChecklists(data.checklists)
      setMasterKey(data.master_key)
    }
  }, [data, setAvailableChecklists, setMasterKey])
}

function MobileTabBar() {
  const { activeView, setActiveView, openSelection, setPaletteOpen, analysisData, selectedChecklistIds } = useAppStore()
  const current = navItemFor(activeView)?.view
  const tabs = [
    { label: 'Aperçu', icon: LayoutDashboard, view: '🌍 Vue Globale' as ViewName },
    { label: 'Joueur', icon: User, view: '🔍 Analyse Joueur' as ViewName },
    { label: 'Équipe', icon: Shield, view: '🛡️ Analyse Équipe' as ViewName },
  ]
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5"
      style={{
        background: 'color-mix(in srgb, var(--bg-panel) 92%, transparent)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderTop: '1px solid var(--border-subtle)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Navigation rapide"
    >
      {tabs.map(({ label, icon: Icon, view }) => {
        const active = !!analysisData && current === view
        return (
          <button
            key={label}
            onClick={() => (analysisData ? setActiveView(view) : openSelection('catalog'))}
            className="flex flex-col items-center justify-center gap-0.5 h-14 text-[10.5px] font-medium"
            style={{ color: active ? 'var(--accent)' : 'var(--text-tertiary)' }}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        )
      })}
      <button onClick={() => setPaletteOpen(true)} className="flex flex-col items-center justify-center gap-0.5 h-14 text-[10.5px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
        <Search className="w-5 h-5" />
        Chercher
      </button>
      <button onClick={() => openSelection('catalog')} className="relative flex flex-col items-center justify-center gap-0.5 h-14 text-[10.5px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
        <Layers className="w-5 h-5" />
        Sélection
        {selectedChecklistIds.length > 0 && (
          <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold num flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            {selectedChecklistIds.length}
          </span>
        )}
      </button>
    </nav>
  )
}

function Shell() {
  const { selectedSport, analysisData, activeView, selectedChecklistIds, theme } = useAppStore()
  const [navOpen, setNavOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const runAnalysis = useRunAnalysis()
  useUrlSync()
  useCatalogSync()

  const hasAnalysis = !!analysisData
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [activeView, hasAnalysis])

  // Le thème s'applique aussi à <html> pour les zones hors app (overscroll, scrollbars).
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // Barre d'état du navigateur / de l'app installée assortie au thème choisi.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', theme === 'dark' ? '#0a0a0f' : '#f6f6f8')
      m.removeAttribute('media')
    })
  }, [theme])

  // Relance l'analyse au retour sur la page si une sélection existe mais pas de données.
  useEffect(() => {
    if (analysisData || selectedChecklistIds.length === 0) return
    runAnalysis()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-dvh w-screen overflow-hidden" data-sport={selectedSport} data-theme={theme} style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <NavRail mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
      <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto flex flex-col">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <MainContent />
      </main>
      <SelectionPanel />
      <CommandPalette />
      <MobileTabBar />
      <ChatWidget />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  )
}
