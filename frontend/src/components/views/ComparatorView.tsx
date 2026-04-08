import { useMemo, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { SearchSelect } from '../shared/SearchSelect'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM } from '../../types'

const MAX_PLAYERS = 5
const PLAYER_COLORS = ['#ff6b35', '#3b82f6', '#22c55e', '#a78bfa', '#eab308']

interface PlayerStat {
  name: string
  total: number
  autoMem: number
  caseHit: number
  logoman: number
  checklists: number
}

const METRICS: { key: keyof Omit<PlayerStat, 'name'>; label: string; icon: string; color: string }[] = [
  { key: 'total',      label: 'Total cartes', icon: '📊', color: '#94a3b8' },
  { key: 'logoman',    label: 'Logoman',      icon: '🔥', color: '#ef4444' },
  { key: 'caseHit',    label: 'Case Hit',     icon: '✨', color: '#eab308' },
  { key: 'autoMem',    label: 'Auto/Mem',     icon: '💎', color: '#3b82f6' },
  { key: 'checklists', label: 'Checklists',   icon: '📁', color: '#22c55e' },
]

export function ComparatorView() {
  const { analysisData } = useAppStore()
  const [slots, setSlots] = useState<string[]>(['', ''])

  if (!analysisData) return null

  const allPlayers = useMemo(() => {
    const names = new Set<string>()
    for (const card of analysisData.cards)
      for (const name of card.Player.split('/').map((p) => p.trim()))
        if (name) names.add(name)
    return Array.from(names).sort()
  }, [analysisData.cards])

  function setSlot(i: number, v: string) { setSlots((p) => p.map((s, j) => j === i ? v : s)) }
  function removeSlot(i: number) { setSlots((p) => p.filter((_, j) => j !== i)) }
  function addSlot() { if (slots.length < MAX_PLAYERS) setSlots((p) => [...p, '']) }

  const stats: PlayerStat[] = useMemo(() => slots.filter(Boolean).map((name) => {
    const cards = analysisData.cards.filter((c) =>
      c.Player.split('/').map((p) => p.trim().toLowerCase()).includes(name.toLowerCase()),
    )
    return {
      name,
      total:      cards.reduce((s, c) => s + c.Hits, 0),
      autoMem:    cards.filter((c) => c.Category === CATEGORY_AUTO_MEM).reduce((s, c) => s + c.Hits, 0),
      caseHit:    cards.filter((c) => c.Category === CATEGORY_CASE_HIT).reduce((s, c) => s + c.Hits, 0),
      logoman:    cards.filter((c) => c.Category === CATEGORY_LOGOMAN).reduce((s, c) => s + c.Hits, 0),
      checklists: new Set(cards.map((c) => c.checklist_name)).size,
    }
  }), [slots, analysisData.cards])

  const maxOf = (key: keyof Omit<PlayerStat, 'name'>) => Math.max(...stats.map((s) => s[key]), 1)

  return (
    <div>
      <h2 className="text-xl font-medium mb-1">⚖️ Comparateur Joueurs</h2>
      <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>
        Sélectionnez jusqu'à {MAX_PLAYERS} joueurs à comparer.
      </p>

      {/* Sélecteurs */}
      <div className="max-w-lg mb-6">
        {slots.map((slot, i) => (
          <div key={i} className="flex items-start gap-2">
            <div
              className="w-2 h-2 rounded-full mt-4 flex-shrink-0"
              style={{ background: slot ? PLAYER_COLORS[i % PLAYER_COLORS.length] : 'var(--border-solid)' }}
            />
            <div className="flex-1">
              <SearchSelect
                options={allPlayers.filter((p) => !slots.includes(p) || p === slot)}
                value={slot}
                onChange={(v) => setSlot(i, v)}
                placeholder={`Joueur ${i + 1}…`}
              />
            </div>
            {slots.length > 2 && (
              <button onClick={() => removeSlot(i)} className="mt-2 px-1.5 py-1 rounded text-xs" style={{ color: 'var(--text-quaternary)' }}>✕</button>
            )}
          </div>
        ))}
        {slots.length < MAX_PLAYERS && (
          <button
            onClick={addSlot}
            className="mt-1 ml-4 text-sm px-3 py-1.5 rounded-lg"
            style={{ color: 'var(--accent)', border: '1px dashed color-mix(in srgb, var(--accent) 40%, transparent)', background: 'transparent' }}
          >
            + Ajouter un joueur
          </button>
        )}
      </div>

      {/* Comparaison */}
      {stats.length > 0 && (
        <div className="space-y-4">
          {METRICS.map(({ key, label, icon }) => {
            const max = maxOf(key)
            const winner = stats.reduce((a, b) => a[key] >= b[key] ? a : b)
            return (
              <div key={key} className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-1.5 mb-3">
                  <span>{icon}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>
                <div className="space-y-2.5">
                  {stats.map((s, i) => {
                    const pct = max > 0 ? (s[key] / max) * 100 : 0
                    const isWinner = s.name === winner.name && s[key] > 0
                    const playerColor = PLAYER_COLORS[i % PLAYER_COLORS.length]
                    return (
                      <div key={s.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium" style={{ color: isWinner ? playerColor : 'var(--text-tertiary)' }}>
                            {s.name}{isWinner && stats.length > 1 && ' 🥇'}
                          </span>
                          <span className="text-sm font-bold" style={{ color: isWinner ? playerColor : 'var(--text-primary)' }}>
                            {s[key].toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: playerColor, opacity: isWinner ? 1 : 0.5 }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
