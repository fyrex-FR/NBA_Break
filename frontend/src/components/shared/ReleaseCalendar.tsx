import { ChevronRight } from 'lucide-react'
import { useOpenCollection, useReleaseCalendar } from '../../hooks/useCollections'
import { frenchDate } from '../../utils/boxGuide'

/** Calendrier des sorties (guide des boîtes) : à venir, puis sorties récentes. */
export function ReleaseCalendar() {
  const entries = useReleaseCalendar()
  const openCollection = useOpenCollection()
  if (entries.length === 0) return null

  return (
    <section>
      <h2 className="text-[15px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Calendrier des sorties</h2>
      <ul className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-panel)', boxShadow: 'var(--shadow-card)' }}>
        {entries.map((e, i) => {
          const [day, month] = (frenchDate(e.date, 'short') ?? '').split(' ')
          const clickable = !!e.checklistId
          const Row = clickable ? 'button' : 'div'
          return (
            <li key={`${e.name}-${e.date}`} style={{ borderTop: i ? '1px solid var(--border-subtle)' : undefined }}>
              <Row
                {...(clickable ? { type: 'button' as const, onClick: () => openCollection(e.checklistId!, '📦 Guide des boîtes') } : {})}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left ${clickable ? 'ui-row-hover' : ''}`}
              >
                <span
                  className="w-10 flex-shrink-0 text-center leading-none py-1 rounded-lg"
                  style={{ background: e.upcoming ? 'var(--accent-soft)' : 'var(--bg-surface)', color: e.upcoming ? 'var(--accent)' : 'var(--text-secondary)' }}
                >
                  <span className="block text-[15px] font-bold font-stat">{day}</span>
                  <span className="block text-[10px] uppercase mt-0.5">{month?.replace('.', '')}</span>
                </span>
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
