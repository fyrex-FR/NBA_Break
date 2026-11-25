import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Download, ArrowRight, Loader2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { sameIds } from '../../hooks/useRunAnalysis'
import { useBoxGuideIndex, toEntry } from '../../hooks/useCollections'
import { fetchCatalogPlayer } from '../../api/client'
import {
  FRENCH_PLAYERS, FAMILY_LABELS, buildFrenchies, frenchFamilyGroups, playersFromCards, playersFromCatalog,
  sortFrench, teamsFromPlayers, type FrenchCollection, type FrenchCounts, type FrenchField, type FrenchPlayer,
  type FrenchSeries, type FrenchTeam,
} from '../../utils/frenchies'
import { formatCount, plural, prettyChecklist } from '../../utils/checklists'
import { Segmented } from '../ui/primitives'
import type { ViewName } from '../../types'
import './FrenchiesView.css'

type Scope = 'catalog' | 'open'
type Mode = 'player' | 'team' | 'set'

const COLUMNS: { field: FrenchField; label: string; mobile: boolean }[] = [
  { field: 'autos', label: 'Autos', mobile: true },
  { field: 'memo', label: 'Memo', mobile: true },
  { field: 'caseHits', label: 'Case', mobile: true },
  { field: 'cards', label: 'Cartes', mobile: false },
]
const FIELD_WORD: Record<FrenchField, string> = { autos: 'autos', memo: 'memo', caseHits: 'case hits', cards: 'cartes' }

/* L'index du catalogue se prépare côté serveur : tant qu'il répond 503, on réessaie. */
const CATALOG_QUERY = {
  retry: (n: number, err: Error) => n < 8 && /préparation|503/i.test(err.message),
  retryDelay: 4000,
  staleTime: 10 * 60 * 1000,
}

/**
 * Frenchies : les joueurs français, leurs autos, memo et case hits, et les
 * équipes qui les portent. Sur tout le catalogue (une saison à la fois) ou sur
 * les collections ouvertes, où s'ajoute le détail set par set.
 */
