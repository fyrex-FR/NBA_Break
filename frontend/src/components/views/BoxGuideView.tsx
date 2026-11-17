import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, Search, PenLine, Dot, CalendarDays, ExternalLink, Plus, Check, Play, ArrowLeft } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { fetchBoxGuide, fetchBoxGuides } from '../../api/client'
import { useOpenCollections, useOpenCollection, toEntry } from '../../hooks/useCollections'
import { frenchDate, isUpcoming, shortProductName, usd } from '../../utils/boxGuide'
import { BoxImage, CollectionCard } from '../shared/CollectionCard'
import { EmptyState, Segmented, Sheet, SheetHeader } from '../ui/primitives'
import type { BoxFormat, BoxGuideSummary } from '../../types'

const SOURCE_URL = 'https://www.thehobbychecklist.com'

/**
 * Onglet « Boîte ».
 * - Une ou plusieurs collections ouvertes avec un guide : la fiche boîte directement.
 * - Sinon (ou sur demande) : le catalogue de toutes les boîtes.
 */
export function BoxGuideView() {
  const open = useOpenCollections().filter((e) => e.guide)
  const [browseAll, setBrowseAll] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)

  if (open.length > 0 && !browseAll) {
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
        <BoxGuideBody key={current.id} guideId={current.id} mode="inline" />
        <button type="button" onClick={() => setBrowseAll(true)} className="ui-btn ui-btn-secondary ui-btn-sm mt-6">
          <Package className="w-3.5 h-3.5" /> Toutes les boîtes
        </button>
      </div>
    )
  }

  return <BoxCatalog onBack={open.length > 0 ? () => setBrowseAll(false) : undefined} />
}

