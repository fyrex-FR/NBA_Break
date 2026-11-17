import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ArrowLeft, ChevronRight, Loader2, PenLine, Layers } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { fetchCatalogPlayer, fetchCatalogTeam, fetchCatalogTeams, searchCatalogPlayers } from '../../api/client'
import { useBoxGuideIndex, toEntry } from '../../hooks/useCollections'
import { BoxImage } from '../shared/CollectionCard'
import { EmptyState } from '../ui/primitives'
import { formatCount, plural } from '../../utils/checklists'
import type { CatalogCollectionRow, CatalogCounts, ViewName } from '../../types'

/* L'index du catalogue se prépare côté serveur au démarrage : tant qu'il n'est pas
   prêt, l'API répond 503 et on réessaie quelques fois. */
const RETRY = {
  retry: (n: number, err: Error) => n < 8 && /préparation|503/i.test(err.message),
  retryDelay: 4000,
  staleTime: 10 * 60 * 1000,
}

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** « 51 autos · 10 memo · 18 case hits » (autos = autos + auto/memo). */
function CountsLine({ c }: { c: CatalogCounts }) {
  const autos = c.auto + c.auto_mem
  const parts: [number, string, string][] = [
    [c.logoman, 'Logoman', 'var(--cat-logoman)'],
    [c.case_hit, c.case_hit > 1 ? 'case hits' : 'case hit', 'var(--cat-case)'],
    [autos, autos > 1 ? 'autos' : 'auto', 'var(--cat-auto)'],
    [c.mem, 'memo', 'var(--cat-mem)'],
  ]
  const shown = parts.filter(([n]) => n > 0)
  if (shown.length === 0) {
    return <span style={{ color: 'var(--text-quaternary)' }}>{formatCount(c.cards)} cartes, aucun hit</span>
  }
  return (
    <span className="inline-flex flex-wrap gap-x-2.5 gap-y-0.5">
      {shown.map(([n, label, color]) => (
        <span key={label} className="whitespace-nowrap">
          <b className="font-stat" style={{ color }}>{formatCount(n)}</b> {label}
        </span>
      ))}
    </span>
  )
}

function IndexLoading() {
  return (
    <div className="flex items-center gap-2 text-sm py-6" style={{ color: 'var(--text-tertiary)' }}>
      <Loader2 className="w-4 h-4 animate-spin" /> Préparation de l’index de tout le catalogue…
    </div>
  )
}

