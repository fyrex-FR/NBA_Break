import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { useRookies } from '../../hooks/useRookies'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { RCBadge } from '../shared/RCBadge'

interface RookieRow {
  player_name: string
  year_start: number
  year_end: number
  team: string
  draft_pick: number | null
  hits: number
}

const columnHelper = createColumnHelper<RookieRow>()

export function RookiesView() {
  const { analysisData, setActiveView, setTargetPlayer } = useAppStore()
  const { rookies } = useRookies()
  const [selectedSeason, setSelectedSeason] = useState<string>('all')

  if (!analysisData) return null

  // Saisons disponibles dans le parquet rookies
  const availableSeasons = useMemo(() => {
    const set = new Set<string>()
    for (const r of rookies) {
      set.add(`${r.year_start}-${r.year_end}`)
    }
    return Array.from(set).sort().reverse()
  }, [rookies])

  // Croiser rookies × cards pour avoir les hits
  const rookieRows = useMemo(() => {
    const rookieMap = new Map(rookies.map((r) => [r.player_name.toLowerCase(), r]))

    // Compter les hits par joueur dans les cards
    const hitsMap = new Map<string, number>()
    for (const card of analysisData.cards) {
      const players = card.Player.split('/').map((p) => p.trim())
      for (const p of players) {
        if (rookieMap.has(p.toLowerCase())) {
          hitsMap.set(p.toLowerCase(), (hitsMap.get(p.toLowerCase()) || 0) + card.Hits)
        }
      }
    }

    const rows: RookieRow[] = []
    for (const [normName, rookie] of rookieMap) {
      const season = `${rookie.year_start}-${rookie.year_end}`
      if (selectedSeason !== 'all' && season !== selectedSeason) continue
      const hits = hitsMap.get(normName) || 0
      if (hits === 0) continue // n'afficher que les rookies présents dans les checklists
      rows.push({
        player_name: rookie.player_name,
        year_start: rookie.year_start,
        year_end: rookie.year_end,
        team: rookie.team,
        draft_pick: rookie.draft_pick,
        hits,
      })
    }

    return rows.sort((a, b) => b.hits - a.hits)
  }, [rookies, analysisData.cards, selectedSeason])

  const columns = [
    columnHelper.accessor('player_name', {
      header: 'Joueur',
      cell: (info) => (
        <div className="flex items-center gap-2">
          <RCBadge size="sm" />
          <span>{info.getValue()}</span>
        </div>
      ),
    }),
    columnHelper.accessor('team', { header: 'Équipe' }),
    columnHelper.accessor('year_start', {
      header: 'Saison rookie',
      cell: (info) => `${info.getValue()}-${info.row.original.year_end}`,
    }),
    columnHelper.accessor('draft_pick', {
      header: 'Pick',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.accessor('hits', {
      header: 'Cartes',
      cell: (info) => info.getValue().toLocaleString('fr-FR'),
    }),
  ]

  const totalHits = rookieRows.reduce((s, r) => s + r.hits, 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <RCBadge size="lg" />
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Rookie Cards</h2>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Joueurs en année rookie présents dans vos checklists
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6 mt-4">
        <MetricCard label="Rookies présents" value={rookieRows.length} icon="🧨" valueColor="#FFD700" />
        <MetricCard label="Total cartes RC" value={totalHits} icon="🎴" />
        <MetricCard label="Saisons filtrées" value={selectedSeason === 'all' ? 'Toutes' : selectedSeason} icon="📅" />
      </div>

      {/* Filtre saison */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Saison rookie :</label>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedSeason('all')}
            className="text-xs px-2.5 py-1 rounded-full transition-colors"
            style={{
              background: selectedSeason === 'all' ? '#FFD700' : 'var(--bg-surface)',
              color: selectedSeason === 'all' ? '#000' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              fontWeight: selectedSeason === 'all' ? 700 : 400,
            }}
          >
            Toutes
          </button>
          {availableSeasons.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSeason(s)}
              className="text-xs px-2.5 py-1 rounded-full transition-colors"
              style={{
                background: selectedSeason === s ? '#FFD700' : 'var(--bg-surface)',
                color: selectedSeason === s ? '#000' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                fontWeight: selectedSeason === s ? 700 : 400,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {rookieRows.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🧨</div>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Aucun rookie trouvé dans vos checklists pour cette sélection.
          </p>
        </div>
      ) : (
        <DataTable
          data={rookieRows}
          columns={columns as any}
          onRowClick={(row) => {
            setTargetPlayer(row.player_name)
            setActiveView('🔍 Analyse Joueur')
          }}
          searchable
          searchPlaceholder="Rechercher un rookie..."
          exportName="rookies"
        />
      )}
    </div>
  )
}
