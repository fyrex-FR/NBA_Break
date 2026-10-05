import { useMemo, useState } from 'react'
import { Radio, X, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Gavel, Layers } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { Segmented } from '../ui/primitives'
import { useMediaQuery, MOBILE_QUERY } from '../../hooks/useMediaQuery'
import type { BreakSpot, CardRecord } from '../../types'
import { CATEGORY_CASE_HIT, CATEGORY_LOGOMAN, HIT_TYPE_AUTO, HIT_TYPE_AUTO_MEM, HIT_TYPE_MEM } from '../../types'

function normKey(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface PlayerStat { name: string; cards: number; premium: number }

interface TeamStat {
  cards: number
  auto: number
  memo: number
  autoMemo: number
  premium: number
  players: Map<string, PlayerStat>
}

interface SpotRow {
  Équipe: string
  Statut: string
  Prix: number | null
  priceSource?: string
  Cartes: number
  Auto: number
  Memo: number
  'A+M': number
  Hits: number
  Premium: number
  topPlayers: PlayerStat[]
  hasData: boolean
  /** Prix par carte premium — plus c'est bas, plus le spot est « rentable » sur le papier. */
  'Prix / premium': number | null
}

type StatusFilter = 'all' | 'available' | 'sold'
type MobileSort = 'Premium' | 'Hits' | 'Prix / premium' | 'Prix' | 'Équipe'

const isSold = (r: SpotRow) => r.Statut.toUpperCase() === 'SOLD'

const columnHelper = createColumnHelper<SpotRow>()

function formatEur(v: number | null | undefined, digits = 0) {
  if (v == null) return '—'
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: digits })} €`
}

function PriceLabel({ row }: { row: SpotRow }) {
  if (row.priceSource === 'start') {
    return <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }} title="Enchère — Voggt n'expose pas le prix final par équipe"><Gavel className="w-3 h-3" />enchère</span>
  }
  if (row.Prix == null) return <span style={{ color: 'var(--text-quaternary)' }}>—</span>
  if (row.priceSource === 'live') {
    return <span style={{ color: 'var(--success)' }} title="Enchère en cours">{formatEur(row.Prix)} <span className="text-[10px] font-semibold uppercase">live</span></span>
  }
  return <span>{formatEur(row.Prix)}</span>
}

function StatusPill({ sold }: { sold: boolean }) {
  return (
    <span
      className="inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-semibold"
      style={{
        background: `color-mix(in srgb, ${sold ? 'var(--text-tertiary)' : 'var(--success)'} 14%, transparent)`,
        color: sold ? 'var(--text-tertiary)' : 'var(--success)',
      }}
    >
      {sold ? 'Vendu' : 'Dispo'}
    </span>
  )
}

export function BreakOverviewView() {
  const { breakContext, analysisData, clearBreakContext, setTargetTeam, setActiveView, openSelection } = useAppStore()
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [mobileSort, setMobileSort] = useState<MobileSort>('Premium')
  const [productsOpen, setProductsOpen] = useState(false)

  const teamStats = useMemo(() => {
    const stats = new Map<string, TeamStat>()
    const cards: CardRecord[] = analysisData?.cards ?? []
    for (const card of cards) {
      const teams = card.Team.split('/').map((t) => t.trim()).filter(Boolean)
      const players = card.Player.split('/').map((p) => p.trim()).filter(Boolean)
      const isHit = [HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM].includes(card['Hit Type'] || '')
      const isPremium = isHit || card.Category === CATEGORY_CASE_HIT || card.Category === CATEGORY_LOGOMAN
      for (const t of teams) {
        const key = normKey(t)
        const cur = stats.get(key) || { cards: 0, auto: 0, memo: 0, autoMemo: 0, premium: 0, players: new Map<string, PlayerStat>() }
        cur.cards += card.Hits
        if (card['Hit Type'] === HIT_TYPE_AUTO) cur.auto += card.Hits
        if (card['Hit Type'] === HIT_TYPE_MEM) cur.memo += card.Hits
        if (card['Hit Type'] === HIT_TYPE_AUTO_MEM) cur.autoMemo += card.Hits
        if (isPremium) cur.premium += card.Hits
        for (const pl of players) {
          const pk = normKey(pl)
          const pe = cur.players.get(pk) || { name: pl, cards: 0, premium: 0 }
          pe.cards += card.Hits
          if (isPremium) pe.premium += card.Hits
          cur.players.set(pk, pe)
        }
        stats.set(key, cur)
      }
    }
    return stats
  }, [analysisData])

  const rows = useMemo<SpotRow[]>(() => {
    const spots: BreakSpot[] = breakContext?.detail.spots ?? []
    return spots.map((spot) => {
      const st = teamStats.get(normKey(spot.team)) || teamStats.get(normKey(spot.name))
      const topPlayers = st
        ? [...st.players.values()].sort((a, b) => b.premium - a.premium || b.cards - a.cards).slice(0, 5)
        : []
      const premium = st?.premium ?? 0
      const price = spot.price_source === 'start' ? null : spot.price_eur
      return {
        Équipe: spot.team || spot.name,
        Statut: spot.status,
        Prix: spot.price_eur,
        priceSource: spot.price_source,
        Cartes: st?.cards ?? 0,
        Auto: st?.auto ?? 0,
        Memo: st?.memo ?? 0,
        'A+M': st?.autoMemo ?? 0,
        Hits: st ? st.auto + st.memo + st.autoMemo : 0,
        Premium: premium,
        topPlayers,
        hasData: !!st,
        'Prix / premium': price != null && premium > 0 ? Math.round((price / premium) * 100) / 100 : null,
      }
    })
  }, [breakContext, teamStats])

  const columns = useMemo(() => [
    columnHelper.accessor('Équipe', { header: 'Équipe', cell: (i) => <span className="font-medium">{i.getValue()}</span> }),
    columnHelper.accessor('Statut', { header: 'Statut', cell: (i) => <StatusPill sold={String(i.getValue()).toUpperCase() === 'SOLD'} /> }),
    columnHelper.accessor('Prix', { header: 'Prix', cell: (i) => <PriceLabel row={i.row.original} /> }),
    columnHelper.accessor('Premium', { header: 'Premium', cell: (i) => <span className="font-semibold" style={{ color: i.getValue() > 0 ? 'var(--accent)' : 'var(--text-quaternary)' }}>{i.getValue()}</span> }),
    columnHelper.accessor('Prix / premium', {
      header: '€ / premium',
      cell: (i) => i.getValue() == null ? <span style={{ color: 'var(--text-quaternary)' }}>—</span> : formatEur(i.getValue(), 2),
    }),
    columnHelper.accessor('Hits', { header: 'Hits', cell: (i) => i.getValue() }),
    columnHelper.accessor('Cartes', { header: 'Cartes', cell: (i) => i.getValue() }),
    columnHelper.accessor('Auto', { header: 'Auto', cell: (i) => i.getValue() }),
    columnHelper.accessor('Memo', { header: 'Memo', cell: (i) => i.getValue() }),
    columnHelper.accessor('A+M', { header: 'A+M', cell: (i) => i.getValue() }),
    columnHelper.display({
      id: 'TopJoueurs',
      header: 'Top joueurs (premium)',
      cell: ({ row }) => <TopPlayers list={row.original.topPlayers} />,
    }),
  ], [])

  if (!breakContext) return null
  const { detail } = breakContext

  const soldCount = rows.filter(isSold).length
  const availableCount = rows.length - soldCount
  const visibleRows = filter === 'all' ? rows : rows.filter((r) => (filter === 'sold') === isSold(r))
  const hasAnyData = rows.some((r) => r.Cartes > 0)
  const unmatched = detail.unmatched_products ?? []
  const mappedCount = detail.detected_products.filter((p) => p.status === 'mapped').length
  const total = detail.total ?? rows.length
  const available = detail.available ?? availableCount
  const soldPct = total > 0 ? ((total - available) / total) * 100 : 0
  const soldEur = Math.round((detail.grille_total - detail.grille_dispo) * 100) / 100

  const covOk = detail.coverage === 'complete'
  const covText = detail.coverage === 'complete'
    ? `${mappedCount} produit${mappedCount > 1 ? 's' : ''} reconnu${mappedCount > 1 ? 's' : ''}`
    : detail.coverage === 'partial'
      ? `${mappedCount} reconnu(s), ${unmatched.length} à vérifier — chiffres partiels`
      : 'Aucun produit reconnu automatiquement'

  function handleRowClick(row: SpotRow) {
    if (!row.hasData) return
    setTargetTeam(row.Équipe)
    setActiveView('🛡️ Analyse Équipe')
  }

  const sortedMobile = [...visibleRows].sort((a, b) => {
    if (mobileSort === 'Équipe') return a.Équipe.localeCompare(b.Équipe)
    if (mobileSort === 'Prix / premium') return (a['Prix / premium'] ?? Infinity) - (b['Prix / premium'] ?? Infinity)
    if (mobileSort === 'Prix') return (b.Prix ?? -1) - (a.Prix ?? -1)
    return (b[mobileSort] as number) - (a[mobileSort] as number)
  })

  return (
    <div>
      {/* En-tête du break */}
      <section className="ui-card p-4 sm:p-5 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' }}>
            <Radio className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="ui-eyebrow" style={{ color: 'var(--danger)' }}>Break Voggt</div>
            <h1 className="text-[17px] sm:text-xl font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{detail.title || 'Break Voggt'}</h1>
          </div>
          <button onClick={clearBreakContext} className="ui-btn ui-btn-ghost ui-btn-sm -mr-1" title="Quitter le mode break">
            <X className="w-4 h-4" /> <span className="hidden sm:inline">Quitter</span>
          </button>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span style={{ color: 'var(--text-tertiary)' }}>
              <b className="num text-[15px]" style={{ color: 'var(--text-primary)' }}>{available}</b> spots dispo sur <span className="num">{total}</span>
            </span>
            <span className="num" style={{ color: 'var(--text-quaternary)' }}>{Math.round(soldPct)} % vendu</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${soldPct}%`, background: 'var(--accent)' }} />
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 mt-4">
          {[
            { k: 'Grille', v: formatEur(detail.grille_total) },
            { k: 'Vendu', v: formatEur(soldEur) },
            { k: 'Reste', v: formatEur(detail.grille_dispo), accent: true },
          ].map((m) => (
            <div key={m.k} className="rounded-xl px-3 py-2" style={{ background: 'var(--bg-surface)' }}>
              <dt className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{m.k}</dt>
              <dd className="text-[15px] font-semibold num" style={{ color: m.accent ? 'var(--success)' : 'var(--text-primary)' }}>{m.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Produits reconnus */}
      <section className="ui-card mb-4 overflow-hidden">
        <button onClick={() => setProductsOpen((v) => !v)} className="w-full flex items-center gap-2.5 px-4 py-3 text-left ui-row-hover">
          {covOk
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} />
            : <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: detail.coverage === 'partial' ? 'var(--warning)' : 'var(--danger)' }} />}
          <span className="flex-1 text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{covText}</span>
          {productsOpen ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-quaternary)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-quaternary)' }} />}
        </button>
        {productsOpen && (
          <div className="px-4 pb-3 space-y-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <ul className="pt-2.5 space-y-1.5">
              {detail.detected_products.map((p, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs">
                  {p.status === 'mapped'
                    ? <CheckCircle2 className="w-3.5 h-3.5 mt-px flex-shrink-0" style={{ color: 'var(--success)' }} />
                    : <X className="w-3.5 h-3.5 mt-px flex-shrink-0" style={{ color: 'var(--danger)' }} />}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {p.label}
                    {p.source === 'catalog' && p.score != null && <span style={{ color: 'var(--text-quaternary)' }}> · match {Math.round(p.score * 100)} %</span>}
                    {p.matched_products && p.matched_products.length > 0 && <span style={{ color: 'var(--text-quaternary)' }}> → {p.matched_products.join(' + ')}</span>}
                    {p.status !== 'mapped' && <span style={{ color: 'var(--text-quaternary)' }}> — {p.reason || 'non mappé'}</span>}
                  </span>
                </li>
              ))}
              {unmatched.filter((u) => !detail.detected_products.some((p) => p.label === u.label)).map((p, idx) => (
                <li key={`u${idx}`} className="flex items-start gap-2 text-xs">
                  <X className="w-3.5 h-3.5 mt-px flex-shrink-0" style={{ color: 'var(--danger)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{p.label}{p.reason && <span style={{ color: 'var(--text-quaternary)' }}> — {p.reason}</span>}</span>
                </li>
              ))}
            </ul>
            {!covOk && (
              <button onClick={() => openSelection('catalog')} className="ui-btn ui-btn-secondary ui-btn-sm mt-2">
                <Layers className="w-3.5 h-3.5" /> Compléter les checklists
              </button>
            )}
          </div>
        )}
      </section>

      {!hasAnyData && (
        <div className="ui-card px-5 py-8 text-center mb-4">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Les prix sont là, il manque les checklists</p>
          <p className="text-xs mt-1 mb-4" style={{ color: 'var(--text-tertiary)' }}>Sélectionne les produits du break pour voir le contenu de chaque spot.</p>
          <button onClick={() => openSelection('catalog')} className="ui-btn ui-btn-primary"><Layers className="w-4 h-4" /> Choisir les checklists</button>
        </div>
      )}

      {(detail.auction_unresolved ?? 0) > 0 && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs flex gap-2" style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)', color: 'var(--text-secondary)' }}>
          <Gavel className="w-3.5 h-3.5 flex-shrink-0 mt-px" style={{ color: 'var(--warning)' }} />
          <span>{detail.auction_unresolved} spot(s) aux enchères : Voggt n'expose pas le prix final, seul le contenu est affiché.</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <Segmented<StatusFilter>
          value={filter}
          onChange={setFilter}
          ariaLabel="Statut des spots"
          options={[
            { value: 'all', label: 'Tous', count: rows.length },
            { value: 'available', label: 'Dispo', count: availableCount },
            { value: 'sold', label: 'Vendus', count: soldCount },
          ]}
        />
        {isMobile && (
          <select value={mobileSort} onChange={(e) => setMobileSort(e.target.value as MobileSort)} className="ui-select" aria-label="Trier les spots">
            <option value="Premium">Plus de premium</option>
            <option value="Prix / premium">Meilleur € / premium</option>
            <option value="Hits">Plus de hits</option>
            <option value="Prix">Plus chers</option>
            <option value="Équipe">A → Z</option>
          </select>
        )}
      </div>

      {isMobile ? (
        <ul className="space-y-2">
          {sortedMobile.map((r) => {
            const sold = isSold(r)
            return (
              <li key={r.Équipe}>
                <button
                  onClick={() => handleRowClick(r)}
                  disabled={!r.hasData}
                  className="w-full text-left ui-card px-4 py-3 active:bg-[var(--bg-hover)]"
                  style={{ opacity: sold ? 0.6 : 1 }}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-[15px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{r.Équipe}</span>
                    <span className="text-[15px] font-semibold num" style={{ color: 'var(--text-primary)' }}><PriceLabel row={r} /></span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusPill sold={sold} />
                    <span className="flex flex-wrap gap-x-3 text-xs num" style={{ color: 'var(--text-tertiary)' }}>
                      <span><b style={{ color: r.Premium > 0 ? 'var(--accent)' : 'var(--text-quaternary)' }}>{r.Premium}</b> premium</span>
                      <span><b style={{ color: 'var(--text-secondary)' }}>{r.Hits}</b> hits</span>
                      <span><b style={{ color: 'var(--text-secondary)' }}>{r.Cartes}</b> cartes</span>
                    </span>
                    {r['Prix / premium'] != null && (
                      <span className="ml-auto text-[11px] num" style={{ color: 'var(--text-quaternary)' }}>{formatEur(r['Prix / premium'], 1)}/p</span>
                    )}
                  </div>
                  {r.topPlayers.length > 0 && <div className="mt-2"><TopPlayers list={r.topPlayers.slice(0, 3)} /></div>}
                </button>
              </li>
            )
          })}
          {sortedMobile.length === 0 && (
            <li className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>Aucun spot dans ce filtre.</li>
          )}
        </ul>
      ) : (
        <DataTable
          data={visibleRows}
          columns={columns}
          onRowClick={handleRowClick}
          searchable
          searchPlaceholder="Rechercher une équipe..."
          exportName={`break_${detail.title || 'voggt'}`}
          initialSorting={[{ id: 'Premium', desc: true }]}
        />
      )}
    </div>
  )
}

function TopPlayers({ list }: { list: PlayerStat[] }) {
  if (!list.length) return <span style={{ color: 'var(--text-quaternary)' }}>—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((p, idx) => (
        <span
          key={idx}
          className="text-[11px] px-1.5 py-0.5 rounded-md whitespace-nowrap"
          style={{
            background: p.premium > 0 ? 'var(--accent-soft)' : 'var(--bg-surface)',
            color: p.premium > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}
        >
          {p.name}{p.premium > 0 && <span className="num" style={{ color: 'var(--accent)' }}> {p.premium}</span>}
        </span>
      ))}
    </div>
  )
}
