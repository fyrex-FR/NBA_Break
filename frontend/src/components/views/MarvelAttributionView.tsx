import { useEffect, useMemo, useState } from 'react'
import { fetchMarvelAttributions, saveMarvelAttributions } from '../../api/client'
import { useAppStore } from '../../stores/appStore'
import type { MarvelAttributionCard } from '../../types'
import { Loader2, Save, Search, RotateCcw } from 'lucide-react'

export function MarvelAttributionView() {
  const { selectedSport, selectedChecklistIds, masterKey, setAnalysisData } = useAppStore()
  const [cards, setCards] = useState<MarvelAttributionCard[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hitsOnly, setHitsOnly] = useState(true)
  const [onlyChanged, setOnlyChanged] = useState(false)

  useEffect(() => {
    if (selectedSport !== 'marvel' || selectedChecklistIds.length === 0) return
    setLoading(true)
    setMessage(null)
    fetchMarvelAttributions({ checklist_ids: selectedChecklistIds, master_key: masterKey, hits_only: hitsOnly })
      .then((data) => setCards(data.cards))
      .catch((err) => setMessage(`Erreur: ${err.message}`))
      .finally(() => setLoading(false))
  }, [selectedSport, selectedChecklistIds, masterKey, hitsOnly])

  const originalByKey = useMemo(() => {
    const map = new Map<string, MarvelAttributionCard>()
    for (const card of cards) map.set(card.key, card)
    return map
  }, [cards])

  const changedCards = useMemo(() => {
    return cards.filter((card) => {
      const playerChanged = card.player.trim() !== card.source_player.trim()
      const teamChanged = card.team.trim() !== card.source_team.trim()
      return playerChanged || teamChanged || card.note.trim() || card.is_overridden
    })
  }, [cards])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cards.filter((card) => {
      if (onlyChanged && !changedCards.some((c) => c.key === card.key)) return false
      if (!q) return true
      return [
        card.checklist_name,
        card.number,
        card.box_type,
        card.source_player,
        card.source_team,
        card.player,
        card.team,
      ].some((v) => v.toLowerCase().includes(q))
    })
  }, [cards, changedCards, onlyChanged, query])

  function updateCard(key: string, patch: Partial<MarvelAttributionCard>) {
    setCards((prev) => prev.map((card) => (card.key === key ? { ...card, ...patch } : card)))
  }

  function resetCard(key: string) {
    const card = originalByKey.get(key)
    if (!card) return
    updateCard(key, {
      player: card.source_player,
      team: card.source_team,
      note: '',
      is_overridden: false,
    })
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const result = await saveMarvelAttributions(changedCards)
      setMessage(`Sauvegarde OK: ${result.overrides_count} attribution(s) forcee(s). Relance l'analyse pour rafraichir les tableaux.`)
      setAnalysisData(null)
      setCards((prev) => prev.map((card) => ({ ...card, is_overridden: changedCards.some((c) => c.key === card.key) })))
    } catch (err: any) {
      setMessage(`Erreur: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (selectedSport !== 'marvel') {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
        Cet ecran est reserve aux checklists Marvel.
      </div>
    )
  }

  if (selectedChecklistIds.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
        Selectionne au moins une checklist Marvel.
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-medium mb-1">Attribution Marvel</h2>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Force le personnage/sujet et l'univers utilises pour le split de break.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || changedCards.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff', opacity: saving || changedCards.length === 0 ? 0.55 : 1 }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <div
          className="flex items-center flex-1 rounded-lg px-3 py-2"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)' }}
        >
          <Search className="w-4 h-4 mr-2" style={{ color: 'var(--text-quaternary)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer par carte, source, personnage, univers..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-standard)' }}>
          <input type="checkbox" checked={hitsOnly} onChange={(e) => setHitsOnly(e.target.checked)} />
          Hits seulement
        </label>
        <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-standard)' }}>
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
          Modifiees
        </label>
      </div>

      <div className="flex flex-wrap gap-4 mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span>{filtered.length} lignes affichees</span>
        <span>{cards.length} lignes chargees</span>
        <span>{changedCards.length} attribution(s) a sauvegarder</span>
      </div>

      {message && (
        <div className="mb-4 text-sm rounded-lg px-3 py-2" style={{ color: message.startsWith('Erreur') ? '#ef4444' : 'var(--accent)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Chargement des cartes Marvel...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border-subtle)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-surface)' }}>
              <tr className="text-left" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th className="px-3 py-2 font-medium min-w-[220px]">Carte source</th>
                <th className="px-3 py-2 font-medium min-w-[180px]">Attribution source</th>
                <th className="px-3 py-2 font-medium min-w-[190px]">Personnage / sujet</th>
                <th className="px-3 py-2 font-medium min-w-[170px]">Univers</th>
                <th className="px-3 py-2 font-medium min-w-[160px]">Note</th>
                <th className="px-3 py-2 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((card) => {
                const changed = card.player.trim() !== card.source_player.trim() || card.team.trim() !== card.source_team.trim() || card.note.trim()
                return (
                  <tr key={card.key} style={{ borderBottom: '1px solid var(--border-subtle)', background: changed ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent' }}>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{card.box_type}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-quaternary)' }}>
                        {card.checklist_name.replace('.parquet', '')}
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        #{card.number || '-'} · {card.hits} hit{card.hits > 1 ? 's' : ''} · {card.hit_type || card.category}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top" style={{ color: 'var(--text-secondary)' }}>
                      <div>{card.source_player}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-quaternary)' }}>{card.source_team || '-'}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={card.player}
                        onChange={(e) => updateCard(card.key, { player: e.target.value })}
                        className="w-full rounded-md px-2 py-1.5"
                        style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-standard)' }}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={card.team}
                        onChange={(e) => updateCard(card.key, { team: e.target.value })}
                        className="w-full rounded-md px-2 py-1.5"
                        style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-standard)' }}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={card.note}
                        onChange={(e) => updateCard(card.key, { note: e.target.value })}
                        className="w-full rounded-md px-2 py-1.5"
                        style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-standard)' }}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        onClick={() => resetCard(card.key)}
                        className="p-1.5 rounded-md"
                        style={{ color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)' }}
                        title="Revenir a la source"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
