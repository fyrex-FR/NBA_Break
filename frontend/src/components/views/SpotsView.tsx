import { Fragment, useMemo, useState } from 'react'
import { Circle, CircleCheck, ArrowRight } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { buildSpots, sortSpots, average, type SpotField, type SpotKind, type SpotRow } from '../../utils/spots'
import { Segmented } from '../ui/primitives'
import { formatCount } from '../../utils/checklists'
import type { CardRecord } from '../../types'

const COLUMNS: { field: SpotField; label: string; mobile: boolean }[] = [
  { field: 'cards', label: 'Cartes', mobile: false },
  { field: 'autos', label: 'Autos', mobile: true },
  { field: 'memo', label: 'Memo', mobile: true },
  { field: 'caseHits', label: 'Case', mobile: true },
]

const FIELD_WORD: Record<SpotField, string> = { cards: 'cartes', autos: 'autos', memo: 'memo', caseHits: 'case hits' }

/**
 * Onglet « Spots » d'une collection : ce que contient chaque équipe (ou joueur),
 * en chiffres bruts, triable par colonne. Toucher une ligne l'inverse et déplie
 * le détail comparé à la moyenne, avec l'accès à sa fiche.
 */
export function SpotsView() {
  const analysisData = useAppStore((s) => s.analysisData)
  const sport = useAppStore((s) => s.selectedSport)
  const markedSpots = useAppStore((s) => s.markedSpots)
  const [kind, setKind] = useState<SpotKind>('team')
  const [sortBy, setSortBy] = useState<SpotField>('autos')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [onlyMarked, setOnlyMarked] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const cards = useMemo(() => analysisData?.cards ?? [], [analysisData])
  const raw = useMemo(() => buildSpots(cards, kind), [cards, kind])
  const spots = useMemo(() => sortSpots(raw, sortBy), [raw, sortBy])
  const max = spots[0]?.[sortBy] || 1
  const marked = spots.filter((s) => markedSpots.includes(s.key))
  const list = onlyMarked ? marked : showAll ? spots : spots.slice(0, kind === 'team' ? 40 : 30)
  const isEntertainment = sport === 'disney' || sport === 'marvel'
  const teamWord = isEntertainment ? 'Univers' : 'Équipe'

  if (!analysisData) return null
  const current = openKey ? spots.find((s) => s.key === openKey) : null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Segmented<SpotKind>
          value={kind}
          onChange={(k) => { setKind(k); setOpenKey(null); setShowAll(false) }}
          ariaLabel="Type de spot"
          options={[
            { value: 'team', label: `Par ${teamWord.toLowerCase()}`, count: kind === 'team' ? spots.length : undefined },
            { value: 'player', label: 'Par joueur', count: kind === 'player' ? spots.length : undefined },
          ]}
        />
        <button
          type="button"
          className={`ui-chip ${onlyMarked ? 'is-active' : ''}`}
          onClick={() => setOnlyMarked((v) => !v)}
          disabled={marked.length === 0}
          aria-pressed={onlyMarked}
          title="Les spots que tu as entourés"
        >
          <CircleCheck className="w-3.5 h-3.5" /> Entourés <span className="num">{marked.length}</span>
        </button>
      </div>

      {/* En-tête souligné d'un filet épais ; chaque colonne chiffrée trie le tableau */}
      <table className="w-full border-collapse" aria-label={`Contenu par ${teamWord.toLowerCase()}`}>
        <thead>
          <tr className="ui-eyebrow text-left" style={{ borderBottom: '2px solid var(--rule-heavy)' }}>
            <th scope="col" className="py-1.5 w-8 font-bold">#</th>
            <th scope="col" className="py-1.5 font-bold">{kind === 'team' ? teamWord : 'Joueur'}</th>
            {COLUMNS.map((c) => (
              <th
                key={c.field}
                scope="col"
                className={`py-0 w-[56px] text-right font-bold ${c.mobile ? '' : 'hidden sm:table-cell'}`}
                aria-sort={sortBy === c.field ? 'descending' : undefined}
              >
                <button
                  type="button"
                  onClick={() => { setSortBy(c.field); setOpenKey(null) }}
                  className="w-full min-h-11 py-1.5 text-right font-bold uppercase"
                  style={sortBy === c.field
                    ? { color: 'var(--text-primary)', letterSpacing: 'inherit', textDecoration: 'underline', textDecorationColor: 'var(--accent)', textDecorationThickness: 2, textUnderlineOffset: 4 }
                    : { letterSpacing: 'inherit' }}
                  title={`Trier par ${FIELD_WORD[c.field]}`}
                >
                  {c.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const open = s.key === openKey
            const isMarked = markedSpots.includes(s.key)
            const rank = spots.indexOf(s) + 1
            return (
              <Fragment key={s.key}>
                <tr
                  onClick={() => setOpenKey(open ? null : s.key)}
                  className="cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--border-standard)',
                    // Sélection = inversion franche, papier sur encre
                    background: open ? 'var(--text-primary)' : undefined,
                    color: open ? 'var(--bg-primary)' : undefined,
                  }}
                >
                  <td className="py-2.5 align-top">
                    <span className="inline-flex items-center justify-center w-6 h-6 text-[13px] font-stat" style={{
                      color: open ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                      outline: isMarked ? `1.5px solid ${open ? 'var(--bg-primary)' : 'var(--accent)'}` : undefined,
                      borderRadius: '999px',
                    }}>{rank}</span>
                  </td>
                  <td className="py-2.5 pr-2 min-w-0">
                    <button
                      type="button"
                      className="block w-full text-left text-[15px] font-semibold truncate"
                      aria-expanded={open}
                      onClick={(e) => { e.stopPropagation(); setOpenKey(open ? null : s.key) }}
                    >
                      {s.name}
                    </button>
                    {kind === 'player' && s.team && (
                      <span className="block text-xs truncate" style={{ color: open ? 'inherit' : 'var(--text-tertiary)', opacity: open ? 0.75 : 1 }}>{s.team}</span>
                    )}
                    {/* Barre à l'échelle de la colonne triée */}
                    {!open && <span aria-hidden className="block h-[3px] mt-1" style={{ width: `${Math.max(1, (100 * s[sortBy]) / max)}%`, background: 'var(--accent)', opacity: 0.85 }} />}
                  </td>
                  {COLUMNS.map((c) => (
                    <td
                      key={c.field}
                      className={`py-2.5 text-right font-stat text-[14px] ${c.mobile ? '' : 'hidden sm:table-cell'}`}
                      style={{ fontWeight: sortBy === c.field ? 800 : undefined, color: !open && sortBy !== c.field ? 'var(--text-secondary)' : undefined }}
                    >
                      {formatCount(s[c.field])}
                    </td>
                  ))}
                </tr>
                {open && current && (
                  <tr>
                    <td colSpan={2 + COLUMNS.length} className="p-0">
                      <Detail spot={current} rank={rank} spots={spots} sortBy={sortBy} kind={kind} cards={cards} marked={isMarked} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      {!onlyMarked && !showAll && spots.length > list.length && (
        <button type="button" className="ui-btn ui-btn-secondary w-full mt-3" onClick={() => setShowAll(true)}>
          Voir les {spots.length - list.length} autres
        </button>
      )}
    </div>
  )
}

/** Détail d'un spot : son rang, qui le porte, ses chiffres face à la moyenne, et ses actions. */
function Detail({ spot, rank, spots, sortBy, kind, cards, marked }: {
  spot: SpotRow; rank: number; spots: SpotRow[]; sortBy: SpotField; kind: SpotKind; cards: CardRecord[]; marked: boolean
}) {
  const { setActiveView, setTargetTeam, setTargetPlayer, toggleMarkedSpot } = useAppStore()
  const leaders = useMemo(() => {
    if (kind !== 'team') return []
    const teamCards = cards.filter((c) => c.Team.split('/').map((t) => t.trim()).includes(spot.name))
    return sortSpots(buildSpots(teamCards, 'player'), 'autos').slice(0, 3)
  }, [cards, kind, spot.name])

  const noun = kind === 'team' ? 'équipes' : 'joueurs'
  const proof: [string, SpotField][] = [['Autos', 'autos'], ['Memo', 'memo'], ['Case hits', 'caseHits'], ['Cartes', 'cards']]

  function openSheet() {
    if (kind === 'team') { setTargetTeam(spot.name); setActiveView('🛡️ Analyse Équipe') }
    else { setTargetPlayer(spot.name); setActiveView('🔍 Analyse Joueur') }
  }

  return (
    <div className="px-1 py-3.5" style={{ borderBottom: '2px solid var(--rule-heavy)' }}>
      <p className="text-[15px] leading-6" style={{ color: 'var(--text-secondary)' }}>
        <b style={{ color: 'var(--text-primary)' }}>{rank}<sup>{rank === 1 ? 'er' : 'e'}</sup> sur {spots.length}</b> {noun} en {FIELD_WORD[sortBy]}.
        {leaders.length > 0 && <> Portée par {leaders.map((l) => `${l.name} (${l.autos} auto${l.autos > 1 ? 's' : ''})`).join(', ')}.</>}
      </p>

      <table className="w-full mt-3 text-[13px]">
        <thead>
          <tr className="ui-eyebrow" style={{ borderBottom: '1px solid var(--border-standard)' }}>
            <th scope="col" className="text-left py-1 font-bold">Ligne</th>
            <th scope="col" className="text-right py-1 font-bold">{kind === 'team' ? spot.name.split(' ').slice(-1)[0] : 'Joueur'}</th>
            <th scope="col" className="text-right py-1 font-bold">Moyenne</th>
          </tr>
        </thead>
        <tbody>
          {proof.map(([label, field]) => {
            const v = spot[field]
            const avg = average(spots, field)
            return (
              <tr key={field} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="py-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</td>
                <td className="py-1.5 text-right font-stat" style={{ color: 'var(--text-primary)', fontWeight: v > avg ? 800 : 500 }}>{formatCount(v)}</td>
                <td className="py-1.5 text-right font-stat" style={{ color: 'var(--text-tertiary)' }}>{avg.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="flex gap-2 mt-3">
        <button type="button" className="ui-btn ui-btn-primary flex-1" onClick={openSheet}>
          Voir la fiche <ArrowRight className="w-4 h-4" />
        </button>
        <button type="button" className="ui-btn ui-btn-secondary" onClick={() => toggleMarkedSpot(spot.key)} aria-pressed={marked}>
          {marked ? <CircleCheck className="w-4 h-4" /> : <Circle className="w-4 h-4" />} {marked ? 'Entouré' : 'Entourer'}
        </button>
      </div>
    </div>
  )
}
