import { useState, useRef, useEffect } from 'react'

interface MultiSearchSelectProps {
    options: string[]
    value: string[]
    onChange: (value: string[]) => void
    placeholder?: string
}

export function MultiSearchSelect({ options, value, onChange, placeholder = 'Sélectionner des joueurs...' }: MultiSearchSelectProps) {
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
        ? options
            .filter((o) => o.toLowerCase().includes(query.toLowerCase()) && !value.includes(o))
            .slice(0, 50)
        : options.filter((o) => !value.includes(o)).slice(0, 50)

    // Reset highlight when filtered list changes
    useEffect(() => {
        setHighlightIndex(-1)
    }, [query, value])

    function handleSelect(v: string) {
        onChange([...value, v])
        setQuery('')
        setHighlightIndex(-1)
    }

    function handleRemove(v: string) {
        onChange(value.filter((item) => item !== v))
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
        <div ref={ref} className="relative w-full max-w-lg">
            <div
                className="flex flex-wrap gap-1.5 p-1.5 min-h-[42px] rounded-lg cursor-text"
                style={{
                    background: 'var(--bg-surface)',
                    border: `1px solid ${open ? 'var(--accent)' : 'var(--border-standard)'}`,
                }}
                onClick={() => setOpen(true)}
            >
                {value.map((item) => (
                    <span
                        key={item}
                        className="flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-md"
                        style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
                    >
                        {item}
                        <button
                            onClick={(e) => { e.stopPropagation(); handleRemove(item) }}
                            className="hover:text-red-400 transition-colors"
                        >
                            ✕
                        </button>
                    </span>
                ))}
                <input
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={value.length === 0 ? placeholder : ''}
                    className="flex-1 bg-transparent border-none outline-none text-sm min-w-[120px]"
                    style={{ color: 'var(--text-primary)' }}
                />
            </div>

            {/* Dropdown */}
            {open && filtered.length > 0 && (
                <div
                    ref={listRef}
                    className="absolute z-50 w-full mt-1 rounded-lg overflow-y-auto max-h-64 shadow-xl"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)' }}
                >
                    {filtered.map((opt, i) => (
                        <button
                            key={opt}
                            data-option
                            onClick={(e) => { e.stopPropagation(); handleSelect(opt) }}
                            className="w-full text-left px-3 py-2 text-sm transition-colors"
                            style={{
                                color: 'var(--text-secondary)',
                                background: i === highlightIndex ? 'var(--bg-hover)' : 'transparent',
                            }}
                            onMouseEnter={() => setHighlightIndex(i)}
                        >
                            {opt}
                        </button>
                    ))}
                    {options.length > 50 && !query && (
                        <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-quaternary)' }}>
                            Tapez pour affiner ({options.length} joueurs disponibles)
                        </div>
                    )}
                </div>
            )}

            {open && query && filtered.length === 0 && (
                <div
                    className="absolute z-50 w-full mt-1 rounded-lg px-3 py-3 text-sm"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-quaternary)' }}
                >
                    Aucun joueur disponible pour « {query} »
                </div>
            )}
        </div>
    )
}
