import { useState } from 'react'
import { Package, Target } from 'lucide-react'
import { formatCount } from '../../utils/checklists'
import { frenchDate, isUpcoming, usd } from '../../utils/boxGuide'
import type { CollectionEntry } from '../../hooks/useCollections'

/** Photo de boîte, avec repli sur une icône quand on n'en a pas. */
export function BoxImage({ src, className = '', style }: { src: string | null | undefined; className?: string; style?: React.CSSProperties }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className={`rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center ${className}`} style={{ background: 'var(--bg-surface)', ...style }}>
      {src && !broken ? (
        // Photos détourées (fond transparent), en portrait comme en paysage : on montre la boîte entière.
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-contain p-1"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35))' }}
          onError={() => setBroken(true)}
        />
      ) : (
        <Package className="w-1/3 h-1/3 max-w-6 max-h-6" style={{ color: 'var(--text-quaternary)' }} />
      )}
    </div>
  )
}

/** Ligne « Hobby · 3 autos · $399.95 » d'une collection. */
export function HobbyLine({ entry }: { entry: CollectionEntry }) {
  const hobby = entry.guide?.formats.find((f) => f.name === 'Hobby') ?? entry.guide?.formats[0]
  return (
    <span className="font-stat truncate">
      {hobby ? (
        <>
          {hobby.name}
          {hobby.autos_per_box ? <> · <b style={{ color: 'var(--text-primary)' }}>{hobby.autos_per_box} {hobby.hits_mixed ? 'hit' : 'auto'}{hobby.autos_per_box > 1 ? 's' : ''}</b></> : null}
          {usd(hobby.price_usd) ? <> · {usd(hobby.price_usd)}</> : null}
        </>
      ) : (
        <>{formatCount(entry.rows)} cartes</>
      )}
    </span>
  )
}

/** Carte d'une collection : un toucher l'ouvre. */
export function CollectionCard({ entry, onOpen, hasOdds }: { entry: CollectionEntry; onOpen: () => void; hasOdds?: boolean }) {
  const release = entry.guide?.release_date ?? null
  const upcoming = isUpcoming(release)
  return (
    <button type="button" onClick={onOpen} className="ui-card ui-row-hover w-full text-left p-2.5 flex gap-3 items-stretch">
      <BoxImage src={entry.guide?.cover_image} className="w-[72px] h-[72px] sm:w-[80px] sm:h-[80px]" />
      <div className="flex-1 min-w-0 flex flex-col justify-between gap-1 py-0.5">
        <div className="min-w-0">
          <div className="text-[14px] leading-5 font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{entry.name}</div>
          <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
            {entry.season}
            {upcoming && <span style={{ color: 'var(--accent)' }}> · sortie le {frenchDate(release, 'short')}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] min-w-0" style={{ color: 'var(--text-secondary)' }}>
          <HobbyLine entry={entry} />
          {entry.guide && <span className="num flex-shrink-0" style={{ color: 'var(--text-quaternary)' }}>{formatCount(entry.rows)} cartes</span>}
          {hasOdds && <span className="inline-flex items-center gap-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }}><Target className="w-3 h-3" />odds</span>}
        </div>
      </div>
    </button>
  )
}
