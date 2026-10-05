import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Radio, Bookmark, Play, Check, Plus, Trophy, Dices, Target, Wand2, ArrowRight, Loader2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { fetchPresets } from '../../api/client'
import { useRunAnalysis } from '../../hooks/useRunAnalysis'
import { HeroDemo } from './HeroDemo'
import { GaugeSpinner } from '../ui/GaugeSpinner'
import { HeroCard } from './HeroCard'
import { useOddsConfig } from '../../hooks/useOddsConfig'
import { formatChecklistName, formatCount, plural, sortChecklists } from '../../utils/checklists'
import type { PresetInfo } from '../../types'

const RECENT_LIMIT = 9

/** Écran d'accueil quand aucune analyse n'est chargée : tout est actionnable. */
export function HomeView() {
  const {
    selectedSport, availableChecklists, selectedChecklistIds, toggleChecklist, setSelectedChecklistIds,
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
      <section className="relative overflow-hidden rounded-3xl px-5 pt-8 pb-10 sm:px-8 md:px-10 md:py-12 mb-6" style={{ background: 'var(--bg-panel)', boxShadow: 'var(--shadow-card)' }}>
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.55]"
          style={{
            backgroundImage: 'radial-gradient(color-mix(in srgb, var(--text-primary) 9%, transparent) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
            maskImage: 'radial-gradient(ellipse at 75% 40%, #000 0%, transparent 65%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 75% 40%, #000 0%, transparent 65%)',
          }}
        />
        <div className="relative grid gap-10 lg:gap-10 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px] items-center">
          <div>
            <div className="inline-flex items-center gap-2 h-7 px-3 rounded-full text-xs font-medium mb-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: 'var(--accent)' }} />
                <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
              </span>
              <span className="num">{formatCount(availableChecklists.length)}</span> checklists disponibles
            </div>
            <h1 className="text-[32px] leading-[1.08] sm:text-[40px] md:text-[46px] font-display" style={{ color: 'var(--text-primary)' }}>
              Ne te fais plus{' '}
              <span className="text-heat">climatiser.</span>
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed max-w-lg" style={{ color: 'var(--text-tertiary)' }}>
              Avant d'acheter un spot, NoClim prend sa température : qui a les autos, les patchs, les case hits… et qui va te laisser avec une base de 2012.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              {count > 0 ? (
                <button onClick={() => runAnalysis({ goTo: '🌍 Vue Globale' })} disabled={isAnalyzing} className="ui-btn ui-btn-primary ui-btn-lg w-full sm:w-auto">
                  {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  Analyser {plural(count, 'checklist')}
                  <span className="num font-normal opacity-80">· {formatCount(selectedRows)} cartes</span>
                </button>
              ) : (
                <button onClick={() => openSelection('catalog')} className="ui-btn ui-btn-primary ui-btn-lg w-full sm:w-auto">
                  <Layers className="w-4 h-4" /> Choisir des checklists
                </button>
              )}
              <button onClick={() => openSelection(count > 0 ? 'catalog' : 'voggt')} className="ui-btn ui-btn-secondary ui-btn-lg flex-1 sm:flex-none">
                {count > 0 ? <><Layers className="w-4 h-4" /> Modifier</> : <><Radio className="w-4 h-4" /> Break Voggt</>}
              </button>
              {count > 0 && (
                <button onClick={() => openSelection('voggt')} className="ui-btn ui-btn-secondary ui-btn-lg flex-1 sm:flex-none">
                  <Radio className="w-4 h-4" /> Break Voggt
                </button>
              )}
            </div>
          </div>
          <div className="relative">
            <HeroDemo sport={selectedSport} checklists={demoChecklists} />
            <HeroCard />
          </div>
        </div>
      </section>

      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Sorties récentes */}
        <section>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Saison {latestYear ?? '…'}</h2>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Les plus grosses checklists de la saison. Coche pour composer ta sélection.</p>
            </div>
            <button onClick={() => openSelection('catalog')} className="ui-btn ui-btn-ghost ui-btn-sm">
              Tout le catalogue <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {recent.length === 0
              ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="ui-skeleton h-[68px] !rounded-xl" />)
              : recent.map((cl) => {
                  const f = formatChecklistName(cl.checklist_name, cl.display_name)
                  const title = f.name.replace(/^\d{4}(-\d{2})?\s+/, '').replace(/\s+Checklist$/i, '')
                  const on = selectedChecklistIds.includes(cl.checklist_id)
                  return (
                    <button
                      key={cl.checklist_id}
                      onClick={() => toggleChecklist(cl.checklist_id)}
                      aria-pressed={on}
                      className="group flex items-center gap-3 text-left rounded-xl px-3.5 py-3 transition-all"
                      style={{
                        background: on ? 'var(--accent-soft)' : 'var(--bg-panel)',
                        boxShadow: on ? '0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--shadow-card)',
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }} title={f.name}>{title}</div>
                        <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          <span className="num">{formatCount(cl.rows)} cartes</span>
                          {oddsChecklistIds.has(cl.checklist_id) && <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}><Target className="w-3 h-3" />odds</span>}
                        </div>
                      </div>
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{
                          background: on ? 'var(--accent)' : 'var(--bg-surface)',
                          color: on ? 'var(--accent-fg)' : 'var(--text-tertiary)',
                          border: on ? 'none' : '1px solid var(--border-standard)',
                        }}
                      >
                        {on ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Plus className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  )
                })}
          </div>
        </section>

        {/* Presets + import */}
        <aside className="space-y-6">
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
                      onClick={() => { setSelectedChecklistIds(p.checklist_ids); runAnalysis({ ids: p.checklist_ids, goTo: '🌍 Vue Globale' }) }}
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