/** Collections d'un joueur ou d'une équipe, par saison ; un toucher ouvre la collection sur sa fiche. */
function CollectionsBySeason({ rows, onOpen, onOpenSeason }: {
  rows: CatalogCollectionRow[]
  onOpen: (id: string) => void
  onOpenSeason: (ids: string[]) => void
}) {
  const availableChecklists = useAppStore((s) => s.availableChecklists)
  const { index } = useBoxGuideIndex()
  const byId = useMemo(() => new Map(availableChecklists.map((c) => [c.checklist_id, c])), [availableChecklists])
  const seasons = useMemo(() => {
    const m = new Map<string, CatalogCollectionRow[]>()
    for (const r of rows) m.set(r.season || '—', [...(m.get(r.season || '—') ?? []), r])
    return [...m.entries()]
  }, [rows])

  return (
    <div className="space-y-6">
      {seasons.map(([season, list]) => {
        const withHits = list.filter((r) => r.premium > 0).map((r) => r.checklist_id).filter((id) => byId.has(id))
        return (
          <section key={season}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {season} <span className="text-xs font-normal num" style={{ color: 'var(--text-quaternary)' }}>{plural(list.length, 'collection')}</span>
              </h3>
              {withHits.length > 1 && withHits.length <= 12 && (
                <button onClick={() => onOpenSeason(withHits)} className="ui-btn ui-btn-ghost ui-btn-sm" title="Ouvrir ensemble les collections de la saison où il y a des hits">
                  <Layers className="w-3.5 h-3.5" /> Croiser les {withHits.length}
                </button>
              )}
            </div>
            <ul className="grid gap-2 @xl:grid-cols-2">
              {list.map((r) => {
                const cl = byId.get(r.checklist_id)
                const entry = cl ? toEntry(cl, index.get(r.checklist_id)) : null
                return (
                  <li key={r.checklist_id}>
                    <button
                      type="button"
                      disabled={!cl}
                      onClick={() => onOpen(r.checklist_id)}
                      className="ui-card ui-row-hover w-full text-left p-2.5 flex gap-3 items-center"
                    >
                      <BoxImage src={entry?.guide?.cover_image} className="w-[52px] h-[52px]" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{entry?.name ?? r.name}</span>
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}><CountsLine c={r} /></span>
                        {r.top_players && r.top_players.length > 0 && (
                          <span className="block text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                            {r.top_players.map((p) => p.name).join(' · ')}
                          </span>
                        )}
                      </span>
                      {cl && <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function useOpenOn(view: ViewName, target: 'player' | 'team', name: string) {
  return {
    one: (id: string) => {
      const s = useAppStore.getState()
      if (target === 'player') s.setTargetPlayer(name)
      else s.setTargetTeam(name)
      s.setSelectedChecklistIds([id])
      s.setActiveView(view)
    },
    many: (ids: string[]) => {
      const s = useAppStore.getState()
      if (target === 'player') s.setTargetPlayer(name)
      else s.setTargetTeam(name)
      s.setSelectedChecklistIds(ids)
      s.setActiveView(view)
    },
  }
}

/* ── Qui a signé ? ──────────────────────────────────────────────────────── */

export function CatalogPlayersView() {
  const sport = useAppStore((s) => s.selectedSport)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const q = useDebounced(query.trim())

  const search = useQuery({
    queryKey: ['catalog-players', sport, q],
    queryFn: () => searchCatalogPlayers(sport, q),
    enabled: q.length >= 2 && !picked,
    ...RETRY,
  })

  if (picked) return <PlayerCollections name={picked} onBack={() => setPicked(null)} />

  return (
    <div className="max-w-3xl">
      <label className="relative block mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-quaternary)' }} />
        <input
          autoFocus
          className="ui-input !pl-9 w-full"
          placeholder="Wembanyama, Flagg, LeBron…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Chercher un joueur dans toutes les collections"
        />
      </label>

      {q.length < 2 ? (
        <EmptyState icon={PenLine} title="Qui a signé ?">
          Tape un nom : tu vois dans quelles collections il a des autos, des memo et des case hits, saison par saison.
        </EmptyState>
      ) : search.isLoading || (search.isError && search.failureCount < 8 && /préparation|503/i.test(String(search.error))) ? (
        <IndexLoading />
      ) : search.isError ? (
        <EmptyState icon={PenLine} title="Recherche indisponible">L’index du catalogue n’a pas pu être chargé.</EmptyState>
      ) : (search.data?.players.length ?? 0) === 0 ? (
        <EmptyState icon={Search} title="Aucun joueur">Personne ne correspond à « {q} » dans le catalogue.</EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {search.data!.players.map((p) => (
            <li key={p.name}>
              <button type="button" onClick={() => setPicked(p.name)} className="ui-card ui-row-hover w-full text-left px-3.5 py-2.5 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                  <span className="block text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {p.team} · {plural(p.collections, 'collection')}
                  </span>
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}><CountsLine c={p.totals} /></span>
                </span>
                <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PlayerCollections({ name, onBack }: { name: string; onBack: () => void }) {
  const sport = useAppStore((s) => s.selectedSport)
  const { data, isLoading, isError } = useQuery({ queryKey: ['catalog-player', sport, name], queryFn: () => fetchCatalogPlayer(sport, name), ...RETRY })
  const open = useOpenOn('🔍 Analyse Joueur', 'player', name)
  return (
    <div className="@container max-w-4xl">
      <button type="button" onClick={onBack} className="ui-btn ui-btn-ghost ui-btn-sm -ml-2 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> Autre joueur
      </button>
      {isLoading ? <IndexLoading /> : isError || !data ? (
        <EmptyState icon={PenLine} title="Joueur introuvable" />
      ) : (
        <>
          <h2 className="text-[22px] leading-7 font-bold" style={{ color: 'var(--text-primary)' }}>{data.name}</h2>
          <p className="text-sm mb-1" style={{ color: 'var(--text-tertiary)' }}>{data.team} · {plural(data.collections.length, 'collection')}</p>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}><CountsLine c={data.totals} /></p>
          <CollectionsBySeason rows={data.collections} onOpen={open.one} onOpenSeason={open.many} />
        </>
      )}
    </div>
  )
}

/* ── Équipes, toutes collections ────────────────────────────────────────── */

export function CatalogTeamsView() {
  const sport = useAppStore((s) => s.selectedSport)
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const { data, isLoading, isError, failureCount } = useQuery({ queryKey: ['catalog-teams', sport], queryFn: () => fetchCatalogTeams(sport), ...RETRY })

  const teams = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (data?.teams ?? []).filter((t) => t.totals.premium > 0 && (!f || t.name.toLowerCase().includes(f)))
  }, [data, filter])

  if (picked) return <TeamCollections name={picked} onBack={() => setPicked(null)} />

  return (
    <div className="@container max-w-4xl">
      <label className="relative block mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-quaternary)' }} />
        <input className="ui-input !pl-9 w-full" placeholder="Filtrer les équipes…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrer les équipes" />
      </label>
      {isLoading || (isError && failureCount < 8) ? <IndexLoading /> : isError ? (
        <EmptyState icon={Layers} title="Indisponible">L’index du catalogue n’a pas pu être chargé.</EmptyState>
      ) : (
        <ul className="grid gap-2 @xl:grid-cols-2">
          {teams.map((t) => (
            <li key={t.name}>
              <button type="button" onClick={() => setPicked(t.name)} className="ui-card ui-row-hover w-full text-left px-3.5 py-2.5 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}><CountsLine c={t.totals} /></span>
                </span>
                <span className="text-xs num flex-shrink-0" style={{ color: 'var(--text-quaternary)' }}>{t.collections}</span>
                <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TeamCollections({ name, onBack }: { name: string; onBack: () => void }) {
  const sport = useAppStore((s) => s.selectedSport)
  const { data, isLoading, isError } = useQuery({ queryKey: ['catalog-team', sport, name], queryFn: () => fetchCatalogTeam(sport, name), ...RETRY })
  const open = useOpenOn('🛡️ Analyse Équipe', 'team', name)
  // Les collections où l'équipe a le plus de cartes qui comptent, saison par saison.
  const rows = useMemo(() => [...(data?.collections ?? [])].sort((a, b) =>
    (b.season || '').localeCompare(a.season || '') || b.premium - a.premium), [data])
  return (
    <div className="@container max-w-4xl">
      <button type="button" onClick={onBack} className="ui-btn ui-btn-ghost ui-btn-sm -ml-2 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> Autre équipe
      </button>
      {isLoading ? <IndexLoading /> : isError || !data ? (
        <EmptyState icon={Layers} title="Équipe introuvable" />
      ) : (
        <>
          <h2 className="text-[22px] leading-7 font-bold" style={{ color: 'var(--text-primary)' }}>{data.name}</h2>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}><CountsLine c={data.totals} /></p>
          <CollectionsBySeason rows={rows} onOpen={open.one} onOpenSeason={open.many} />
        </>
      )}
    </div>
  )
}
