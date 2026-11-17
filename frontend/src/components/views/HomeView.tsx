import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Bookmark, Play, Radio, Layers, Loader2, Library, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { fetchPresets } from '../../api/client'
import { useRunAnalysis } from '../../hooks/useRunAnalysis'
import { useOddsConfig } from '../../hooks/useOddsConfig'
import { useAllCollections, useOpenCollection, type CollectionEntry } from '../../hooks/useCollections'
import { GaugeSpinner } from '../ui/GaugeSpinner'
import { EmptyState } from '../ui/primitives'
import { CollectionCard } from '../shared/CollectionCard'
import { ReleaseCalendar } from '../shared/ReleaseCalendar'
import { plural } from '../../utils/checklists'
import type { PresetInfo } from '../../types'

/**
 * Accueil = le catalogue des collections. Un toucher ouvre une collection
 * (le parcours principal) ; le calendrier des sorties est à côté.
 */
export function HomeView() {
  const { selectedSport, selectedChecklistIds, openSelection, setActiveView, isAnalyzing } = useAppStore()
  const runAnalysis = useRunAnalysis()
  const { oddsChecklistIds } = useOddsConfig()
  const all = useAllCollections()
  const openCollection = useOpenCollection()
  const [query, setQuery] = useState('')
  const [season, setSeason] = useState('all')

  const seasons = useMemo(() => [...new Set(all.map((e) => e.season).filter(Boolean))], [all])

  const groups = useMemo(() => {
    const q = normalize(query.trim())
    const list = all
      .filter((e) => season === 'all' || e.season === season)
      .filter((e) => !q || normalize(`${e.name} ${e.season}`).includes(q))
    // En recherche : une seule liste. Sinon : par saison, la plus récente d'abord.
    if (q) return [{ season: null as string | null, items: list }]
    const by = new Map<string, CollectionEntry[]>()
    for (const e of list) by.set(e.season, [...(by.get(e.season) ?? []), e])
    return [...by.entries()].map(([s, items]) => ({ season: s as string | null, items }))
  }, [all, query, season])

  const total = groups.reduce((n, g) => n + g.items.length, 0)
  // L'accueil ne s'affiche avec des collections ouvertes que si leur analyse a échoué.
  const failed = selectedChecklistIds.length > 0 && !isAnalyzing

  return (
    <div className="max-w-[1240px] mx-auto">
      <header className="flex items-end justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-[30px] sm:text-[38px] leading-none font-display uppercase" style={{ color: 'var(--text-primary)' }}>
            Collections
          </h1>
          <p className="text-sm mt-2 max-w-xl" style={{ color: 'var(--text-tertiary)' }}>
            Ouvre une collection : qui a les autos, les patchs et les case hits. Ne te fais plus climatiser.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setActiveView('🎲 État du Break')} className="ui-btn ui-btn-secondary">
            <Radio className="w-4 h-4" /> Break Voggt
          </button>
          <button onClick={() => openSelection('catalog')} className="ui-btn ui-btn-secondary" title="Cocher plusieurs collections à croiser">
            <Layers className="w-4 h-4" /> Croiser plusieurs
          </button>
        </div>
      </header>

      {failed && (
        <div className="ui-card px-4 py-3 mb-5 flex items-center gap-3" role="alert">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--warning)' }} />
          <span className="flex-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            L’analyse de {plural(selectedChecklistIds.length, 'collection')} n’a pas abouti.
          </span>
          <button onClick={() => runAnalysis({ goTo: '🌍 Vue Globale' })} className="ui-btn ui-btn-primary ui-btn-sm">
            <Play className="w-3.5 h-3.5" /> Réessayer
          </button>
        </div>
      )}

      <ReleaseCalendar variant="strip" className="lg:hidden mb-5" />

      <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="@container min-w-0">
          <div className="flex items-center gap-2 mb-5">
            <label className="relative flex-1 min-w-0 sm:max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-quaternary)' }} />
              <input
                className="ui-input !pl-9 w-full"
                placeholder="Prizm, Chrome, Select…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Chercher une collection"
              />
            </label>
            <select className="ui-select flex-shrink-0" value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Saison">
              <option value="all">Saisons</option>
              {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => openSelection('catalog')} className="sm:hidden ui-btn ui-btn-secondary ui-btn-icon flex-shrink-0" aria-label="Croiser plusieurs collections">
              <Layers className="w-4 h-4" />
            </button>
          </div>

          {all.length === 0 ? (
            <div className="grid gap-2.5 @xl:grid-cols-2 @4xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => <div key={i} className="ui-skeleton h-[96px] !rounded-2xl" />)}
            </div>
          ) : total === 0 ? (
            <EmptyState icon={Library} title="Aucune collection">Essaie un autre nom ou une autre saison.</EmptyState>
          ) : (
            groups.map((g) => (
              <section key={g.season ?? 'search'} className="mb-7">
                {g.season && (
                  <h2 className="flex items-baseline gap-2 mb-2.5 text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {g.season}
                    <span className="text-xs font-normal num" style={{ color: 'var(--text-quaternary)' }}>{plural(g.items.length, 'collection')}</span>
                  </h2>
                )}
                <div className="grid gap-2.5 @xl:grid-cols-2 @4xl:grid-cols-3">
                  {g.items.map((entry) => (
                    <CollectionCard key={entry.id} entry={entry} hasOdds={oddsChecklistIds.has(entry.id)} onOpen={() => openCollection(entry.id)} />
                  ))}
                </div>
              </section>
            ))
          )}

          <div className="lg:hidden">
            <Presets sport={selectedSport} />
          </div>
        </div>

        <aside className="hidden lg:flex flex-col gap-7 self-start sticky" style={{ top: 'calc(var(--topbar-h) + 20px)' }}>
          <ReleaseCalendar />
          <Presets sport={selectedSport} />
        </aside>
      </div>
    </div>
  )
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Presets enregistrés : rouvrir une combinaison de collections en un toucher. */
function Presets({ sport }: { sport: string }) {
  const { setSelectedChecklistIds, setActiveView, openSelection, isAnalyzing } = useAppStore()
  const { data } = useQuery({ queryKey: ['presets', sport], queryFn: () => fetchPresets(sport), enabled: !!sport })
  const presets: PresetInfo[] = data?.presets || []
  if (presets.length === 0) return null
  return (
    <section>
      <div className="flex items-end justify-between mb-3">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Presets</h2>
        <button onClick={() => openSelection('presets')} className="ui-btn ui-btn-ghost ui-btn-sm">Gérer</button>
      </div>
      <ul className="space-y-1.5">
        {presets.slice(0, 6).map((p) => (
          <li key={p.name}>
            <button
              onClick={() => { setSelectedChecklistIds(p.checklist_ids); setActiveView('🌍 Vue Globale') }}
              disabled={isAnalyzing}
              className="group w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors ui-row-hover"
              style={{ background: 'var(--bg-panel)', boxShadow: 'var(--shadow-card)' }}
            >
              <Bookmark className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                <span className="block text-xs num" style={{ color: 'var(--text-tertiary)' }}>{plural(p.checklist_ids.length, 'collection')}</span>
              </span>
              {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--accent)' }} />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Squelette affiché pendant l'analyse. */
export function AnalysisSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 mb-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>
        <GaugeSpinner size={30} />
        Analyse en cours — on prend la température des collections…
      </div>
      <div className="ui-skeleton h-[92px] !rounded-2xl mb-4" />
      <div className="ui-skeleton h-[120px] !rounded-2xl mb-6" />
      <div className="grid gap-3">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="ui-skeleton h-10" style={{ opacity: 1 - i * 0.1 }} />)}
      </div>
    </div>
  )
}
