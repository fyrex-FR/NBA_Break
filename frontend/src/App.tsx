import { useState, useRef, useEffect } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Search, ArrowLeft } from 'lucide-react'
import { useAppStore } from './stores/appStore'
import { fetchChecklists } from './api/client'
import { useUrlSync } from './hooks/useUrlSync'
import { useAutoAnalysis } from './hooks/useRunAnalysis'
import { DESTINATIONS, destinationFor, navItemFor } from './navigation'
import { NavRail } from './components/layout/NavRail'
import { TopBar } from './components/layout/TopBar'
import { SelectionPanel } from './components/layout/SelectionPanel'
import { CommandPalette } from './components/layout/CommandPalette'
import { DestinationTabs } from './components/layout/DestinationTabs'
import { CollectionHeader } from './components/layout/CollectionHeader'
import { NeedsCollection, BreakStart } from './components/layout/EmptyDestination'
import { PageHeader } from './components/ui/primitives'
import { HomeView, AnalysisSkeleton } from './components/views/HomeView'
import { GlobalView } from './components/views/GlobalView'
import { SpotsView } from './components/views/SpotsView'
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
import { BoxGuideView } from './components/views/BoxGuideView'
import { CatalogPlayersView, CatalogTeamsView } from './components/views/CatalogViews'
import ChatWidget from './components/shared/ChatWidget'
import type { ViewName } from './types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 2 * 60 * 1000, retry: 1 },
  },
})

/** Vues qui portent déjà leur propre en-tête (bandeau, branding…). */
const OWN_HEADER = new Set<ViewName>(['📚 Checklist Beckett', '📥 Import Intelligent', '🎲 État du Break'])

function renderView(view: ViewName, hasBreak: boolean) {
  switch (view) {
    case '🌍 Vue Globale': return <GlobalView />
    case '🌡️ Spots': return <SpotsView />
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
    case '🎲 État du Break': return hasBreak ? <BreakOverviewView /> : <BreakStart />
    case '📦 Guide des boîtes': return <BoxGuideView />
    case '🖊️ Qui a signé': return <CatalogPlayersView />
    case '🏟️ Équipes catalogue': return <CatalogTeamsView />
    default: return <GlobalView />
  }
}

function MainContent() {
  const { analysisData, activeView, isAnalyzing, breakContext, selectedChecklistIds } = useAppStore()
  const item = navItemFor(activeView)
  const destination = destinationFor(activeView)
  const needsCollection = !!item?.needsAnalysis && !analysisData

  let body: React.ReactNode
  if (needsCollection && isAnalyzing) {
    body = <AnalysisSkeleton />
  } else if (needsCollection && destination?.id === 'collections' && !item?.sheet) {
    // Rien d'ouvert : l'accueil sert de porte d'entrée vers les collections.
    body = <HomeView />
  } else {
    const breakStart = activeView === '🎲 État du Break' && !breakContext
    const showHeader = item && !(OWN_HEADER.has(activeView) && !needsCollection && !breakStart)
    body = (
      <>
        {destination?.id === 'collections' && analysisData && selectedChecklistIds.length > 0
          ? <CollectionHeader />
          : showHeader && (
            destination
              ? <PageHeader title={destination.label} description={destination.description} icon={destination.icon} />
              : <PageHeader title={item.label} description={item.description} icon={item.icon} />
          )}
        {destination && <DestinationTabs destination={destination.id} />}
        {item?.sheet && !needsCollection && <BackToSpots />}
        {needsCollection ? <NeedsCollection /> : renderView(activeView, !!breakContext)}
      </>
    )
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 pb-24 md:pb-10 max-w-[1440px] mx-auto w-full">
      <div key={needsCollection && isAnalyzing ? 'loading' : activeView} style={{ animation: 'fadeIn 0.18s ease-out' }}>
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

/** Fiche équipe ou joueur : retour direct au tableau des spots. */
function BackToSpots() {
  const setActiveView = useAppStore((s) => s.setActiveView)
  return (
    <button type="button" onClick={() => setActiveView('🌡️ Spots')} className="ui-btn ui-btn-ghost ui-btn-sm -ml-2 mb-3">
      <ArrowLeft className="w-4 h-4" /> Spots
    </button>
  )
}

function MobileTabBar() {
  const { activeView, goToDestination, setPaletteOpen, breakContext } = useAppStore()
  const current = destinationFor(activeView)?.id
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-3"
      style={{
        background: 'color-mix(in srgb, var(--bg-panel) 92%, transparent)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderTop: '2px solid var(--rule-heavy)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Navigation principale"
    >
      {DESTINATIONS.map(({ id, label, icon: Icon }) => {
        const active = current === id
        return (
          <button
            key={id}
            onClick={() => goToDestination(id)}
            aria-current={active ? 'page' : undefined}
            className="relative flex flex-col items-center justify-center gap-0.5 h-14 text-xs font-semibold"
            style={{ color: active ? 'var(--accent)' : 'var(--text-tertiary)' }}
          >
            <Icon className="w-5 h-5" />
            {label}
            {id === 'break' && breakContext && (
              <span className="absolute top-2 left-1/2 ml-2 w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} aria-label="break en direct" />
            )}
          </button>
        )
      })}
      <button onClick={() => setPaletteOpen(true)} className="flex flex-col items-center justify-center gap-0.5 h-14 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
        <Search className="w-5 h-5" />
        Chercher
      </button>
    </nav>
  )
}

function Shell() {
  const { selectedSport, analysisData, activeView, theme } = useAppStore()
  const [navOpen, setNavOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  useUrlSync()
  useCatalogSync()
  useAutoAnalysis()

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

  return (
    <div className="flex h-dvh w-screen overflow-hidden" data-sport={selectedSport} data-theme={theme} style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <NavRail mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
      <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto flex flex-col md:pb-20">
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
