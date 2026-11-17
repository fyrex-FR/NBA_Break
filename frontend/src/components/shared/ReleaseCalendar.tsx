import { ChevronRight } from 'lucide-react'
import { useOpenCollection, useReleaseCalendar } from '../../hooks/useCollections'
import { frenchDate } from '../../utils/boxGuide'

/**
 * Calendrier des sorties (guide des boîtes) : à venir, puis sorties récentes.
 * - list : colonne latérale (desktop) ;
 * - strip : bandeau horizontal compact (mobile, au-dessus du catalogue).
 */
export function ReleaseCalendar({ variant = 'list', className = '' }: { variant?: 'list' | 'strip'; className?: string }) {
  const entries = useReleaseCalendar()
  const openCollection = useOpenCollection()
  if (entries.length === 0) return null

  if (variant === 'strip') {
    return (
      <section className={className} aria-label="Calendrier des sorties">
        <h2 className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Sorties</h2>
        <ul className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 snap-x">
          {entries.map((e) => {
            const clickable = !!e.checklistId
            return (
              <li key={`${e.name}-${e.date}`} className="snap-start flex-shrink-0">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && openCollection(e.checklistId!, '📦 Guide des boîtes')}
                  className="ui-card flex items-center gap-2.5 pl-2 pr-3 py-2 text-left max-w-[240px]"
                >
                  <DateBlock date={e.date} upcoming={e.upcoming} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{e.name}</span>
                    <span className="block text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>{e.formats.join(', ')}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  return (
    <section className={className}>
      <h2 className="text-[15px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Calendrier des sorties</h2>
      <ul className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-panel)', boxShadow: 'var(--shadow-card)' }}>
        {entries.map((e, i) => {
          const clickable = !!e.checklistId
          const Row = clickable ? 'button' : 'div'
          return (
            <li key={`${e.name}-${e.date}`} style={{ borderTop: i ? '1px solid var(--border-subtle)' : undefined }}>
              <Row
                {...(clickable ? { type: 'button' as const, onClick: () => openCollection(e.checklistId!, '📦 Guide des boîtes') } : {})}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left ${clickable ? 'ui-row-hover' : ''}`}
              >
                <DateBlock date={e.date} upcoming={e.upcoming} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{e.name}</span>
                  <span className="block text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {e.season} · {e.formats.join(', ')}{e.upcoming ? ' · à venir' : ''}
                  </span>
                </span>
                {clickable && <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />}
              </Row>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function DateBlock({ date, upcoming }: { date: string; upcoming: boolean }) {
  const [day, month] = (frenchDate(date, 'short') ?? '').split(' ')
  return (
    <span
      className="w-10 flex-shrink-0 text-center leading-none py-1 rounded-lg"
      style={{ background: upcoming ? 'var(--accent-soft)' : 'var(--bg-surface)', color: upcoming ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      <span className="block text-[15px] font-bold font-stat">{day}</span>
      <span className="block text-[10px] uppercase mt-0.5">{month?.replace('.', '')}</span>
    </span>
  )
}
