import { useMemo, useState } from 'react'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import type { BreakSpot, CardRecord } from '../../types'
import { CATEGORY_AUTO_MEM, CATEGORY_CASE_HIT, CATEGORY_LOGOMAN } from '../../types'

function normKey(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface TeamStat {
  cards: number
  auto: number
  caseHit: number
  logoman: number
  premium: number
  score: number
}

interface SpotRow {
  Équipe: string
  Statut: string
  Prix: number | null
  Cartes: number
  Premium: number
  Score: number
  'Auto/Mem': number
  'Case Hit': number
  Logoman: number
  '€/Score': number | null
  Valeur: number | null // premium-share / price-share
  hasData: boolean
}

const columnHelper = createColumnHelper<SpotRow>()

function valueBadge(v: number | null): { label: string; color: string; bg: string } | null {
  if (v == null) return null
  if (v >= 1.25) return { label: 'Bon plan', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' }
  if (v <= 0.75) return { label: 'Surcoté', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
  return { label: 'Correct', color: 'var(--text-tertiary)', bg: 'var(--bg-surface)' }
}

export function BreakOverviewView() {
  const { breakContext, analysisData, clearBreakContext, setTargetTeam, setActiveView } = useAppStore()
  const [showSold, setShowSold] = useState(true)

  const teamStats = useMemo(() => {
    const stats = new Map<string, TeamStat>()
    const cards: CardRecord[] = analysisData?.cards ?? []
    for (const card of cards) {
      const teams = card.Team.split('/').map((t) => t.trim()).filter(Boolean)
      for (const t of teams) {
        const key = normKey(t)
        const cur = stats.get(key) || { cards: 0, auto: 0, caseHit: 0, logoman: 0, premium: 0, score: 0 }
        cur.cards += card.Hits
        cur.score += card.Score || 0
        if (card.Category === CATEGORY_AUTO_MEM) { cur.auto += card.Hits; cur.premium += card.Hits }
        if (card.Category === CATEGORY_CASE_HIT) { cur.caseHit += card.Hits; cur.premium += card.Hits }
        if (card.Category === CATEGORY_LOGOMAN) { cur.logoman += card.Hits; cur.premium += card.Hits }
        stats.set(key, cur)
      }
    }
    return stats
  }, [analysisData])

  const { rows, totalScore } = useMemo(() => {
    const spots: BreakSpot[] = breakContext?.detail.spots ?? []
    const interim = spots.map((s) => {
      const st = teamStats.get(normKey(s.team)) || teamStats.get(normKey(s.name))
      return { spot: s, st }
    })
    const totalScore = interim.reduce((acc, x) => acc + (x.st?.score ?? 0), 0)
    const grilleTotal = breakContext?.detail.grille_total ?? 0
    const built: SpotRow[] = interim.map(({ spot, st }) => {
      const price = spot.price_eur
      const score = st?.score ?? 0
      const priceShare = price != null && grilleTotal > 0 ? price / grilleTotal : null
      const scoreShare = totalScore > 0 ? score / totalScore : null
      const value = priceShare && priceShare > 0 && scoreShare != null ? scoreShare / priceShare : null
      return {
        Équipe: spot.team || spot.name,
        Statut: spot.status,
        Prix: price,
        Cartes: st?.cards ?? 0,
        Premium: st?.premium ?? 0,
        Score: Math.round(score),
        'Auto/Mem': st?.auto ?? 0,
        'Case Hit': st?.caseHit ?? 0,
        Logoman: st?.logoman ?? 0,
        '€/Score': price != null && score > 0 ? Math.round((price / score) * 100) / 100 : null,
        Valeur: value != null ? Math.round(value * 100) / 100 : null,
        hasData: !!st,
      }
    })
    return { rows: built, totalScore }
  }, [breakContext, teamStats])

  const columns = useMemo(() => [
    columnHelper.accessor('Équipe', { header: 'Équipe', cell: (i) => i.getValue() }),
    columnHelper.accessor('Prix', { header: 'Prix', cell: (i) => (i.getValue() != null ? `${i.getValue()}€` : '—') }),
    columnHelper.accessor('Statut', {
      header: 'Statut',
      cell: (i) => {
        const sold = String(i.getValue()).toUpperCase() === 'SOLD'
        return (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
            background: sold ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            color: sold ? '#ef4444' : '#22c55e',
          }}>{sold ? 'Vendu' : 'Dispo'}</span>
        )
      },
    }),
    columnHelper.accessor('Cartes', { header: 'Cartes', cell: (i) => i.getValue() }),
    columnHelper.accessor('Premium', { header: 'Premium', cell: (i) => i.getValue() }),
    columnHelper.accessor('Score', { header: 'Score', cell: (i) => i.getValue() }),
    columnHelper.accessor('€/Score', { header: '€/Score', cell: (i) => (i.getValue() != null ? i.getValue() : '—') }),
    columnHelper.accessor('Valeur', {
      header: 'Valeur',
      cell: (i) => {
        const badge = valueBadge(i.getValue())
        if (!badge) return <span style={{ color: 'var(--text-quaternary)' }}>—</span>
        return (
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: badge.bg, color: badge.color }}>
            {badge.label} {i.getValue()}×
          </span>
        )
      },
    }),
  ], [])

  if (!breakContext) return null
  const { detail } = breakContext

  const visibleRows = showSold ? rows : rows.filter((r) => r.Statut.toUpperCase() !== 'SOLD')
  const hasAnyData = totalScore > 0
  const coverageMsg: Record<string, { text: string; color: string }> = {
    complete: { text: 'Produits reconnus — analyse complète.', color: '#22c55e' },
    partial: { text: 'Analyse partielle — au moins un produit du break n\'est pas mappé.', color: '#eab308' },
    unmapped: { text: 'Produits détectés mais aucune checklist mappée. Sélectionne les checklists à gauche.', color: '#ef4444' },
    unknown: { text: 'Aucun produit reconnu automatiquement. Sélectionne les checklists du break à gauche pour voir les chiffres premium.', color: '#ef4444' },
  }
  const cov = coverageMsg[detail.coverage] ?? coverageMsg.unknown

  function handleRowClick(row: SpotRow) {
    if (!row.hasData) return
    setTargetTeam(row.Équipe)
    setActiveView('🛡️ Analyse Équipe')
  }

  return (
    <div>
      {/* Bandeau mode break */}
      <div className="flex items-center justify-between gap-3 mb-4 px-4 py-2.5 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">🎲</span>
          <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{detail.title || 'Break Voggt'}</span>
        </div>
        <button
          onClick={clearBreakContext}
          className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          Quitter le mode break
        </button>
      </div>

      {/* Métriques du break */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Spots" value={`${detail.available ?? '?'} / ${detail.total ?? '?'}`} icon="🎟️" />
        <MetricCard label="Grille totale" value={`${detail.grille_total}€`} icon="💶" />
        <MetricCard label="Dispo" value={`${detail.grille_dispo}€`} icon="🟢" valueColor="#22c55e" />
        <MetricCard label="Vendu" value={`${Math.round((detail.grille_total - detail.grille_dispo) * 100) / 100}€`} icon="🔴" valueColor="#ef4444" />
      </div>

      {/* Coverage / produits détectés */}
      <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--bg-panel)', border: `1px solid ${cov.color}33` }}>
        <div className="font-medium mb-1" style={{ color: cov.color }}>{cov.text}</div>
        {detail.detected_products.length > 0 && (
          <ul className="mt-1 space-y-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {detail.detected_products.map((p, idx) => (
              <li key={idx} className="text-xs">
                {p.status === 'mapped' ? '✅' : '❌'} {p.label}
                {p.source === 'catalog' && p.score != null && (
                  <span style={{ color: '#22c55e' }}> · match {Math.round(p.score * 100)}%</span>
                )}
                {p.matched_products && p.matched_products.length > 0 && (
                  <span style={{ color: 'var(--text-quaternary)' }}> — {p.matched_products.join(' + ')}</span>
                )}
                {p.status !== 'mapped' && <span style={{ color: 'var(--text-quaternary)' }}> — {p.reason || 'non mappé'}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!hasAnyData ? (
        <div className="text-center py-10 rounded-xl" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
          <div className="text-3xl mb-2">🎟️</div>
          <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Prix des spots affichés, mais pas de données premium à croiser.
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Sélectionne les checklists correspondant au break dans la barre de gauche.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between mb-2">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Trié par valeur (part premium / part du prix). Clique une équipe pour son détail.
        </p>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          Afficher les vendus
        </label>
      </div>

      <DataTable
        data={visibleRows}
        columns={columns as unknown as ColumnDef<SpotRow, unknown>[]}
        onRowClick={handleRowClick}
        searchable
        searchPlaceholder="Rechercher une équipe..."
        exportName={`break_${detail.title || 'voggt'}`}
        initialSorting={[{ id: 'Valeur', desc: true }]}
      />
    </div>
  )
}
