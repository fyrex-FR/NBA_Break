import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, PenLine, Dot, CalendarDays, ExternalLink } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { fetchBoxGuide } from '../../api/client'
import { useOpenCollections } from '../../hooks/useCollections'
import { frenchDate, isUpcoming, usd } from '../../utils/boxGuide'
import { BoxImage } from '../shared/CollectionCard'
import { EmptyState, Segmented } from '../ui/primitives'
import type { BoxFormat } from '../../types'

const SOURCE_URL = 'https://www.thehobbychecklist.com'

/**
 * Onglet « Boîte » d'une collection ouverte : sa fiche boîte, directement.
 * (Le catalogue de toutes les collections, c'est l'accueil Collections.)
 */
export function BoxGuideView() {
  const open = useOpenCollections().filter((e) => e.guide)
  const [pickedId, setPickedId] = useState<string | null>(null)

  if (open.length === 0) {
    return (
      <EmptyState icon={Package} title="Pas de guide pour cette boîte">
        On n’a pas encore le détail des formats de cette collection.
      </EmptyState>
    )
  }

  const current = open.find((e) => e.id === pickedId) ?? open[0]
  return (
    <div className="max-w-3xl">
      {open.length > 1 && (
        <div className="mb-4 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar">
          <Segmented
            value={current.id}
            onChange={setPickedId}
            ariaLabel="Collection"
            options={open.map((e) => ({ value: e.id, label: e.name }))}
          />
        </div>
      )}
      <BoxGuideBody key={current.id} guideId={current.id} />
    </div>
  )
}

function BoxGuideBody({ guideId }: { guideId: string }) {
  const { selectedSport } = useAppStore()
  const [formatName, setFormatName] = useState<string | null>(null)
  const [showAllPresentation, setShowAllPresentation] = useState(false)

  const { data: guide, isLoading, error } = useQuery({
    queryKey: ['box-guide', selectedSport, guideId],
    queryFn: () => fetchBoxGuide(selectedSport, guideId),
    staleTime: 60 * 60 * 1000,
  })

  if (error) return <EmptyState icon={Package} title="Guide indisponible">Le guide de cette boîte n’a pas pu être chargé.</EmptyState>
  if (isLoading || !guide) {
    return (
      <div className="space-y-3">
        <div className="ui-skeleton h-36 rounded-2xl" />
        <div className="ui-skeleton h-24 rounded-2xl" />
      </div>
    )
  }

  const format = guide.formats.find((f) => f.name === formatName) ?? guide.formats[0]
  const presentation = guide.presentation.filter((l) => l !== 'En bref')

  return (
    <>
      <div className="flex gap-4 items-start">
        {/* La photo générique est déjà dans l'en-tête de la fiche : seule celle du format s'affiche. */}
        {format?.image && <BoxImage src={format.image} className="w-[132px] h-[100px] sm:w-[168px] sm:h-[126px]" />}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {format && (
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Boîte {format.name}</div>
              {format.cards_per_box != null && <div className="num">{format.cards_per_box} cartes par boîte</div>}
            </div>
          )}
          {!guide.odds_published && (
            <p className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Cotes officielles non publiées.</p>
          )}
        </div>
      </div>

      {guide.formats.length > 1 && (
        <div className="mt-5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          <Segmented
            value={format?.name ?? ''}
            onChange={setFormatName}
            ariaLabel="Format de boîte"
            options={guide.formats.map((f) => ({ value: f.name, label: f.name }))}
          />
        </div>
      )}

      {format && <FormatDetail format={format} />}

      {presentation.length > 0 && (
        <section className="mt-6">
          <h3 className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Présentation</h3>
          <div className="space-y-2 text-sm leading-6 max-w-[68ch]" style={{ color: 'var(--text-secondary)' }}>
            {(showAllPresentation ? presentation : presentation.slice(0, 3)).map((line, i) => <p key={i}>{line}</p>)}
          </div>
          {presentation.length > 3 && (
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm mt-1 -ml-2" onClick={() => setShowAllPresentation((v) => !v)}>
              {showAllPresentation ? 'Réduire' : 'Lire la suite'}
            </button>
          )}
        </section>
      )}

      <a
        href={`${SOURCE_URL}/collections/${guide.source_slug}`}
        target="_blank"
        rel="noreferrer"
        className="mt-6 flex items-center gap-1.5 text-xs underline underline-offset-2 w-fit"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Source : The Hobby Checklist <ExternalLink className="w-3 h-3" />
      </a>
    </>
  )
}

function FormatDetail({ format: f }: { format: BoxFormat }) {
  const stats: { label: string; value: number | null }[] = [
    { label: 'cartes / paquet', value: f.cards_per_pack },
    { label: 'paquets / boîte', value: f.packs_per_box },
    { label: 'boîtes / case', value: f.boxes_per_case },
    { label: 'cartes / boîte', value: f.cards_per_box },
  ]
  return (
    <section className="mt-4">
      {f.description && <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{f.description}</p>}

      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
        {f.release_date && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            {isUpcoming(f.release_date) ? 'Sortie prévue le ' : 'Sorti le '}{frenchDate(f.release_date)}
          </span>
        )}
        {usd(f.price_usd) && <span>Prix public <b className="font-stat" style={{ color: 'var(--text-primary)' }}>{usd(f.price_usd)}</b></span>}
        {f.case_from_shops && <span>Case vendue en boutique</span>}
      </div>

      {(f.autos_per_box != null || f.autos_per_case != null) && (
        <div className="ui-card px-4 py-3 mb-2.5 flex items-baseline gap-4" style={{ borderColor: 'color-mix(in srgb, var(--cat-auto) 35%, var(--border-subtle))' }}>
          <PenLine className="w-4 h-4 self-center" style={{ color: 'var(--cat-auto)' }} />
          {f.autos_per_box != null && (
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <b className="text-[22px] font-stat font-semibold" style={{ color: 'var(--text-primary)' }}>{f.autos_per_box}</b> auto{f.autos_per_box > 1 ? 's' : ''} / boîte
            </span>
          )}
          {f.autos_per_case != null && (
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              <b className="font-stat" style={{ color: 'var(--text-secondary)' }}>{f.autos_per_case}</b> par case
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {stats.map((s) => (
          <div key={s.label} className="ui-card px-2 py-2 sm:px-3 text-center">
            <div className="text-[17px] sm:text-[20px] leading-6 font-semibold font-stat" style={{ color: s.value != null ? 'var(--text-primary)' : 'var(--text-quaternary)' }}>
              {s.value ?? '—'}
            </div>
            <div className="text-[10.5px] sm:text-[11px] leading-tight mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {f.contents.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Contenu moyen par boîte</h3>
          <ul className="space-y-1.5">
            {f.contents.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" title={c.vo && c.vo !== c.fr ? `VO : ${c.vo}` : undefined}>
                {c.auto
                  ? <PenLine className="w-3.5 h-3.5 mt-[3px] flex-shrink-0" style={{ color: 'var(--cat-auto)' }} />
                  : <Dot className="w-3.5 h-3.5 mt-[3px] flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />}
                <span style={{ color: c.auto ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{c.fr}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
