/**
 * LetterAssignmentUI – Interactive editor for "break par lettre + joueurs".
 */

import { useState, useEffect, useMemo } from 'react'
import { fetchBreakPlayers } from '../../api/client'
import { useAppStore } from '../../stores/appStore'
import { RefreshCw } from 'lucide-react'

const ALPHABET = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ')

interface Props {
  onSubmit: (params: {
    custom_map: Record<string, string>
    extracted_players: string[]
    custom_spots: string[]
  }) => void
  initialCustomMap?: Record<string, string>
  initialExtractedPlayers?: string[]
  submitLabel?: string
  disabled?: boolean
}

export function LetterAssignmentUI({
  onSubmit,
  initialCustomMap,
  initialExtractedPlayers,
  submitLabel = '🎲 Simuler',
  disabled = false,
}: Props) {
  const { selectedSport, selectedChecklistIds, masterKey } = useAppStore()

  const [defaultGrouped, setDefaultGrouped] = useState<Record<string, string[]>>({})
  const [allPlayers, setAllPlayers] = useState<string[]>([])
  const [playerStats, setPlayerStats] = useState<Record<string, { cards: number; auto: number }>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [assignment, setAssignment] = useState<Record<string, string>>(initialCustomMap ?? {})
  const [extracted, setExtracted] = useState<Set<string>>(new Set(initialExtractedPlayers ?? []))
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!selectedSport || selectedChecklistIds.length === 0) {
      setDefaultGrouped({})
      setAllPlayers([])
      setPlayerStats({})
      return
    }
    setLoading(true)
    setError(null)
    fetchBreakPlayers({
      sport_key: selectedSport,
      checklist_ids: selectedChecklistIds,
      master_key: masterKey,
    })
      .then(({ players, grouped, stats }) => {
        setAllPlayers(players)
        setDefaultGrouped(grouped)
        setPlayerStats(stats)
        if (!initialCustomMap) setAssignment({})
        if (!initialExtractedPlayers) setExtracted(new Set())
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSport, selectedChecklistIds.join(','), masterKey])

  function getDefaultLetter(player: string): string {
    for (const [letter, players] of Object.entries(defaultGrouped)) {
      if (players.includes(player)) return letter
    }
    return '?'
  }

  const grouped = useMemo(() => {
    const result: Record<string, string[]> = Object.fromEntries(ALPHABET.map(l => [l, []]))
    for (const player of allPlayers) {
      if (extracted.has(player)) continue
      const letter = assignment[player] ?? getDefaultLetter(player)
      if (letter && result[letter] !== undefined) result[letter].push(player)
    }
    for (const l of ALPHABET) result[l].sort()
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlayers, assignment, extracted, defaultGrouped])

  function handleReassign(player: string, newLetter: string) {
    setAssignment(prev => ({ ...prev, [player]: newLetter }))
  }

  function handleExtract(player: string) {
    setExtracted(prev => new Set([...prev, player]))
  }

  function handleUnextract(player: string) {
    setExtracted(prev => { const n = new Set(prev); n.delete(player); return n })
  }

  function handleReset() {
    setAssignment({})
    setExtracted(new Set())
  }

  function handleSubmit() {
    const custom_map: Record<string, string> = {}
    for (const player of allPlayers) {
      custom_map[player] = extracted.has(player)
        ? player
        : (assignment[player] ?? getDefaultLetter(player))
    }
    const extractedArr = Array.from(extracted)
    onSubmit({ custom_map, extracted_players: extractedArr, custom_spots: [...ALPHABET, ...extractedArr] })
  }

  const searchLower = search.toLowerCase()
  const filteredLetters = ALPHABET.filter(letter =>
    !search || grouped[letter].some(p => p.toLowerCase().includes(searchLower))
  )
  const extractedSorted = Array.from(extracted).sort()

  if (!selectedChecklistIds.length) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-quaternary)' }}>
        Sélectionnez des checklists pour configurer le break par lettre.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Filtrer un joueur..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={handleReset}
          title="Réinitialiser"
          className="p-2 rounded-lg"
          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={handleSubmit}
          disabled={disabled || loading || allPlayers.length === 0}
          className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
          style={{ background: 'var(--accent)', color: '#fff', opacity: (disabled || loading || allPlayers.length === 0) ? 0.5 : 1 }}
        >
          {submitLabel}
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-2 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</div>
      )}

      {loading && <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Chargement des joueurs...</p>}

      {/* Extracted players */}
      {extractedSorted.length > 0 && (
        <div className="rounded-xl p-3" style={{ background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-panel))', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
          <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>
            Spots dédiés ({extractedSorted.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {extractedSorted.map(player => {
              const st = playerStats[player]
              return (
                <span key={player} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>
                  <span>{player}</span>
                  {st && <span className="opacity-70 text-[10px]">{st.cards}c{st.auto > 0 ? ` · ${st.auto}A` : ''}</span>}
                  <button onClick={() => handleUnextract(player)} className="opacity-60 hover:opacity-100 ml-0.5" title="Remettre dans le pool">✕</button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Letter groups */}
      {!loading && allPlayers.length > 0 && (
        <div className="space-y-1">
          {filteredLetters.map(letter => {
            const players = search
              ? grouped[letter].filter(p => p.toLowerCase().includes(searchLower))
              : grouped[letter]

            return (
              <div key={letter} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                {/* Letter header */}
                <div className="flex items-center gap-3 px-4 py-2" style={{ background: 'var(--bg-surface)' }}>
                  <span className="text-base font-bold w-6 text-center" style={{ color: 'var(--accent)' }}>{letter}</span>
                  <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                    {grouped[letter].length} joueur{grouped[letter].length !== 1 ? 's' : ''}
                  </span>
                </div>

                {players.length > 0 && (
                  <div>
                    {players.map((player, i) => {
                      const currentLetter = assignment[player] ?? letter
                      const isChanged = currentLetter !== getDefaultLetter(player)
                      const st = playerStats[player]
                      return (
                        <div
                          key={player}
                          className="flex items-center gap-3 px-4 py-2"
                          style={{
                            background: isChanged
                              ? 'color-mix(in srgb, var(--accent) 5%, var(--bg-panel))'
                              : i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-surface)',
                            borderTop: '1px solid var(--border-subtle)',
                          }}
                        >
                          {/* Player name */}
                          <span className="flex-1 text-sm" style={{ color: isChanged ? 'var(--accent)' : 'var(--text-primary)' }}>
                            {player}
                          </span>

                          {/* Stats badge */}
                          {st && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
                              {st.cards} carte{st.cards > 1 ? 's' : ''}
                              {st.auto > 0 && <span style={{ color: 'var(--accent)' }}> · {st.auto}A</span>}
                            </span>
                          )}

                          {/* Letter selector */}
                          <select
                            value={currentLetter}
                            onChange={e => handleReassign(player, e.target.value)}
                            className="text-xs rounded-lg px-2 py-1"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)', minWidth: '3.5rem' }}
                          >
                            {ALPHABET.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>

                          {/* Extract button */}
                          <button
                            onClick={() => handleExtract(player)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap"
                            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                            title="Créer un spot dédié"
                          >
                            Spot dédié
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && allPlayers.length === 0 && !error && (
        <p className="text-sm text-center py-8" style={{ color: 'var(--text-quaternary)' }}>
          Aucun joueur trouvé dans les checklists sélectionnées.
        </p>
      )}
    </div>
  )
}
