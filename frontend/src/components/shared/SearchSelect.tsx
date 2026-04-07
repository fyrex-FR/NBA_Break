import { useState, useRef, useEffect } from 'react'

interface SearchSelectProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchSelect({ options, value, onChange, placeholder = 'Rechercher...' }: SearchSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())).slice(0, 50)
    : options.slice(0, 50)

  function handleSelect(v: string) {
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  function handleClear() {
    onChange('')
    setQuery('')
  }

  return (
    <div ref={ref} className="relative w-full max-w-md mb-6">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={open ? query : value || query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="w-full rounded-lg px-3 py-2 text-sm pr-8"
            style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${open ? 'var(--accent)' : 'var(--border-standard)'}`,
              color: 'var(--text-primary)',
            }}
          />
          {value && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: 'var(--text-quaternary)' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg overflow-y-auto max-h-64 shadow-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)' }}
        >
          {filtered.map((opt) => (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className="w-full text-left px-3 py-2 text-sm transition-colors"
              style={{ color: opt === value ? 'var(--accent)' : 'var(--text-secondary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {opt}
            </button>
          ))}
          {options.length > 50 && !query && (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-quaternary)' }}>
              Tapez pour affiner ({options.length} résultats)
            </div>
          )}
        </div>
      )}

      {open && query && filtered.length === 0 && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg px-3 py-3 text-sm"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-quaternary)' }}
        >
          Aucun résultat pour « {query} »
        </div>
      )}
    </div>
  )
}
