import { useState, useRef } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'

function exportToCsv<T>(table: ReturnType<typeof useReactTable<T>>, filename: string) {
  const headers = table.getAllColumns().map((c) => String(c.columnDef.header ?? c.id))
  const rows = table.getFilteredRowModel().rows.map((row) =>
    row.getVisibleCells().map((cell) => {
      const val = cell.getValue()
      const str = val == null ? '' : String(val)
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str
    }),
  )
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  onRowClick?: (row: T) => void
  pageSize?: number
  searchable?: boolean
  searchPlaceholder?: string
  /** Nom du fichier CSV exporté (sans extension). Ex: "LeBron_James", "Chicago_Bulls" */
  exportName?: string
}

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  pageSize = 50,
  searchable = false,
  searchPlaceholder = 'Rechercher...',
  exportName,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [flashRowId, setFlashRowId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const showSearch = searchable || data.length > 20

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  function handleCopyToClipboard() {
    const headers = table.getAllColumns().map((c) => String(c.columnDef.header ?? c.id))
    const rows = table.getFilteredRowModel().rows.map((row) =>
      row.getVisibleCells().map((cell) => String(cell.getValue() ?? '')),
    )
    const text = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n')
    navigator.clipboard.writeText(text)
    setMenuOpen(false)
  }

  return (
    <div>
      {/* Top bar: search + menu */}
      <div className="flex items-center gap-2 mb-3">
        {showSearch && (
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-standard)',
              color: 'var(--text-primary)',
            }}
          />
        )}
        {!showSearch && <div className="flex-1" />}

        {/* Export menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="px-2 py-2 rounded-lg text-xs"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
            title="Exporter"
          >
            ⋮
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div
                className="absolute right-0 top-full mt-1 z-50 rounded-lg py-1 shadow-lg min-w-[160px]"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)' }}
              >
                <button
                  onClick={() => { exportToCsv(table, exportName || 'export'); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  📥 Télécharger CSV
                </button>
                <button
                  onClick={handleCopyToClipboard}
                  className="w-full text-left px-3 py-2 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  📋 Copier dans le presse-papier
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ background: 'var(--bg-surface)' }}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left font-medium cursor-pointer select-none"
                    style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => {
              const isFlashing = flashRowId === row.id
              return (
              <tr
                key={row.id}
                onClick={() => {
                  if (!onRowClick) return
                  setFlashRowId(row.id)
                  setTimeout(() => {
                    setFlashRowId(null)
                    onRowClick(row.original)
                  }, 120)
                }}
                className={onRowClick ? 'cursor-pointer' : ''}
                style={{
                  background: isFlashing ? 'color-mix(in srgb, var(--accent) 20%, var(--bg-panel))' : i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-surface)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isFlashing) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={(e) => { if (!isFlashing) e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-surface)' }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-4 py-2.5"
                    style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <span>
            Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()} ({data.length} lignes)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 rounded"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-standard)',
                opacity: table.getCanPreviousPage() ? 1 : 0.4,
              }}
            >
              ← Précédent
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 rounded"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-standard)',
                opacity: table.getCanNextPage() ? 1 : 0.4,
              }}
            >
              Suivant →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
