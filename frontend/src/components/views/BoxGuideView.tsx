import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, Search, PenLine, Dot, CalendarDays, ExternalLink, Plus, Check, Play } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { fetchBoxGuide, fetchBoxGuides } from '../../api/client'
import { EmptyState, Segmented, Sheet, SheetHeader } from '../ui/primitives'
import type { BoxFormat, BoxGuideSummary } from '../../types'

const SOURCE_URL = 'https://www.thehobbychecklist.com'

/** « 2025-26 Panini Prizm Basketball » → « Panini Prizm ». */
function shortProductName(name: string | null, season: string | null) {
  let n = name ?? ''
  if (season && n.startsWith(season)) n = n.slice(season.length)
  return n.replace(/\s+Basketball$/i, '').trim()
}

function frenchDate(iso: string | null, withYear = true) {
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('fr-FR', withYear ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' })
}

function isUpcoming(iso: string | null) {
  return !!iso && new Date(`${iso}T23:59:59`).getTime() > Date.now()
}

function usd(price: number | null) {
  if (price == null) return null
  return price.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: price % 1 ? 2 : 0 })
}

export function BoxGuideView() {
  const { selectedSport, selectedChecklistIds } = useAppStore()
  const [query, setQuery] = useState('')
  const [season, setSeason] = useState<string>('all')
  const [onlySelection, setOnlySelection] = useState(() => useAppStore.getState().selectedChecklistIds.length > 0)
  const [openId, setOpenId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['box-guides', selectedSport],
    queryFn: () => fetchBoxGuides(selectedSport),
    staleTime: 60 * 60 * 1000,
  })

  const guides = useMemo(() => data?.guides ?? [], [data])
  const seasons = useMemo(() => [...new Set(guides.map((g) => g.season).filter(Boolean) as string[])].sort().reverse(), [guides])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sel = new Set(selectedChecklistIds)
    return guides
      .filter((g) => season === 'all' || g.season === season)
      .filter((g) => !onlySelection || (g.checklist_id && sel.has(g.checklist_id)))
      .filter((g) => !q || (g.name ?? g.source_slug).toLowerCase().includes(q))
      .sort((a, b) =>
        (b.season ?? '').localeCompare(a.season ?? '') ||
        (b.release_date ?? '').localeCompare(a.release_date ?? '') ||
        (a.name ?? '').localeCompare(b.name ?? ''),
      )
  }, [guides, query, season, onlySelection, selectedChecklistIds])

  const selectionCount = useMemo(() => {
    const sel = new Set(selectedChecklistIds)
    return guides.filter((g) => g.checklist_id && sel.has(g.checklist_id)).length
  }, [guides, selectedChecklistIds])

  if (error) {
    return <EmptyState icon={Package} title="Guide indisponible">Le guide des boîtes n’a pas pu être chargé.</EmptyState>
  }

  return (
    <div>
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
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <select className="ui-select flex-shrink-0" value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Saison">
            <option value="all">Toutes saisons</option>
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="button"
            className={`ui-chip flex-shrink-0 ${onlySelection ? 'is-active' : ''}`}
            onClick={() => setOnlySelection((v) => !v)}
            disabled={selectionCount === 0}
            aria-pressed={onlySelection}
          >
            Ma sélection <span className="num">{selectionCount}</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="ui-skeleton h-[104px] rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="Aucune collection">Essaie une autre recherche ou une autre saison.</EmptyState>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => (
            <li key={g.checklist_id ?? g.source_slug}>
              <GuideCard guide={g} onOpen={() => setOpenId(g.checklist_id ?? `thc:${g.source_slug}`)} />
            </li>
          ))}
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

