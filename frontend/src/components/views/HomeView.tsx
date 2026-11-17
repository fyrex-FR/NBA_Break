import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Library, Radio, Bookmark, Play, Trophy, Dices, Target, Wand2, ArrowRight, Loader2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { fetchPresets } from '../../api/client'
import { useRunAnalysis } from '../../hooks/useRunAnalysis'
import { HeroDemo } from './HeroDemo'
import { CollectionCard } from '../shared/CollectionCard'
import { ReleaseCalendar } from '../shared/ReleaseCalendar'
import { useOpenCollection, useRecentCollections } from '../../hooks/useCollections'
import { GaugeSpinner } from '../ui/GaugeSpinner'
import { HeroCard } from './HeroCard'
import { useOddsConfig } from '../../hooks/useOddsConfig'
import { formatChecklistName, formatCount, plural, sortChecklists } from '../../utils/checklists'
import type { PresetInfo } from '../../types'

const RECENT_LIMIT = 4
const COLLECTIONS_LIMIT = 8

/** Accueil Collections quand rien n'est ouvert : un toucher sur une collection l'ouvre. */
export function HomeView() {
  const {
    selectedSport, availableChecklists, selectedChecklistIds, setSelectedChecklistIds,
    openSelection, setActiveView, isAnalyzing,
  } = useAppStore()
  const runAnalysis = useRunAnalysis()
  const { oddsChecklistIds } = useOddsConfig()

  const { data: presetsData } = useQuery({
    queryKey: ['presets', selectedSport],
    queryFn: () => fetchPresets(selectedSport),
    enabled: !!selectedSport,
  })
  const presets: PresetInfo[] = presetsData?.presets || []

  const latestYear = useMemo(
    () => availableChecklists.map((c) => c.year).filter(Boolean).sort().reverse()[0],
    [availableChecklists],
  )
  const collections = useRecentCollections(COLLECTIONS_LIMIT)
  const openCollection = useOpenCollection()
  const recent = useMemo(
    () => sortChecklists(availableChecklists.filter((c) => c.year === latestYear), 'rows_desc').slice(0, RECENT_LIMIT),
    [availableChecklists, latestYear],
  )

  const demoChecklists = recent.slice(0, 4).map((cl) => ({
    name: formatChecklistName(cl.checklist_name, cl.display_name).name.replace(/^\d{4}(-\d{2})?\s+/, '').replace(/\s+Checklist$/i, ''),
    rows: cl.rows,
    odds: oddsChecklistIds.has(cl.checklist_id),
  }))

  const selectedRows = availableChecklists
    .filter((c) => selectedChecklistIds.includes(c.checklist_id))
    .reduce((s, c) => s + c.rows, 0)
  const count = selectedChecklistIds.length

  return (
    <div className="max-w-[1080px] mx-auto">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl px-5 pt-9 pb-10 sm:px-8 md:px-12 md:py-14 mb-8" style={{ background: 'var(--bg-panel)', boxShadow: 'var(--shadow-card)' }}>
        <div className="relative grid gap-10 lg:gap-10 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px] items-center">
          <div>
            <h1 className="text-[46px] sm:text-[64px] lg:text-[72px] font-display uppercase" style={{ color: 'var(--text-primary)' }}>
              Ne te fais plus <span style={{ color: 'var(--accent)' }}>climatiser.</span>
            </h1>
            <div aria-hidden className="mt-5 h-1 w-24 rounded-full" style={{ background: 'var(--heat-gradient)' }} />
            <p className="mt-5 text-[16px] leading-relaxed max-w-md" style={{ color: 'var(--text-secondary)' }}>
              Avant d'acheter un spot, NoClim prend sa température : qui a les autos, les patchs, les case hits… et qui va te laisser avec une base de 2012.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              {count > 0 ? (
                // Ici seulement si l'analyse automatique a échoué : on propose de réessayer.
                <button onClick={() => runAnalysis({ goTo: '🌍 Vue Globale' })} disabled={isAnalyzing} className="ui-btn ui-btn-primary ui-btn-lg w-full sm:w-auto">
                  {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  Réessayer l’analyse
                  <span className="num font-normal opacity-80">· {formatCount(selectedRows)} cartes</span>
                </button>
              ) : (
                <button onClick={() => openSelection('catalog')} className="ui-btn ui-btn-primary ui-btn-lg w-full sm:w-auto">
                  <Library className="w-4 h-4" /> Choisir une collection
                </button>
              )}
              <button onClick={() => setActiveView('🎲 État du Break')} className="ui-btn ui-btn-secondary ui-btn-lg flex-1 sm:flex-none">
                <Radio className="w-4 h-4" /> Break Voggt
              </button>
            </div>
            <p className="mt-5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <span className="font-stat text-[13px]" style={{ color: 'var(--text-primary)' }}>{formatCount(availableChecklists.length)}</span> collections prêtes à croiser pour ce sport.
            </p>
          </div>
          <div className="relative">
            <HeroDemo sport={selectedSport} checklists={demoChecklists} />
            <HeroCard />
          </div>
        </div>
      </section>

      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Dernières collections : un toucher ouvre la collection */}
        <section className="@container">
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Dernières collections</h2>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Touche une collection pour voir ce qu’elle contient.</p>
            </div>
            <button onClick={() => openSelection('catalog')} className="ui-btn ui-btn-ghost ui-btn-sm">
              Tout le catalogue <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid gap-2.5 @xl:grid-cols-2">
            {collections.length === 0
              ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="ui-skeleton h-[86px] !rounded-2xl" />)
              : collections.map((entry) => (
                  <CollectionCard key={entry.id} entry={entry} hasOdds={oddsChecklistIds.has(entry.id)} onOpen={() => openCollection(entry.id)} />
                ))}
          </div>
        </section>

        {/* Presets + import */}
        <aside className="space-y-6">
          <ReleaseCalendar />
          <section>
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Presets</h2>
              {presets.length > 0 && (
                <button onClick={() => openSelection('presets')} className="ui-btn ui-btn-ghost ui-btn-sm">Gérer</button>
              )}
            </div>
            {presets.length === 0 ? (
              <div className="rounded-xl px-4 py-5 text-sm" style={{ border: '1px dashed var(--border-standard)', color: 'var(--text-tertiary)' }}>
                <Bookmark className="w-4 h-4 mb-2" />
                Enregistre une sélection récurrente pour la relancer en un clic.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {presets.slice(0, 6).map((p) => (
                  <li key={p.name}>
                    <button
                      onClick={() => { setSelectedChecklistIds(p.checklist_ids); setActiveView('🌍 Vue Globale') }}
                      className="group w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors ui-row-hover"
                      style={{ background: 'var(--bg-panel)', boxShadow: 'var(--shadow-card)' }}
                    >
                      <Bookmark className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                        <span className="block text-xs num" style={{ color: 'var(--text-tertiary)' }}>{plural(p.checklist_ids.length, 'checklist')}</span>
                      </span>
                      <Play className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--accent)' }} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl p-4" style={{ background: 'var(--bg-panel)', boxShadow: 'var(--shadow-card)' }}>
            <div className="ui-eyebrow mb-3">Ce que tu obtiens</div>
            <ul className="space-y-3">
              {[
                { icon: Trophy, title: 'Classements', text: 'Joueurs et équipes par volume, premium et case hits.' },
                { icon: Dices, title: 'Simulation de break', text: 'Valeur de chaque spot, par équipe, joueur ou lettre.' },
                { icon: Target, title: 'Odds Topps', text: 'Probabilités par configuration de box.' },
              ].map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-surface)', color: 'var(--accent)' }}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{title}</div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{text}</div>
                  </div>
                </li>
              ))}
            </ul>
            <button onClick={() => setActiveView('📥 Import Intelligent')} className="mt-4 w-full ui-btn ui-btn-secondary">
              <Wand2 className="w-4 h-4" /> Importer une checklist via IA
            </button>
          </section>
        </aside>
      </div>
    </div>
  )
}

/** Squelette affiché pendant l'analyse. */
export function AnalysisSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 mb-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>
        <GaugeSpinner size={30} />
        Analyse en cours — on prend la température des checklists…
      </div>
      <div className="ui-skeleton h-[92px] !rounded-2xl mb-4" />
      <div className="ui-skeleton h-[120px] !rounded-2xl mb-6" />
      <div className="grid gap-3">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="ui-skeleton h-10" style={{ opacity: 1 - i * 0.1 }} />)}
      </div>
    </div>
  )
}
