import { ChevronRight } from 'lucide-react'

interface QuickPickProps {
  title: string
  items: [string, number][]
  onPick: (name: string) => void
  /** Libellé affiché (par défaut le nom brut). */
  format?: (name: string) => string
}

/** Liste tactile des entités les plus présentes, affichée tant qu'aucune n'est choisie. */
export function QuickPick({ title, items, onPick, format }: QuickPickProps) {
  if (items.length === 0) return null
  const max = items[0][1] || 1
  return (
    <section className="mt-2">
      <div className="ui-eyebrow mb-2">{title}</div>
      <ul className="ui-card overflow-hidden sm:grid sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([name, hits], i) => (
          <li key={name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <button onClick={() => onPick(name)} className="w-full flex items-center gap-3 px-4 py-3 text-left ui-row-hover active:bg-[var(--bg-hover)]">
              <span className="w-5 text-right text-xs num" style={{ color: 'var(--text-quaternary)' }}>{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{format ? format(name) : name}</span>
                <span className="mt-1 block h-1 rounded-full" style={{ width: `${Math.max(6, (hits / max) * 100)}%`, background: 'var(--accent-soft)' }} />
              </span>
              <span className="text-xs num" style={{ color: 'var(--text-tertiary)' }}>{hits} cartes</span>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-quaternary)' }} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
