/**
 * LetterAssignmentUI – Interactive editor for "break par lettre + joueurs".
 *
 * Displays all wrestlers grouped by their computed initial letter.
 * The breaker can:
 *  - Reassign a player to a different letter via an inline select
 *  - Extract a player to a dedicated spot (own row)
 *  - Remove extracted players back into the letter pool
 *
 * On submit → calls parent with:
 *  - custom_map: { playerName: letterOrPlayerSpot }
 *  - extracted_players: string[]
 *  - custom_spots: string[] (26 letters + extracted player names)
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchBreakPlayers } from '../../api/client'
import { useAppStore } from '../../stores/appStore'
import { UserX, RefreshCw } from 'lucide-react'

const ALPHABET = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ')

interface Props {
  onSubmit: (params: {
    custom_map: Record<string, string>
    extracted_players: string[]
    custom_spots: string[]
  }) => void
  /** Initial state restored from a preset */
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

  // grouped: letter → player[] (the default grouping from backend)
  const [defaultGrouped, setDefaultGrouped] = useState<Record<string, string[]>>({})
  const [allPlayers, setAllPlayers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Current assignment: player → letter (or player name for extracted)
  const [assignment, setAssignment] = useState<Record<string, string>>(initialCustomMap ?? {})
  // Extracted players get a dedicated spot
  const [extracted, setExtracted] = useState<Set<string>>(new Set(initialExtractedPlayers ?? []))

  // Search filter
  const [search, setSearch] = useState('')

  // Load players when checklists change
  useEffect(() => {
    if (!selectedSport || selectedChecklistIds.length === 0) {
      setDefaultGrouped({})
      setAllPlayers([])
      return
    }
    setLoading(true)
    setError(null)
    fetchBreakPlayers({
      sport_key: selectedSport,
      checklist_ids: selectedChecklistIds,
      master_key: masterKey,
    })
      .then(({ players, grouped }) => {
        setAllPlayers(players)
        setDefaultGrouped(grouped)
        // Only reset assignment if no initial preset was provided
        if (!initialCustomMap) {
          setAssignment({})
        }
        if (!initialExtractedPlayers) {
          setExtracted(new Set())
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSport, selectedChecklistIds.join(','), masterKey])

  // Effective assignment for a player: override if in assignment map, else default
  const effectiveLetter = useCallback(
    (player: string): string => {
      return assignment[player] ?? defaultGrouped[Object.keys(defaultGrouped).find(l => defaultGrouped[l].includes(player)) ?? '']?.[0]?.[0] ?? '?'
    },
    [assignment, defaultGrouped],
  )

  // Build the grouped view: letter → players currently assigned to it (excluding extracted)
  const grouped = useMemo(() => {
    const result: Record<string, string[]> = Object.fromEntries(ALPHABET.map(l => [l, []]))
    for (const player of allPlayers) {
      if (extracted.has(player)) continue
      const letter = assignment[player] ?? getDefaultLetter(player, defaultGrouped)
      if (letter && result[letter] !== undefined) {
        result[letter].push(player)
      }
    }
    for (const l of ALPHABET) result[l].sort()
    return result
  }, [allPlayers, assignment, extracted, defaultGrouped])

  function getDefaultLetter(player: string, grouped: Record<string, string[]>): string {
    for (const [letter, players] of Object.entries(grouped)) {
      if (players.includes(player)) return letter
    }
    return '?'
  }

  function handleReassign(player: string, newLetter: string) {
    setAssignment(prev => ({ ...prev, [player]: newLetter }))
  }

  function handleExtract(player: string) {
    setExtracted(prev => new Set([...prev, player]))
  }

  function handleUnextract(player: string) {
    setExtracted(prev => {
      const next = new Set(prev)
      next.delete(player)
      return next
    })
  }

  function handleReset() {
    setAssignment({})
    setExtracted(new Set())
  }

  function handleSubmit() {
    // Build full custom_map: every player → their spot
    const custom_map: Record<string, string> = {}
    for (const player of allPlayers) {
      if (extracted.has(player)) {
        custom_map[player] = player
      } else {
        custom_map[player] = assignment[player] ?? getDefaultLetter(player, defaultGrouped)
      }
    }
    const extractedArr = Array.from(extracted)
    const custom_spots = [...ALPHABET, ...extractedArr]
    onSubmit({ custom_map, extracted_players: extractedArr, custom_spots })
  }

  const searchLower = search.toLowerCase()
  const filteredLetters = ALPHABET.filter(letter => {
    if (!search) return true
    return grouped[letter].some(p => p.toLowerCase().includes(searchLower))
  })

  const extractedSorted = Array.from(extracted).sort()

  if (!selectedChecklistIds.length) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-quaternary)' }}>
        Sélectionnez des checklists pour configurer le break par lettre.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filtrer un joueur..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-standard)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={handleReset}
          title="Réinitialiser les assignations"
          className="p-2 rounded-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={handleSubmit}
          disabled={disabled || loading || allPlayers.length === 0}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            opacity: (disabled || loading || allPlayers.length === 0) ? 0.5 : 1,
          }}
        >
          {submitLabel}
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-2 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {loading && (
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Chargement des joueurs...</p>
      )}

      {/* Extracted players */}
      {extractedSorted.length > 0 && (
        <div className="rounded-xl p-3" style={{ background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-panel))', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
          <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>
            Joueurs sortis (spot dédié)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {extractedSorted.map(player => (
              <span
                key={player}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {player}
                <button
                  onClick={() => handleUnextract(player)}
                  className="ml-0.5 opacity-70 hover:opacity-100"
                  title="Remettre dans le pool"
                >
                  ✕
                </button>
              </span>
            ))}
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
              <div
                key={letter}
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border-subtle)' }}
              >
                {/* Letter header */}
                <div
                  className="flex items-center gap-3 px-4 py-2"
                  style={{ background: 'var(--bg-surface)' }}
                >
                  <span
                    className="text-lg font-bold w-7 text-center"
                    style={{ color: 'var(--accent)' }}
                  >
                    {letter}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
                    {grouped[letter].length} joueur{grouped[letter].length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Players */}
                {players.length > 0 && (
                  <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {players.map(player => {
                      const currentLetter = assignment[player] ?? letter
                      const isChanged = currentLetter !== getDefaultLetter(player, defaultGrouped)
                      return (
                        <div
                          key={player}
                          className="flex items-center gap-2 px-4 py-1.5"
                          style={{ background: isChanged ? 'color-mix(in srgb, var(--accent) 4%, var(--bg-panel))' : 'var(--bg-panel)' }}
                        >
                          <span
                            className="flex-1 text-sm"
                            style={{ color: isChanged ? 'var(--accent)' : 'var(--text-primary)' }}
                          >
                            {player}
                          </span>
                          {/* Letter selector */}
                          <select
                            value={currentLetter}
                            onChange={e => handleReassign(player, e.target.value)}
                            className="text-xs rounded px-1.5 py-1"
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-standard)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {ALPHABET.map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                          {/* Extract button */}
                          <button
                            onClick={() => handleExtract(player)}
                            title="Sortir comme spot dédié"
                            className="p-1.5 rounded hover:bg-[var(--bg-hover)]"
                            style={{ color: 'var(--text-quaternary)' }}
                          >
                            <UserX size={13} />
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
