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
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(-1)
  }, [query])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return
    const items = listRef.current.querySelectorAll('[data-option]')
    items[highlightIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  function handleSelect(v: string) {
    onChange(v)
    setQuery('')
    setOpen(false)
    setHighlightIndex(-1)
  }

  function handleClear() {
    onChange('')
    setQuery('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          handleSelect(filtered[highlightIndex])
        }
        break
      case 'Escape':
        setOpen(false)
        setHighlightIndex(-1)
        break
    }
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
            onKeyDown={handleKeyDown}
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
          ref={listRef}
          className="absolute z-50 w-full mt-1 rounded-lg overflow-y-auto max-h-64 shadow-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)' }}
        >
          {filtered.map((opt, i) => (
            <button
              key={opt}
              data-option
              onClick={() => handleSelect(opt)}
              className="w-full text-left px-3 py-2 text-sm transition-colors"
              style={{
                color: opt === value ? 'var(--accent)' : 'var(--text-secondary)',
                background: i === highlightIndex ? 'var(--bg-hover)' : 'transparent',
              }}
              onMouseEnter={() => setHighlightIndex(i)}
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