export function FrenchiesView() {
  const { analysisData, selectedSport, selectedChecklistIds, analyzedChecklistIds } = useAppStore()
  const openReady = !!analysisData && selectedChecklistIds.length > 0 && sameIds(selectedChecklistIds, analyzedChecklistIds)
  // Sans choix : collections ouvertes → leur tableau par set (le parcours d'origine) ; sinon tout le catalogue.
  const [scopePick, setScope] = useState<Scope | undefined>(undefined)
  const [modePick, setMode] = useState<Mode | undefined>(undefined)
  const [seasonPick, setSeason] = useState<string | undefined>(undefined)
  const [sortBy, setSortBy] = useState<FrenchField>('autos')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const scope: Scope = (scopePick ?? (openReady ? 'open' : 'catalog')) === 'open' && openReady ? 'open' : 'catalog'
  const wanted: Mode = modePick ?? (scope === 'open' ? 'set' : 'player')
  const mode: Mode = wanted === 'set' && scope !== 'open' ? 'player' : wanted

  const queries = useQueries({
    queries: FRENCH_PLAYERS.map((name) => ({
      queryKey: ['catalog-player', selectedSport, name],
      queryFn: () => fetchCatalogPlayer(selectedSport, name),
      enabled: selectedSport === 'nba',
      ...CATALOG_QUERY,
    })),
  })
  const loading = scope === 'catalog' && queries.some((q) => q.isLoading)
  const failed = scope === 'catalog' && !loading && queries.every((q) => q.isError)
  const dataKey = queries.map((q) => q.dataUpdatedAt).join()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const details = useMemo(() => queries.flatMap((q) => (q.data ? [q.data] : [])), [dataKey])

  // Saisons du catalogue ; par défaut la plus récente où un Frenchy a des autos.
  const seasons = useMemo(() => {
    const autos = new Map<string, number>()
    for (const d of details) for (const r of d.collections) autos.set(r.season, (autos.get(r.season) ?? 0) + r.auto + r.auto_mem)
    const list = [...autos.keys()].filter(Boolean).sort((a, b) => b.localeCompare(a))
    return { list, fallback: list.find((s) => (autos.get(s) ?? 0) > 0) ?? list[0] ?? '' }
  }, [details])
  const season = seasonPick ?? seasons.fallback
  const seasonFilter = season === 'all' ? null : season

  const players = useMemo<FrenchPlayer[]>(
    () => scope === 'open' ? playersFromCards(analysisData!.cards) : playersFromCatalog(details, seasonFilter),
    [scope, analysisData, details, seasonFilter],
  )
  const teams = useMemo(() => teamsFromPlayers(players), [players])
  const series = useMemo(() => scope === 'open' ? buildFrenchies(analysisData!.cards) : [], [scope, analysisData])

  if (selectedSport !== 'nba') {
    return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Frenchies est disponible pour le basket (NBA).</p>
  }

  const total = players.reduce((t, p) => ({ autos: t.autos + p.autos, memo: t.memo + p.memo, caseHits: t.caseHits + p.caseHits }), { autos: 0, memo: 0, caseHits: 0 })
  const where = scope === 'open'
    ? `dans ${selectedChecklistIds.length > 1 ? `les ${selectedChecklistIds.length} collections ouvertes` : 'la collection ouverte'}`
    : seasonFilter ? `en ${seasonFilter}` : 'sur toutes les saisons'
  const reset = () => setOpenKey(null)

  return (
    <section aria-label="Frenchies" className={mode === 'set' ? undefined : 'max-w-4xl'}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Segmented<Scope>
          value={scope}
          onChange={(s) => { setScope(s); reset() }}
          ariaLabel="Source"
          options={[
            { value: 'catalog', label: 'Tout le catalogue' },
            ...(openReady ? [{ value: 'open' as Scope, label: 'Ouvertes', count: selectedChecklistIds.length }] : []),
          ]}
        />
        {scope === 'catalog' && seasons.list.length > 0 && (
          <select className="ui-select" value={season} onChange={(e) => { setSeason(e.target.value); reset() }} aria-label="Saison">
            {seasons.list.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="all">Toutes saisons</option>
          </select>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <Segmented<Mode>
          value={mode}
          onChange={(m) => { setMode(m); reset() }}
          ariaLabel="Regrouper"
          options={[
            { value: 'player', label: 'Par joueur' },
            { value: 'team', label: 'Par équipe' },
            ...(scope === 'open' ? [{ value: 'set' as Mode, label: 'Par set' }] : []),
          ]}
        />
        {scope === 'open' && <ExportButton series={series} />}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm py-6" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Lecture de tout le catalogue…
        </p>
      ) : failed ? (
        <p role="alert" className="text-sm py-6" style={{ color: 'var(--text-secondary)' }}>L’index du catalogue n’a pas pu être chargé. Réessaie dans un instant.</p>
      ) : (
        <>
          <p className="text-[15px] leading-6 mb-4" style={{ color: 'var(--text-secondary)' }}>
            <b style={{ color: 'var(--text-primary)' }}>{plural(players.length, 'Frenchy', 'Frenchies')}</b> {where} :{' '}
            <b className="font-stat" style={{ color: 'var(--text-primary)' }}>{formatCount(total.autos)}</b> autos,{' '}
            <b className="font-stat" style={{ color: 'var(--text-primary)' }}>{formatCount(total.memo)}</b> memo,{' '}
            <b className="font-stat" style={{ color: 'var(--text-primary)' }}>{formatCount(total.caseHits)}</b> case hits.
          </p>

          {mode === 'set' ? <SetTables series={series} /> : mode === 'team' ? (
            <StatTable
              rows={sortFrench(teams, sortBy)}
              head="Équipe"
              sortBy={sortBy}
              onSort={(f) => { setSortBy(f); reset() }}
              openKey={openKey}
              onToggle={setOpenKey}
              sub={(t) => t.players.map((p) => lastName(p.name)).join(', ')}
              empty="Aucun Frenchy sur cette période."
              detail={(t, rank, n) => <TeamDetail team={t} rank={rank} count={n} sortBy={sortBy} scope={scope} showSeason={!seasonFilter} />}
            />
          ) : (
            <StatTable
              rows={sortFrench(players, sortBy)}
              head="Joueur"
              sortBy={sortBy}
              onSort={(f) => { setSortBy(f); reset() }}
              openKey={openKey}
              onToggle={setOpenKey}
              sub={(p) => [p.team, plural(p.collections.length, 'collection')].filter(Boolean).join(' · ')}
              empty="Aucun Frenchy sur cette période."
              detail={(p, rank, n) => <PlayerDetail player={p} rank={rank} count={n} sortBy={sortBy} scope={scope} showSeason={!seasonFilter} />}
            />
          )}

          <p className="text-xs mt-5 leading-5" style={{ color: 'var(--text-tertiary)' }}>
            Liste vérifiée de {FRENCH_PLAYERS.length} joueurs français, actuels et historiques : certains peuvent manquer.
            Autos = autos et auto-memo ; case hits = case hits et Logoman ; parallèles compris.
          </p>
        </>
      )}
    </section>
  )
}

function lastName(name: string) {
  return name.split(' ').slice(1).join(' ') || name
}

/* ── Tableau de stats triable, une ligne dépliable ─────────────────────── */

function StatTable<T extends FrenchCounts & { name: string }>({ rows, head, sortBy, onSort, openKey, onToggle, sub, detail, empty }: {
  rows: T[]
  head: string
  sortBy: FrenchField
  onSort: (f: FrenchField) => void
  openKey: string | null
  onToggle: (key: string | null) => void
  sub: (row: T) => string
  detail: (row: T, rank: number, count: number) => ReactNode
  empty: string
}) {
  if (rows.length === 0) return <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>{empty}</p>
  const max = rows[0]?.[sortBy] || 1
  return (
    <table className="w-full border-collapse" aria-label={`Frenchies par ${head.toLowerCase()}`}>
      <thead>
        <tr className="ui-eyebrow text-left" style={{ borderBottom: '2px solid var(--rule-heavy)' }}>
          <th scope="col" className="py-1.5 w-9 font-bold text-center">#</th>
          <th scope="col" className="py-1.5 font-bold">{head}</th>
          {COLUMNS.map((c) => (
            <th key={c.field} scope="col" className={`py-0 w-[56px] text-right font-bold ${c.mobile ? '' : 'hidden sm:table-cell'}`} aria-sort={sortBy === c.field ? 'descending' : undefined}>
              <button
                type="button"
                onClick={() => onSort(c.field)}
                className="w-full min-h-11 py-1.5 pl-2 text-right font-bold uppercase"
                style={sortBy === c.field
                  ? { color: 'var(--text-primary)', letterSpacing: 'inherit', textDecoration: 'underline', textDecorationColor: 'var(--accent)', textDecorationThickness: 2, textUnderlineOffset: 4 }
                  : { letterSpacing: 'inherit' }}
                title={`Trier par ${FIELD_WORD[c.field]}`}
              >
                {c.label}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const open = r.name === openKey
          return (
            <Fragment key={r.name}>
              <tr
                onClick={() => onToggle(open ? null : r.name)}
                className="cursor-pointer"
                style={{
                  borderBottom: '1px solid var(--border-standard)',
                  background: open ? 'var(--text-primary)' : undefined,
                  color: open ? 'var(--bg-primary)' : undefined,
                }}
              >
                <td className="py-2.5 align-top"><span className="inline-flex justify-center w-7 text-[13px] leading-6 font-stat" style={{ color: open ? 'inherit' : 'var(--text-tertiary)' }}>{i + 1}</span></td>
                <td className="py-2.5 pr-2 min-w-0 max-w-0 w-full">
                  <button
                    type="button"
                    className="block w-full text-left text-[15px] font-semibold truncate"
                    aria-expanded={open}
                    onClick={(e) => { e.stopPropagation(); onToggle(open ? null : r.name) }}
                  >
                    {r.name}
                  </button>
                  <span className="block text-xs truncate" style={{ color: open ? 'inherit' : 'var(--text-tertiary)', opacity: open ? 0.75 : 1 }}>{sub(r)}</span>
                  {!open && <span aria-hidden className="block h-[3px] mt-1" style={{ width: `${Math.max(1, (100 * r[sortBy]) / max)}%`, background: 'var(--accent)', opacity: 0.85 }} />}
                </td>
                {COLUMNS.map((c) => (
                  <td
                    key={c.field}
                    className={`py-2.5 text-right font-stat text-[14px] align-top ${c.mobile ? '' : 'hidden sm:table-cell'}`}
                    style={{ fontWeight: sortBy === c.field ? 800 : undefined, color: !open && sortBy !== c.field ? 'var(--text-secondary)' : undefined }}
                  >
                    {formatCount(r[c.field])}
                  </td>
                ))}
              </tr>
              {open && (
                <tr>
                  <td colSpan={2 + COLUMNS.length} className="p-0">
                    <div className="px-1 py-3.5" style={{ borderBottom: '2px solid var(--rule-heavy)' }}>{detail(r, i + 1, rows.length)}</div>
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

/* ── Détails dépliés ───────────────────────────────────────────────────── */

function rankLine(rank: number, count: number, noun: string, sortBy: FrenchField) {
  return <><b style={{ color: 'var(--text-primary)' }}>{rank}<sup>{rank === 1 ? 'er' : 'e'}</sup> sur {count}</b> {noun} en {FIELD_WORD[sortBy]}.</>
}

/** Ouvre une collection sur la fiche d'un joueur ou d'une équipe. */
function useOpenOn() {
  return (view: ViewName, target: { player?: string; team?: string }, ids?: string[]) => {
    const s = useAppStore.getState()
    if (target.player) s.setTargetPlayer(target.player)
    if (target.team) s.setTargetTeam(target.team)
    if (ids) s.setSelectedChecklistIds(ids)
    s.setActiveView(view)
  }
}

function PlayerDetail({ player, rank, count, sortBy, scope, showSeason }: { player: FrenchPlayer; rank: number; count: number; sortBy: FrenchField; scope: Scope; showSeason: boolean }) {
  const openOn = useOpenOn()
  const names = useCollectionName()
  const best = player.collections[0]
  return (
    <>
      <p className="text-[15px] leading-6" style={{ color: 'var(--text-secondary)' }}>
        {rankLine(rank, count, 'Frenchies', sortBy)}
        {player.team && <> Chez <b style={{ color: 'var(--text-primary)' }}>{player.team}</b>.</>}
        {best && best.autos > 0 && <> Le plus d’autos dans {names.name(best.id, best.name)} ({best.autos}).</>}
      </p>
      <CollectionTable
        rows={player.collections}
        showSeason={showSeason}
        onOpen={scope === 'catalog' ? (id) => openOn('🔍 Analyse Joueur', { player: player.name }, [id]) : undefined}
      />
      {scope === 'open' && (
        <button type="button" className="ui-btn ui-btn-primary w-full sm:w-auto mt-3" onClick={() => openOn('🔍 Analyse Joueur', { player: player.name })}>
          Voir la fiche joueur <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </>
  )
}

function TeamDetail({ team, rank, count, sortBy, scope, showSeason }: { team: FrenchTeam; rank: number; count: number; sortBy: FrenchField; scope: Scope; showSeason: boolean }) {
  const openOn = useOpenOn()
  return (
    <>
      <p className="text-[15px] leading-6" style={{ color: 'var(--text-secondary)' }}>
        {rankLine(rank, count, 'équipes', sortBy)} Portée par {team.players.map((p) => `${p.name} (${p.autos} auto${p.autos > 1 ? 's' : ''})`).join(', ')}.
      </p>
      {team.players.length > 1 && (
        <table className="w-full mt-3 text-[13px]">
          <thead>
            <tr className="ui-eyebrow" style={{ borderBottom: '1px solid var(--border-standard)' }}>
              <th scope="col" className="text-left py-1 font-bold">Joueur</th>
              <th scope="col" className="text-right py-1 font-bold w-14">Autos</th>
              <th scope="col" className="text-right py-1 font-bold w-14">Memo</th>
              <th scope="col" className="text-right py-1 font-bold w-14">Case</th>
            </tr>
          </thead>
          <tbody>
            {team.players.map((p) => (
              <tr key={p.name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="py-1.5" style={{ color: 'var(--text-primary)' }}>{p.name}</td>
                <td className="py-1.5 text-right font-stat">{formatCount(p.autos)}</td>
                <td className="py-1.5 text-right font-stat">{formatCount(p.memo)}</td>
                <td className="py-1.5 text-right font-stat">{formatCount(p.caseHits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <CollectionTable
        rows={team.collections}
        showSeason={showSeason}
        onOpen={scope === 'catalog' ? (id) => openOn('🛡️ Analyse Équipe', { team: team.name }, [id]) : undefined}
      />
      {scope === 'open' && (
        <button type="button" className="ui-btn ui-btn-primary w-full sm:w-auto mt-3" onClick={() => openOn('🛡️ Analyse Équipe', { team: team.name })}>
          Voir l’équipe <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </>
  )
}

/** Nom court d'une collection (celui du catalogue), sinon le nom de la checklist nettoyé. */
function useCollectionName() {
  const availableChecklists = useAppStore((s) => s.availableChecklists)
  const { index } = useBoxGuideIndex()
  const byId = useMemo(() => new Map(availableChecklists.map((c) => [c.checklist_id, c])), [availableChecklists])
  return {
    available: (id: string) => byId.has(id),
    name: (id: string, raw: string) => {
      const cl = byId.get(id)
      return cl ? toEntry(cl, index.get(id)).name : prettyChecklist(raw)
    },
  }
}

/** Collections d'un joueur ou d'une équipe, autos d'abord ; en catalogue, un toucher ouvre la collection. */
function CollectionTable({ rows, showSeason, onOpen }: { rows: FrenchCollection[]; showSeason: boolean; onOpen?: (id: string) => void }) {
  const names = useCollectionName()
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => sortFrench(rows, 'autos'), [rows])
  const shown = all ? sorted : sorted.slice(0, 6)
  return (
    <>
      <table className="w-full mt-3 text-[13px]">
        <thead>
          <tr className="ui-eyebrow" style={{ borderBottom: '1px solid var(--border-standard)' }}>
            <th scope="col" className="text-left py-1 font-bold">Collection</th>
            <th scope="col" className="text-right py-1 font-bold w-14">Autos</th>
            <th scope="col" className="text-right py-1 font-bold w-14">Memo</th>
            <th scope="col" className="text-right py-1 font-bold w-14">Case</th>
            {onOpen && <th scope="col" className="w-11"><span className="sr-only">Ouvrir</span></th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => {
            const name = names.name(c.id, c.name)
            return (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="py-1.5 pr-2" style={{ color: 'var(--text-primary)' }}>
                  {name}
                  {showSeason && c.season && <span className="ml-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.season}</span>}
                </td>
                <td className="py-1.5 text-right font-stat" style={{ fontWeight: c.autos > 0 ? 700 : 400 }}>{formatCount(c.autos)}</td>
                <td className="py-1.5 text-right font-stat">{formatCount(c.memo)}</td>
                <td className="py-1.5 text-right font-stat">{formatCount(c.caseHits)}</td>
                {onOpen && (
                  <td className="text-right">
                    {names.available(c.id) && (
                      <button type="button" onClick={() => onOpen(c.id)} className="ui-btn ui-btn-ghost ui-btn-icon" aria-label={`Ouvrir ${name}`} title="Ouvrir la collection">
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {sorted.length > shown.length && (
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm mt-2" onClick={() => setAll(true)}>
          Voir les {sorted.length - shown.length} autres
        </button>
      )}
    </>
  )
}

/* ── Par set (collections ouvertes) ──────────────────────────────────────
   Tableau croisé joueur × set, identique à la première version (et au fichier
   Excel exporté) : un ami gère ses Frenchies avec ce format. Ne pas le refondre. */

function SetTables({ series }: { series: FrenchSeries[] }) {
  return (
    <>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        × indique une présence dans le set pour la famille indiquée ; un même set peut apparaître dans plusieurs familles. Auto et Memo comptent les lignes de checklist (selon Hits), parallèles compris ; une carte auto-memo compte dans les deux.
      </p>
      {series.length === 0 && <p>Aucune carte dans les checklists ouvertes.</p>}
      <div className="space-y-6">
        {series.map((group) => (
          <section key={group.id} aria-label={prettyChecklist(group.name)}>
            <h3 className="font-semibold mb-2">{prettyChecklist(group.name)}</h3>
            {group.players.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Aucun joueur de la liste vérifiée dans cette checklist.</p> : (
              <>
                <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>Fais défiler le tableau horizontalement pour voir tous les sets.</p>
                <div className="frenchies-scroll" role="region" aria-label={`Tableau ${prettyChecklist(group.name)}`} tabIndex={0}>
                  <table className="frenchies-table">
                    <thead>
                      <tr><th scope="col" rowSpan={2} className="frenchies-player">Joueur</th>{frenchFamilyGroups(group.columns).map((family) => <th scope="colgroup" colSpan={family.columns.length} className="frenchies-family" key={family.start}>{FAMILY_LABELS[family.family]}</th>)}<th scope="col" rowSpan={2} className="frenchies-boundary">Auto</th><th scope="col" rowSpan={2}>Memo</th></tr>
                      <tr>{group.columns.map((column, i) => <th scope="col" className={i === 0 || group.columns[i - 1].family !== column.family ? 'frenchies-boundary' : undefined} key={column.key}>{column.name}</th>)}</tr>
                    </thead>
                    <tbody>{group.players.map((player) => (
                      <tr key={player.name}><th scope="row" className="frenchies-player">{player.name}</th>{group.columns.map((column, i) => <td className={i === 0 || group.columns[i - 1].family !== column.family ? 'frenchies-boundary' : undefined} key={column.key}>{player.sets.has(column.key) ? '×' : ''}</td>)}<td className="frenchies-boundary">{player.auto}</td><td>{player.memo}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        ))}
      </div>
    </>
  )
}

function ExportButton({ series }: { series: FrenchSeries[] }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  async function exportExcel() {
    setError('')
    setExporting(true)
    try {
      const { buildFrenchiesWorkbook } = await import('../../utils/frenchiesExport')
      const buffer = await buildFrenchiesWorkbook(series)
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'frenchies.xlsx'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setError('L’export Excel a échoué. Réessaie.')
    } finally {
      setExporting(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>{error}</span>}
      <button type="button" className="ui-btn ui-btn-secondary" onClick={exportExcel} disabled={!series.length || exporting}>
        <Download size={16} /> {exporting ? 'Export en cours…' : 'Exporter en Excel'}
      </button>
    </span>
  )
}
