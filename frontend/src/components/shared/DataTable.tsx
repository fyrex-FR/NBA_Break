import { useEffect, useMemo, useState } from 'react'
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
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronLeft, ChevronRight, Download, Copy, MoreHorizontal, Search, X, Check } from 'lucide-react'
import { Popover } from '../ui/primitives'
import { useMediaQuery, MOBILE_QUERY } from '../../hooks/useMediaQuery'

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
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

interface DataTableProps<T> {
  data: T[]
  // Les colonnes mélangent des types de valeur (string, number…) : `any` est le
  // paramètre attendu par TanStack pour un tableau hétérogène.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  onRowClick?: (row: T) => void
  pageSize?: number
  searchable?: boolean
  searchPlaceholder?: string
  /** Nom du fichier CSV exporté (sans extension). Ex: "LeBron_James", "Chicago_Bulls" */
  exportName?: string
  /** Tri initial. Ex: [{ id: 'Break Score', desc: true }] */
  initialSorting?: SortingState
  /** Ajoute une colonne de rang (#) calculée sur l'ordre affiché. */
  rankColumn?: boolean
  /** Colonnes affichées dans la vue liste mobile (hors 1re colonne = titre). Défaut : les 4 suivantes. */
  mobileColumns?: string[]
}

const MOBILE_BATCH = 30

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  pageSize = 50,
  searchable = false,
  searchPlaceholder = 'Rechercher...',
  exportName,
  initialSorting,
  rankColumn = false,
  mobileColumns,
}: DataTableProps<T>) {
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const [mobileLimit, setMobileLimit] = useState(MOBILE_BATCH)
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? [])
  const [globalFilter, setGlobalFilter] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setSorting(initialSorting ?? [])
  }, [initialSorting])

  useEffect(() => { setMobileLimit(MOBILE_BATCH) }, [sorting, globalFilter, data])

  const showSearch = searchable || data.length > 20

  // TanStack Table renvoie des fonctions non mémoïsables : le React Compiler saute ce composant, c'est attendu.
  // eslint-disable-next-line react-hooks/incompatible-library
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

  // Colonnes numériques : alignées à droite, chiffres tabulaires.
  const firstRow = table.getCoreRowModel().rows[0]
  const numericCols = useMemo(() => {
    const set = new Set<string>()
    if (!firstRow) return set
    for (const col of table.getAllLeafColumns()) {
      try {
        if (typeof firstRow.getValue(col.id) === 'number') set.add(col.id)
      } catch { /* colonne display sans accessor */ }
    }
    return set
  }, [firstRow, table])

  function handleCopyToClipboard() {
    const headers = table.getAllColumns().map((c) => String(c.columnDef.header ?? c.id))
    const rows = table.getFilteredRowModel().rows.map((row) =>
      row.getVisibleCells().map((cell) => String(cell.getValue() ?? '')),
    )
    const text = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => { setCopied(false); setMenuOpen(false) }, 900)
  }

  const { pageIndex } = table.getState().pagination
  const filteredCount = table.getFilteredRowModel().rows.length
  const pageStart = pageIndex * pageSize

  return (
    <div className="ui-card overflow-hidden">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {showSearch ? (
          <div className="relative basis-full sm:basis-auto flex-1 min-w-0 sm:max-w-sm">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-quaternary)' }} />
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="ui-input !h-8 pl-8 pr-8"
            />
            {globalFilter && (
              <button onClick={() => setGlobalFilter('')} className="absolute right-1 top-1/2 -translate-y-1/2 ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon" aria-label="Effacer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : <div className="flex-1" />}
        {isMobile && <MobileSort table={table} />}
        <span className="ml-auto text-xs num hidden sm:inline whitespace-nowrap" style={{ color: 'var(--text-quaternary)' }}>
          {globalFilter ? `${filteredCount.toLocaleString('fr-FR')} / ${data.length.toLocaleString('fr-FR')}` : `${data.length.toLocaleString('fr-FR')} lignes`}
        </span>
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="ui-btn ui-btn-ghost ui-btn-icon !h-8 !w-8" title="Exporter" aria-label="Exporter">
            <MoreHorizontal className="w-4 h-4" />
          </button>
          <Popover open={menuOpen} onClose={() => setMenuOpen(false)} align="right" width={220}>
            <button
              onClick={() => { exportToCsv(table, exportName || 'export'); setMenuOpen(false) }}
              className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] ui-row-hover"
              style={{ color: 'var(--text-primary)' }}
            >
              <Download className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} /> Télécharger en CSV
            </button>
            <button
              onClick={handleCopyToClipboard}
              className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] ui-row-hover"
              style={{ color: 'var(--text-primary)' }}
            >
              {copied ? <Check className="w-4 h-4" style={{ color: 'var(--success)' }} /> : <Copy className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
              {copied ? 'Copié' : 'Copier (Excel, Sheets)'}
            </button>
          </Popover>
        </div>
      </div>

      {isMobile ? (
        <MobileList
          table={table}
          rankColumn={rankColumn}
          mobileColumns={mobileColumns}
          numericCols={numericCols}
          onRowClick={onRowClick}
          limit={mobileLimit}
          onMore={() => setMobileLimit((n) => n + MOBILE_BATCH * 2)}
          emptyLabel={globalFilter ? `Aucun résultat pour « ${globalFilter} »` : 'Aucune donnée'}
        />
      ) : (
      <>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {rankColumn && (
                  <th className="w-10 pl-4 pr-1 h-9 text-right text-xs font-medium" style={{ color: 'var(--text-quaternary)', borderBottom: '1px solid var(--border-subtle)' }}>#</th>
                )}
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const canSort = header.column.getCanSort()
                  const numeric = numericCols.has(header.column.id)
                  return (
                    <th
                      key={header.id}
                      className={`group px-3 first:pl-4 last:pr-4 h-9 text-xs font-medium whitespace-nowrap select-none ${canSort ? 'cursor-pointer' : ''} ${numeric ? 'text-right' : 'text-left'}`}
                      style={{
                        color: sorted ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        borderBottom: '1px solid var(--border-subtle)',
                        background: 'var(--bg-panel)',
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    >
                      <span className={`inline-flex items-center gap-1 ${numeric ? 'flex-row-reverse' : ''}`}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          sorted === 'asc' ? <ArrowUp className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                            : sorted === 'desc' ? <ArrowDown className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                              : <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row.original) } : undefined}
                className={`ui-row-hover transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {rankColumn && (
                  <td className="pl-4 pr-1 py-2.5 text-right text-xs num" style={{ color: 'var(--text-quaternary)', borderBottom: '1px solid var(--border-subtle)' }}>
                    {pageStart + i + 1}
                  </td>
                )}
                {row.getVisibleCells().map((cell) => {
                  const numeric = numericCols.has(cell.column.id)
                  return (
                    <td
                      key={cell.id}
                      className={`px-3 first:pl-4 last:pr-4 py-2.5 ${numeric ? 'text-right num' : ''}`}
                      style={{ borderBottom: '1px solid var(--border-subtle)', color: numeric ? 'var(--text-secondary)' : 'var(--text-primary)' }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (rankColumn ? 1 : 0)} className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {globalFilter ? `Aucun résultat pour « ${globalFilter} »` : 'Aucune donnée'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <span className="num">
            {(pageStart + 1).toLocaleString('fr-FR')}–{Math.min(pageStart + pageSize, filteredCount).toLocaleString('fr-FR')} sur {filteredCount.toLocaleString('fr-FR')}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon" aria-label="Page précédente">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="num px-1">
              Page{' '}
              <input
                type="number"
                min={1}
                max={table.getPageCount()}
                defaultValue={pageIndex + 1}
                key={pageIndex}
                onBlur={(e) => {
                  const page = Number(e.target.value) - 1
                  if (page >= 0 && page < table.getPageCount()) table.setPageIndex(page)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const page = Number((e.target as HTMLInputElement).value) - 1
                    if (page >= 0 && page < table.getPageCount()) table.setPageIndex(page)
                  }
                }}
                className="ui-input !h-6 !w-11 !px-1 text-center !text-xs"
              />{' '}
              / {table.getPageCount()}
            </span>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon" aria-label="Page suivante">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}

/* ── Vue liste mobile ───────────────────────────────────────────────────── */

type AnyTable<T> = ReturnType<typeof useReactTable<T>>

function headerLabel(def: { header?: unknown }, id: string) {
  return typeof def.header === 'string' ? def.header : id
}

function MobileSort<T>({ table }: { table: AnyTable<T> }) {
  const cols = table.getAllLeafColumns().filter((c) => c.getCanSort())
  const current = table.getState().sorting[0]
  if (cols.length === 0) return null
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <select
        value={current?.id ?? ''}
        onChange={(e) => table.setSorting(e.target.value ? [{ id: e.target.value, desc: true }] : [])}
        className="ui-select !max-w-[120px]"
        aria-label="Trier par"
      >
        <option value="">Trier…</option>
        {cols.map((c) => <option key={c.id} value={c.id}>{headerLabel(c.columnDef, c.id)}</option>)}
      </select>
      {current && (
        <button
          onClick={() => table.setSorting([{ id: current.id, desc: !current.desc }])}
          className="ui-btn ui-btn-ghost ui-btn-icon !h-8 !w-8"
          aria-label={current.desc ? 'Tri décroissant' : 'Tri croissant'}
        >
          {current.desc ? <ArrowDownWideNarrow className="w-4 h-4" /> : <ArrowUpNarrowWide className="w-4 h-4" />}
        </button>
      )}
    </div>
  )
}

interface MobileListProps<T> {
  table: AnyTable<T>
  rankColumn: boolean
  mobileColumns?: string[]
  numericCols: Set<string>
  onRowClick?: (row: T) => void
  limit: number
  onMore: () => void
  emptyLabel: string
}

function MobileList<T>({ table, rankColumn, mobileColumns, numericCols, onRowClick, limit, onMore, emptyLabel }: MobileListProps<T>) {
  const leaf = table.getVisibleLeafColumns()
  const [titleCol, ...rest] = leaf
  const sortedId = table.getState().sorting[0]?.id
  let picked = mobileColumns
    ? mobileColumns.map((id) => rest.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c)
    : rest.slice(0, 3)
  if (sortedId && sortedId !== titleCol?.id && !picked.some((c) => c.id === sortedId)) {
    const sortedCol = rest.find((c) => c.id === sortedId)
    if (sortedCol) picked = [sortedCol, ...picked].slice(0, Math.max(3, picked.length))
  }
  const textCols = picked.filter((c) => !numericCols.has(c.id))
  const numCols = picked.filter((c) => numericCols.has(c.id))

  const all = table.getPrePaginationRowModel().rows
  const rows = all.slice(0, limit)

  if (!titleCol || rows.length === 0) {
    return <div className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>{emptyLabel}</div>
  }

  return (
    <div>
      <ul>
        {rows.map((row, i) => {
          const cells = new Map(row.getVisibleCells().map((c) => [c.column.id, c]))
          const title = cells.get(titleCol.id)
          return (
            <li key={row.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={`flex items-center gap-3 px-4 py-3 ${onRowClick ? 'active:bg-[var(--bg-hover)] cursor-pointer' : ''}`}
              >
                {rankColumn && (
                  <span className="w-6 text-right text-xs num flex-shrink-0 self-start mt-0.5" style={{ color: 'var(--text-quaternary)' }}>{i + 1}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                    {title && flexRender(title.column.columnDef.cell, title.getContext())}
                  </div>
                  {textCols.map((c) => {
                    const cell = cells.get(c.id)
                    return cell ? (
                      <div key={c.id} className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ) : null
                  })}
                  {numCols.length > 0 && (
                    <div className="flex flex-wrap gap-x-3.5 gap-y-0.5 mt-1 text-xs">
                      {numCols.map((c) => {
                        const cell = cells.get(c.id)
                        if (!cell) return null
                        const isSorted = c.id === sortedId
                        return (
                          <span key={c.id} className="inline-flex items-baseline gap-1 whitespace-nowrap">
                            <span style={{ color: 'var(--text-quaternary)' }}>{headerLabel(c.columnDef, c.id)}</span>
                            <span className="num font-semibold" style={{ color: isSorted ? 'var(--accent)' : 'var(--text-secondary)' }}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
                {onRowClick && <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />}
              </div>
            </li>
          )
        })}
      </ul>
      {all.length > rows.length && (
        <div className="p-3">
          <button onClick={onMore} className="ui-btn ui-btn-secondary w-full !h-10">
            Afficher plus <span className="num" style={{ color: 'var(--text-quaternary)' }}>({(all.length - rows.length).toLocaleString('fr-FR')} restants)</span>
          </button>
        </div>
      )}
    </div>
  )
}
