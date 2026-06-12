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

interface PlayerStat { name: string; cards: number; premium: number }

interface TeamStat {
  cards: number
  auto: number
  premium: number
  players: Map<string, PlayerStat>
}

interface SpotRow {
  Équipe: string
  Statut: string
  Prix: number | null
  Cartes: number
  'Auto/Mem': number
  Premium: number
  topPlayers: PlayerStat[]
  hasData: boolean
}

const columnHelper = createColumnHelper<SpotRow>()

export function BreakOverviewView() {
  const { breakContext, analysisData, clearBreakContext, setTargetTeam, setActiveView } = useAppStore()
  const [showSold, setShowSold] = useState(true)

  const teamStats = useMemo(() => {
    const stats = new Map<string, TeamStat>()
    const cards: CardRecord[] = analysisData?.cards ?? []
    for (const card of cards) {
      const teams = card.Team.split('/').map((t) => t.trim()).filter(Boolean)
      const players = card.Player.split('/').map((p) => p.trim()).filter(Boolean)
      const isAuto = card.Category === CATEGORY_AUTO_MEM
      const isPremium = isAuto || card.Category === CATEGORY_CASE_HIT || card.Category === CATEGORY_LOGOMAN
      for (const t of teams) {
        const key = normKey(t)
        const cur = stats.get(key) || { cards: 0, auto: 0, premium: 0, players: new Map<string, PlayerStat>() }
        cur.cards += card.Hits
        if (isAuto) cur.auto += card.Hits
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
      return {
        Équipe: spot.team || spot.name,
        Statut: spot.status,
        Prix: spot.price_eur,
        Cartes: st?.cards ?? 0,
        'Auto/Mem': st?.auto ?? 0,
        Premium: st?.premium ?? 0,
        topPlayers,
        hasData: !!st,
      }
    })
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
    columnHelper.accessor('Auto/Mem', { header: 'Auto/Mem', cell: (i) => i.getValue() }),
    columnHelper.accessor('Premium', { header: 'Premium', cell: (i) => i.getValue() }),
    columnHelper.display({
      id: 'TopJoueurs',
      header: 'Top joueurs (premium)',
      cell: ({ row }) => {
        const list = row.original.topPlayers
        if (!list.length) return <span style={{ color: 'var(--text-quaternary)' }}>—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {list.map((p, idx) => (
              <span key={idx} className="text-xs px-1.5 py-0.5 rounded-md whitespace-nowrap" style={{
                background: p.premium > 0 ? 'rgba(249,115,22,0.13)' : 'var(--bg-surface)',
                color: p.premium > 0 ? 'var(--accent)' : 'var(--text-tertiary)',
              }}>
                {p.name}{p.premium > 0 ? ` ·${p.premium}` : ''}
              </span>
            ))}
          </div>
        )
      },
    }),
  ], [])

  if (!breakContext) return null
  const { detail } = breakContext

  const visibleRows = showSold ? rows : rows.filter((r) => r.Statut.toUpperCase() !== 'SOLD')
  const hasAnyData = rows.some((r) => r.Cartes > 0)
  const unmatched = detail.unmatched_products ?? []
  const mappedCount = detail.detected_products.filter((p) => p.status === 'mapped').length
  const coverageMsg: Record<string, { text: string; color: string }> = {
    complete: { text: `Tous les produits du break ont été reconnus (${mappedCount}).`, color: '#22c55e' },
    partial: { text: `${mappedCount} produit(s) reconnu(s), ${unmatched.length} non reconnu(s) — chiffres partiels.`, color: '#eab308' },
    unmapped: { text: `Aucun produit reconnu (${unmatched.length} à vérifier). Sélectionne les checklists à gauche.`, color: '#ef4444' },
    unknown: { text: 'Aucun produit reconnu automatiquement. Sélectionne les checklists du break à gauche pour voir les chiffres.', color: '#ef4444' },
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
        {unmatched.length > 0 && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="text-xs font-semibold mb-1" style={{ color: '#ef4444' }}>
              ⚠️ {unmatched.length} produit(s) non reconnu(s) — à vérifier / sélectionner à la main :
            </div>
            <ul className="space-y-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {unmatched.map((p, idx) => (
                <li key={idx} className="text-xs">
                  ❌ {p.label}
                  {p.reason && <span style={{ color: 'var(--text-quaternary)' }}> — {p.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!hasAnyData && (
        <div className="text-center py-10 rounded-xl mb-4" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
          <div className="text-3xl mb-2">🎟️</div>
          <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Prix des spots affichés, mais pas encore de données à croiser.
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Sélectionne les checklists correspondant au break dans la barre de gauche.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Cartes, autos et top joueurs (par cartes premium) de chaque spot — à toi de juger la valeur réelle. Clique une équipe pour son détail.
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
        initialSorting={[{ id: 'Premium', desc: true }]}
      />
    </div>
  )
}