function BoxCatalog({ onBack }: { onBack?: () => void }) {
  const { selectedSport, availableChecklists } = useAppStore()
  const [query, setQuery] = useState('')
  const [season, setSeason] = useState<string>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['box-guides', selectedSport],
    queryFn: () => fetchBoxGuides(selectedSport),
    staleTime: 60 * 60 * 1000,
  })

  const guides = useMemo(() => data?.guides ?? [], [data])
  const seasons = useMemo(() => [...new Set(guides.map((g) => g.season).filter(Boolean) as string[])].sort().reverse(), [guides])
  const catalog = useMemo(() => new Map(availableChecklists.map((c) => [c.checklist_id, c])), [availableChecklists])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return guides
      .filter((g) => season === 'all' || g.season === season)
      .filter((g) => !q || (g.name ?? g.source_slug).toLowerCase().includes(q))
      .sort((a, b) =>
        (b.season ?? '').localeCompare(a.season ?? '') ||
        (b.release_date ?? '').localeCompare(a.release_date ?? '') ||
        (a.name ?? '').localeCompare(b.name ?? ''),
      )
  }, [guides, query, season])

  if (error) {
    return <EmptyState icon={Package} title="Guide indisponible">Le guide des boîtes n’a pas pu être chargé.</EmptyState>
  }

  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} className="ui-btn ui-btn-ghost ui-btn-sm -ml-2 mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Retour à ma collection
        </button>
      )}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center mb-4">
        <label className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-quaternary)' }} />
          <input
            className="ui-input !pl-9 w-full"
            placeholder="Chercher une collection…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Chercher une collection"
          />
        </label>
        <select className="ui-select self-start sm:self-auto" value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Saison">
          <option value="all">Toutes saisons</option>
          {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="ui-skeleton h-[90px] rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="Aucune collection">Essaie une autre recherche ou une autre saison.</EmptyState>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => {
            const cl = g.checklist_id ? catalog.get(g.checklist_id) : undefined
            return (
              <li key={g.checklist_id ?? g.source_slug}>
                {cl
                  ? <CollectionCard entry={toEntry(cl, g)} onOpen={() => setOpenId(g.checklist_id!)} />
                  : <OrphanGuideCard guide={g} onOpen={() => setOpenId(`thc:${g.source_slug}`)} />}
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs mt-6" style={{ color: 'var(--text-quaternary)' }}>
        Données : <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">The Hobby Checklist</a>
        {data?.source._imported_at && <> · importées le {frenchDate(data.source._imported_at.slice(0, 10))}</>}. Prix publics US indicatifs.
      </p>

      <BoxGuideSheet guideId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

/** Collection du guide que NoClim n'a pas (encore) : consultable, pas ouvrable. */
function OrphanGuideCard({ guide, onOpen }: { guide: BoxGuideSummary; onOpen: () => void }) {
  const hobby = guide.formats.find((f) => f.name === 'Hobby') ?? guide.formats[0]
  return (
    <button type="button" onClick={onOpen} className="ui-card ui-row-hover w-full text-left p-2.5 flex gap-3 items-stretch">
      <BoxImage src={guide.cover_image} className="w-[72px] h-[72px] sm:w-[80px] sm:h-[80px]" />
      <div className="flex-1 min-w-0 flex flex-col justify-between gap-1 py-0.5">
        <div className="min-w-0">
          <div className="text-[14px] leading-5 font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{shortProductName(guide.name, guide.season)}</div>
          <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{guide.season} · checklist pas encore dans NoClim</div>
        </div>
        {hobby && (
          <div className="text-[11px] font-stat truncate" style={{ color: 'var(--text-secondary)' }}>
            {hobby.name}
            {hobby.autos_per_box ? <> · <b style={{ color: 'var(--cat-auto)' }}>{hobby.autos_per_box} auto{hobby.autos_per_box > 1 ? 's' : ''}</b></> : null}
            {usd(hobby.price_usd) ? <> · {usd(hobby.price_usd)}</> : null}
          </div>
        )}
      </div>
    </button>
  )
}

/* ── Fiche boîte : en panneau (catalogue) ou intégrée (onglet de la collection) ── */

function BoxGuideSheet({ guideId, onClose }: { guideId: string | null; onClose: () => void }) {
  const { selectedSport } = useAppStore()
  const { data: guide } = useQuery({
    queryKey: ['box-guide', selectedSport, guideId],
    queryFn: () => fetchBoxGuide(selectedSport, guideId!),
    enabled: !!guideId,
    staleTime: 60 * 60 * 1000,
  })
  return (
    <Sheet open={!!guideId} onClose={onClose} labelledBy="box-guide-title" width={560}>
      <SheetHeader
        id="box-guide-title"
        title={guide ? shortProductName(guide.name, guide.season) : 'Guide des boîtes'}
        subtitle={guide ? [guide.season, guide.brand].filter(Boolean).join(' · ') : undefined}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {guideId && <BoxGuideBody key={guideId} guideId={guideId} mode="sheet" onDone={onClose} />}
      </div>
    </Sheet>
  )
}

function BoxGuideBody({ guideId, mode, onDone }: { guideId: string; mode: 'sheet' | 'inline'; onDone?: () => void }) {
  const { selectedSport, availableChecklists, selectedChecklistIds, toggleChecklist } = useAppStore()
  const openCollection = useOpenCollection()
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
  const inCatalog = !!guide.checklist_id && availableChecklists.some((c) => c.checklist_id === guide.checklist_id)
  const selected = !!guide.checklist_id && selectedChecklistIds.includes(guide.checklist_id)
  const presentation = guide.presentation.filter((l) => l !== 'En bref')

  return (
    <>
      <div className="flex gap-4 items-start">
        {/* Intégrée à la fiche collection, la photo générique est déjà dans l'en-tête : seule celle du format s'affiche. */}
        {(mode === 'sheet' || format?.image) && (
          <BoxImage src={format?.image ?? guide.cover_image} className="w-[132px] h-[100px] sm:w-[168px] sm:h-[126px]" />
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {mode === 'sheet' && (inCatalog ? (
            <>
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm justify-center" onClick={() => { openCollection(guide.checklist_id!); onDone?.() }}>
                <Play className="w-3.5 h-3.5" /> Ouvrir cette collection
              </button>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm justify-center" onClick={() => toggleChecklist(guide.checklist_id!)}>
                {selected ? <><Check className="w-3.5 h-3.5" /> Ouverte</> : <><Plus className="w-3.5 h-3.5" /> Ouvrir en plus</>}
              </button>
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Checklist pas encore disponible dans NoClim.</p>
          ))}
          {mode === 'inline' && format && (
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
        <div className={`mt-5 overflow-x-auto no-scrollbar ${mode === 'sheet' ? '-mx-5 px-5' : '-mx-4 px-4 md:mx-0 md:px-0'}`}>
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
