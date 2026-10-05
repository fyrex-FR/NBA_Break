import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { useRookies } from '../../hooks/useRookies'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { EmptyState } from '../ui/primitives'
import { Sparkles } from 'lucide-react'
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

function RookiesViewContent() {
  const { analysisData: storeAnalysisData, setActiveView, setTargetPlayer } = useAppStore()
  // Garanti non nul par le composant enveloppe ci-dessous.
  const analysisData = storeAnalysisData!
  const { rookies } = useRookies()
  const [selectedSeason, setSelectedSeason] = useState<string>('all')


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
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <MetricCard label="Rookies" value={rookieRows.length} valueColor="var(--rc-year-color)" />
        <MetricCard label="Cartes RC" value={totalHits} />
        <MetricCard label="Saison" value={selectedSeason === 'all' ? 'Toutes' : selectedSeason} />
      </div>

      {/* Filtre saison : 3 dernières saisons en accès direct, le reste dans la liste */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar">
        {(['all', ...availableSeasons.slice(0, 3)] as string[]).map((season) => (
          <button
            key={season}
            onClick={() => setSelectedSeason(season)}
            className={`ui-chip flex-shrink-0 ${selectedSeason === season ? 'is-active' : ''}`}
          >
            {season === 'all' ? 'Toutes les saisons' : season}
          </button>
        ))}
        {availableSeasons.length > 3 && (
          <select
            value={availableSeasons.slice(0, 3).includes(selectedSeason) || selectedSeason === 'all' ? '' : selectedSeason}
            onChange={(e) => e.target.value && setSelectedSeason(e.target.value)}
            className="ui-select flex-shrink-0"
            aria-label="Autre saison rookie"
          >
            <option value="">Plus ancienne…</option>
            {availableSeasons.slice(3).map((season) => <option key={season} value={season}>{season}</option>)}
          </select>
        )}
      </div>

      {rookieRows.length === 0 ? (
        <EmptyState icon={Sparkles} title="Aucun rookie pour ce filtre">Change de saison ou ajoute des checklists plus récentes.</EmptyState>
      ) : (
        <DataTable
          data={rookieRows}
          columns={columns}
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

/** Attend qu'une analyse soit chargée : les hooks du contenu s'exécutent toujours dans le même ordre. */
export function RookiesView() {
  const ready = useAppStore((s) => !!s.analysisData)
  return ready ? <RookiesViewContent /> : null
}
