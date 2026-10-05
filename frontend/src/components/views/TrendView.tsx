import { Segmented, EmptyState } from '../ui/primitives'
import { TrendingUp, Layers } from 'lucide-react'
import { useMediaQuery, MOBILE_QUERY } from '../../hooks/useMediaQuery'
import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAppStore } from '../../stores/appStore'

const COLORS = [
  '#f97316', '#3b82f6', '#22c55e', '#a78bfa', '#ef4444',
  '#eab308', '#06b6d4', '#ec4899', '#84cc16', '#f59e0b',
]

function TrendViewContent() {
  const { analysisData: storeAnalysisData, openSelection } = useAppStore()
  // Garanti non nul par le composant enveloppe ci-dessous.
  const analysisData = storeAnalysisData!
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [mode, setMode] = useState<'players' | 'teams'>('players')


  // Hits par année par joueur/équipe
  const { years, rankings, trendData } = useMemo(() => {
    const yearSet = new Set<string>()
    const entityMap = new Map<string, Map<string, number>>() // entity -> year -> hits

    for (const card of analysisData.cards) {
      const year = card.Year || 'Inconnue'
      if (year === 'Inconnue') continue
      yearSet.add(year)

      const entities = mode === 'players'
        ? card.Player.split('/').map((p) => p.trim()).filter(Boolean)
        : card.Team.split('/').map((t) => t.trim()).filter(Boolean)

      for (const entity of entities) {
        if (!entityMap.has(entity)) entityMap.set(entity, new Map())
        const yearMap = entityMap.get(entity)!
        yearMap.set(year, (yearMap.get(year) || 0) + card.Hits)
      }
    }

    const years = Array.from(yearSet).sort()

    // Classement par total de hits
    const rankings = Array.from(entityMap.entries())
      .map(([name, yearMap]) => ({
        name,
        total: Array.from(yearMap.values()).reduce((s, v) => s + v, 0),
        byYear: yearMap,
      }))
      .sort((a, b) => b.total - a.total)

    // Format recharts: [{ year, Player1: 5, Player2: 3 }, ...]
    const trendData = years.map((year) => {
      const row: Record<string, string | number> = { year }
      for (const { name, byYear } of rankings) {
        row[name] = byYear.get(year) || 0
      }
      return row
    })

    return { years, rankings, trendData }
  }, [analysisData.cards, mode])

  // Top 5 par défaut
  const top5 = useMemo(() => rankings.slice(0, 5).map((r) => r.name), [rankings])
  const active = selectedPlayers.length > 0 ? selectedPlayers : top5

  function toggleEntity(name: string) {
    setSelectedPlayers((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    )
  }

  return (
    <div>
      <div className="mb-4">
        <Segmented<'players' | 'teams'>
          value={mode}
          onChange={(m) => { setMode(m); setSelectedPlayers([]) }}
          ariaLabel="Entité"
          options={[{ value: 'players', label: 'Joueurs' }, { value: 'teams', label: 'Équipes' }]}
        />
      </div>

      {years.length < 2 ? (
        <EmptyState
          icon={TrendingUp}
          title="Il faut au moins deux saisons"
          action={<button onClick={() => openSelection('catalog')} className="ui-btn ui-btn-primary"><Layers className="w-4 h-4" /> Ajouter des saisons</button>}
        >
          Ajoute des checklists d’années différentes pour comparer les volumes.
        </EmptyState>
      ) : (
        <>
          {/* Sélecteur joueurs/équipes */}
          <div className="flex sm:flex-wrap gap-2 mb-4 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            {rankings.slice(0, 20).map(({ name }) => {
              const colorIdx = active.indexOf(name)
              const isActive = colorIdx !== -1
              return (
                <button
                  key={name}
                  onClick={() => toggleEntity(name)}
                  className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full transition-all"
                  style={{
                    background: isActive ? `${COLORS[colorIdx % COLORS.length]}22` : 'transparent',
                    border: `1px solid ${isActive ? COLORS[colorIdx % COLORS.length] : 'var(--border-standard)'}`,
                    color: isActive ? COLORS[colorIdx % COLORS.length] : 'var(--text-tertiary)',
                  }}
                >
                  {name}
                </button>
              )
            })}
            {selectedPlayers.length > 0 && (
              <button
                onClick={() => setSelectedPlayers([])}
                className="text-xs px-2 py-1 rounded-full"
                style={{ color: 'var(--text-quaternary)', border: '1px solid var(--border-subtle)' }}
              >
                ✕ Reset
              </button>
            )}
          </div>

          {/* Graphique */}
          <div className="ui-card p-3 sm:p-4">
            <ResponsiveContainer width="100%" height={isMobile ? 260 : 340}>
              <LineChart data={trendData}>
                <XAxis dataKey="year" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <YAxis width={isMobile ? 28 : 40} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: 'none', borderRadius: 10, boxShadow: 'var(--shadow-pop)' }}
                  labelStyle={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                {active.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

/** Attend qu'une analyse soit chargée : les hooks du contenu s'exécutent toujours dans le même ordre. */
export function TrendView() {
  const ready = useAppStore((s) => !!s.analysisData)
  return ready ? <TrendViewContent /> : null
}