function GuideCard({ guide, onOpen }: { guide: BoxGuideSummary; onOpen: () => void }) {
  const hobby = guide.formats.find((f) => f.name === 'Hobby') ?? guide.formats[0]
  const upcoming = isUpcoming(guide.release_date)
  return (
    <button type="button" onClick={onOpen} className="ui-card ui-row-hover w-full text-left p-2.5 flex gap-3 items-stretch">
      <BoxImage src={guide.cover_image} className="w-[92px] h-[70px] sm:w-[104px] sm:h-[78px]" />
      <div className="flex-1 min-w-0 flex flex-col justify-between gap-1.5 py-0.5">
        <div className="min-w-0">
          <div className="text-[14px] leading-5 font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {shortProductName(guide.name, guide.season)}
          </div>
          <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
            {guide.season}
            {upcoming && guide.release_date && <span style={{ color: 'var(--accent)' }}> · sortie le {frenchDate(guide.release_date, false)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          {hobby && (
            <span className="font-stat" style={{ color: 'var(--text-secondary)' }}>
              {hobby.name}
              {hobby.autos_per_box ? <> · <b style={{ color: 'var(--cat-auto)' }}>{hobby.autos_per_box} auto{hobby.autos_per_box > 1 ? 's' : ''}</b></> : null}
              {usd(hobby.price_usd) ? <> · {usd(hobby.price_usd)}</> : null}
            </span>
          )}
          {guide.formats.length > 1 && (
            <span style={{ color: 'var(--text-quaternary)' }}>+{guide.formats.length - 1} format{guide.formats.length > 2 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </button>
  )
}

function BoxImage({ src, className = '' }: { src: string | null; className?: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className={`rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center ${className}`} style={{ background: 'var(--bg-surface)' }}>
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <Package className="w-6 h-6" style={{ color: 'var(--text-quaternary)' }} />
      )}
    </div>
  )
}

/* ── Fiche détaillée ────────────────────────────────────────────────────── */

function BoxGuideSheet({ guideId, onClose }: { guideId: string | null; onClose: () => void }) {
  const { selectedSport, availableChecklists, selectedChecklistIds, toggleChecklist } = useAppStore()
  const [formatName, setFormatName] = useState<string | null>(null)
  const [showAllPresentation, setShowAllPresentation] = useState(false)

  const { data: guide, isLoading } = useQuery({
    queryKey: ['box-guide', selectedSport, guideId],
    queryFn: () => fetchBoxGuide(selectedSport, guideId!),
    enabled: !!guideId,
    staleTime: 60 * 60 * 1000,
  })

  const format = guide?.formats.find((f) => f.name === formatName) ?? guide?.formats[0]
  const inCatalog = !!guide?.checklist_id && availableChecklists.some((c) => c.checklist_id === guide.checklist_id)
  const selected = !!guide?.checklist_id && selectedChecklistIds.includes(guide.checklist_id)

  function close() {
    setFormatName(null)
    setShowAllPresentation(false)
    onClose()
  }

  const presentation = guide?.presentation.filter((l) => l !== 'En bref') ?? []

  return (
    <Sheet open={!!guideId} onClose={close} labelledBy="box-guide-title" width={560}>
      <SheetHeader
        id="box-guide-title"
        title={guide ? shortProductName(guide.name, guide.season) : 'Guide des boîtes'}
        subtitle={guide ? [guide.season, guide.brand].filter(Boolean).join(' · ') : undefined}
        onClose={close}
      />
      <div className="flex-1 overflow-y-auto px-5 pb-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {isLoading || !guide ? (
          <div className="space-y-3 pt-4">
            <div className="ui-skeleton h-44 rounded-2xl" />
            <div className="ui-skeleton h-24 rounded-2xl" />
          </div>
        ) : (
          <>
            <div className="pt-4 flex gap-4 items-start">
              <BoxImage src={format?.image ?? guide.cover_image} className="w-[132px] h-[100px] sm:w-[168px] sm:h-[126px]" />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {inCatalog ? (
                  <>
                    <button
                      type="button"
                      className="ui-btn ui-btn-primary ui-btn-sm justify-center"
                      onClick={() => { useAppStore.getState().setSelectedChecklistIds([guide.checklist_id!]); useAppStore.getState().setActiveView('🌍 Vue Globale'); close() }}
                    >
                      <Play className="w-3.5 h-3.5" /> Ouvrir cette collection
                    </button>
                    <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm justify-center" onClick={() => toggleChecklist(guide.checklist_id!)}>
                      {selected ? <><Check className="w-3.5 h-3.5" /> Dans la sélection</> : <><Plus className="w-3.5 h-3.5" /> Ajouter à la sélection</>}
                    </button>
                  </>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Checklist pas encore disponible dans NoClim.</p>
                )}
                {!guide.odds_published && (
                  <p className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Cotes officielles non publiées.</p>
                )}
              </div>
            </div>

            {guide.formats.length > 1 && (
              <div className="mt-5 -mx-5 px-5 overflow-x-auto no-scrollbar">
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
                <h3 className="ui-eyebrow mb-2">Présentation</h3>
                <div className="space-y-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
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
              className="mt-6 inline-flex items-center gap-1.5 text-xs underline underline-offset-2"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Voir sur The Hobby Checklist <ExternalLink className="w-3 h-3" />
            </a>
          </>
        )}
      </div>
    </Sheet>
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
          <h3 className="ui-eyebrow mb-2">Contenu moyen par boîte</h3>
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
