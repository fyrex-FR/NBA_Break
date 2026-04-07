import { useMemo, useState } from 'react'
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

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  onRowClick?: (row: T) => void
  pageSize?: number
  searchable?: boolean
  searchPlaceholder?: string
}

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  pageSize = 50,
  searchable = false,
  searchPlaceholder = 'Rechercher...',
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

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

  return (
    <div>
      {searchable && (
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full mb-3 px-3 py-2 rounded-lg text-sm"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-standard)',
            color: 'var(--text-primary)',
          }}
        />
      )}
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
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className={onRowClick ? 'cursor-pointer' : ''}
                style={{
                  background: i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-surface)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-surface)')}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-4 py-2.5"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
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
