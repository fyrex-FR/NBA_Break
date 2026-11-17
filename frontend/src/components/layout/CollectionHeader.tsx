import { Plus } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useOpenCollections } from '../../hooks/useCollections'
import { formatCount, plural } from '../../utils/checklists'
import { frenchDate, isUpcoming } from '../../utils/boxGuide'
import { BoxImage, HobbyLine } from '../shared/CollectionCard'

/**
 * En-tête de la fiche collection : la boîte, le nom, la saison et ce qu'on
 * trouve dans une Hobby. Avec plusieurs collections ouvertes, un en-tête combiné.
 */
export function CollectionHeader() {
  const openSelection = useAppStore((s) => s.openSelection)
  const open = useOpenCollections()
  if (open.length === 0) return null

  const single = open.length === 1 ? open[0] : null
  const rows = open.reduce((s, e) => s + e.rows, 0)
  const seasons = [...new Set(open.map((e) => e.season).filter(Boolean))]
  const release = single?.guide?.release_date ?? null

  return (
    <header className="flex items-center gap-3.5 sm:gap-5 mb-4 sm:mb-5">
      {single ? (
        <BoxImage src={single.guide?.cover_image} className="w-[72px] h-[72px] sm:w-[104px] sm:h-[104px] !rounded-2xl" style={{ boxShadow: 'var(--shadow-card)' }} />
      ) : (
        <div className="flex flex-shrink-0" aria-hidden>
          {open.slice(0, 3).map((e, i) => (
            <BoxImage
              key={e.id}
              src={e.guide?.cover_image}
              className="w-[52px] h-[52px] sm:w-[72px] sm:h-[72px] !rounded-2xl"
              style={{ marginLeft: i ? -18 : 0, boxShadow: '0 0 0 2px var(--bg-primary), var(--shadow-card)', zIndex: 3 - i }}
            />
          ))}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <h1 className="text-[20px] leading-6 sm:text-[28px] sm:leading-8 font-bold truncate" style={{ color: 'var(--text-primary)' }}>
          {single ? single.name : open.map((e) => e.name).join(' + ')}
        </h1>
        <div className="mt-0.5 sm:mt-1 flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xs sm:text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
          {single ? (
            <>
              <span>{single.season}</span>
              {single.guide?.brand && <span>· {single.guide.brand}</span>}
              <span className="num">· {formatCount(rows)} cartes</span>
            </>
          ) : (
            <>
              <span className="num">{plural(open.length, 'collection')}</span>
              <span className="num">· {formatCount(rows)} cartes</span>
              {seasons.length > 0 && <span>· {seasons.join(', ')}</span>}
            </>
          )}
        </div>
        {single?.guide && (
          <div className="mt-1.5 sm:mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-xs sm:text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            <HobbyLine entry={single} />
            {release && (
              <span style={{ color: isUpcoming(release) ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                {isUpcoming(release) ? 'Sortie prévue le ' : 'Sortie le '}{frenchDate(release, 'short')}
              </span>
            )}
          </div>
        )}
      </div>

      <button onClick={() => openSelection('catalog')} className="hidden sm:inline-flex ui-btn ui-btn-secondary ui-btn-sm flex-shrink-0 self-start" title="Ouvrir une autre collection en plus">
        <Plus className="w-3.5 h-3.5" /> Ajouter
      </button>
    </header>
  )
}
