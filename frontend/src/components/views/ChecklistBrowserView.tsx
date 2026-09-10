import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { HIT_TYPE_AUTO, HIT_TYPE_AUTO_MEM, HIT_TYPE_MEM } from '../../types'
import type { CardRecord } from '../../types'

type BrowseMode = 'team' | 'insert'
type QuickFilter = 'all' | 'hits' | 'rookies'

type CardGroup = {
  name: string
  cards: CardRecord[]
}

type ProductGroup = {
  id: string
  name: string
  groups: CardGroup[]
  cardCount: number
}

const HIT_TYPES = new Set([HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM])

function splitValues(value: string) {
  return value.split('/').map((item) => item.trim()).filter(Boolean)
}

function isHit(card: CardRecord) {
  return HIT_TYPES.has(card['Hit Type'] || '') || /case hit|logoman/i.test(card.Category || '')
}

function isRookie(card: CardRecord) {
  return /(^|\W)(rc|rookie)(\W|$)/i.test(`${card['Box Type']} ${card.Category}`)
}

function cardSearchText(card: CardRecord) {
  return [card.Player, card.Team, card['Box Type'], card.Numbering, card.Category, card.checklist_name]
    .join(' ')
    .toLocaleLowerCase('fr')
}

function productName(card: CardRecord, names: Map<string, string>) {
  return names.get(card.checklist_id)
    || card.Product
    || card.checklist_name?.replace(/\.parquet$/i, '')
    || card.File?.replace(/\.parquet$/i, '')
    || 'Checklist'
}

function cardNumber(card: CardRecord) {
  const value = card as CardRecord & { 'Card Number'?: string; 'Card #'?: string; Number?: string }
  return value['Card Number'] || value['Card #'] || value.Number || '—'
}

export function ChecklistBrowserView() {
  const { analysisData, availableChecklists } = useAppStore()
  const [mode, setMode] = useState<BrowseMode>('team')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const checklistNames = useMemo(() => new Map(
    availableChecklists.map((checklist) => [
      checklist.checklist_id,
      checklist.display_name || checklist.checklist_name,
    ]),
  ), [availableChecklists])

  const products = useMemo<ProductGroup[]>(() => {
    if (!analysisData) return []

    const normalizedQuery = query.trim().toLocaleLowerCase('fr')
    const productMap = new Map<string, { name: string; cards: CardRecord[] }>()

    for (const card of analysisData.cards) {
      if (quickFilter === 'hits' && !isHit(card)) continue
      if (quickFilter === 'rookies' && !isRookie(card)) continue
      if (normalizedQuery && !cardSearchText(card).includes(normalizedQuery)) continue

      const id = card.checklist_id || card.checklist_name || card.File || 'checklist'
      const product = productMap.get(id) || { name: productName(card, checklistNames), cards: [] }
      product.cards.push(card)
      productMap.set(id, product)
    }

    return Array.from(productMap.entries()).map(([id, product]) => {
      const groupMap = new Map<string, CardRecord[]>()
      for (const card of product.cards) {
        const keys = mode === 'team' ? splitValues(card.Team) : [card['Box Type'].trim()].filter(Boolean)
        for (const key of keys.length ? keys : ['Non classé']) {
          const cards = groupMap.get(key) || []
          cards.push(card)
          groupMap.set(key, cards)
        }
      }

      const groups = Array.from(groupMap.entries())
        .map(([name, cards]) => ({
          name,
          cards: [...cards].sort((a, b) => a.Player.localeCompare(b.Player, 'fr')),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

      return { id, name: product.name, groups, cardCount: product.cards.length }
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [analysisData, checklistNames, mode, query, quickFilter])

  if (!analysisData) return null

  const resultCount = products.reduce((total, product) => total + product.cardCount, 0)
  const searching = query.trim().length > 0

  function isExpanded(key: string) {
    return searching || expanded.has(key)
  }

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <section className="overflow-hidden rounded-sm border border-[#b7b7b7] bg-[#efefef] text-[#222] shadow-[0_2px_8px_rgba(0,0,0,0.28)]">
      <header className="border-b-4 border-[#1f1f1f] bg-[#c71920] px-4 py-3 text-white md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/75">The hobby authority, mais sans clim</div>
            <h2 className="text-2xl font-black uppercase leading-none tracking-tight md:text-3xl">NoClim Checklist</h2>
          </div>
          <span className="border border-white/50 bg-[#991117] px-2 py-1 text-[10px] font-bold uppercase tracking-wider">Definitely not Beckett™</span>
        </div>
      </header>

      <div className="border-b border-[#aaa] bg-[#242424] px-3 py-2 text-xs font-bold uppercase text-white md:px-5">
        Checklist Database &gt; {mode === 'team' ? 'Browse by Team' : 'Browse by Insert'}
      </div>

      <div className="p-3 md:p-5">
        <div className="mb-4 border border-[#aaa] bg-white p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex border border-[#888] bg-[#e5e5e5] p-0.5">
              {(['team', 'insert'] as BrowseMode[]).map((value) => (
                <button
                  key={value}
                  onClick={() => { setMode(value); setExpanded(new Set()) }}
                  className="px-4 py-1.5 text-xs font-bold uppercase"
                  style={{ background: mode === value ? '#c71920' : 'transparent', color: mode === value ? '#fff' : '#333' }}
                >
                  Par {value === 'team' ? 'équipe' : 'insert'}
                </button>
              ))}
            </div>

            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#666]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search players, teams, inserts..."
                className="w-full border border-[#888] bg-white py-2 pl-8 pr-3 text-sm text-[#222] outline-none focus:border-[#c71920]"
              />
            </label>

            <div className="flex flex-wrap gap-1">
              {([
                ['all', 'Toutes'],
                ['hits', 'Hits'],
                ['rookies', 'RC'],
              ] as [QuickFilter, string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setQuickFilter(value)}
                  className="border px-3 py-1.5 text-xs font-bold uppercase"
                  style={{ borderColor: quickFilter === value ? '#991117' : '#999', background: quickFilter === value ? '#c71920' : '#eee', color: quickFilter === value ? '#fff' : '#333' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-[#666]">{resultCount.toLocaleString('fr-FR')} cartes · {products.length} produit{products.length > 1 ? 's' : ''}</div>
        </div>

        {products.length === 0 ? (
          <div className="border border-[#bbb] bg-white p-8 text-center text-sm text-[#555]">No checklist entries found.</div>
        ) : products.map((product) => (
          <article key={product.id} className="mb-5 border border-[#999] bg-white last:mb-0">
            <div className="border-b-2 border-[#c71920] bg-[#333] px-3 py-2 text-sm font-black uppercase text-white md:px-4">
              {product.name} <span className="ml-1 font-normal text-white/65">({product.cardCount})</span>
            </div>

            {product.groups.map((group) => {
              const key = `${product.id}::${mode}::${group.name}`
              const open = isExpanded(key)
              return (
                <div key={key} className="border-b border-[#bbb] last:border-b-0">
                  <button
                    onClick={() => toggle(key)}
                    className="flex w-full items-center justify-between gap-3 bg-[#dedede] px-3 py-2 text-left hover:bg-[#d3d3d3] md:px-4"
                    aria-expanded={open}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-[#1d4f91]">
                      {open ? <ChevronDown className="h-4 w-4 shrink-0 text-[#444]" /> : <ChevronRight className="h-4 w-4 shrink-0 text-[#444]" />}
                      <span className="truncate">{group.name}</span>
                    </span>
                    <span className="shrink-0 border border-[#aaa] bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#555]">{group.cards.length}</span>
                  </button>

                  {open && (
                    <>
                      <div className="hidden overflow-x-auto md:block">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#f0f0f0] text-left uppercase text-[#555]">
                              <th className="w-20 border-b border-[#bbb] px-3 py-2">Card #</th>
                              <th className="border-b border-[#bbb] px-3 py-2">Player</th>
                              <th className="border-b border-[#bbb] px-3 py-2">Team</th>
                              <th className="border-b border-[#bbb] px-3 py-2">Insert / Set</th>
                              <th className="border-b border-[#bbb] px-3 py-2">Serial #</th>
                              <th className="border-b border-[#bbb] px-3 py-2">Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.cards.map((card, index) => (
                              <tr key={`${card.checklist_id}-${group.name}-${index}`} className="odd:bg-white even:bg-[#f7f7f7] hover:bg-[#fff7d6]">
                                <td className="border-b border-[#ddd] px-3 py-2 font-mono text-[#555]">{cardNumber(card)}</td>
                                <td className="border-b border-[#ddd] px-3 py-2 font-semibold text-[#1d4f91]">{card.Player || '—'}</td>
                                <td className="border-b border-[#ddd] px-3 py-2">{card.Team || '—'}</td>
                                <td className="border-b border-[#ddd] px-3 py-2">{card['Box Type'] || '—'}</td>
                                <td className="border-b border-[#ddd] px-3 py-2">{card.Numbering || '—'}</td>
                                <td className="border-b border-[#ddd] px-3 py-2">{card['Hit Type'] && card['Hit Type'] !== 'none' ? card['Hit Type'] : card.Category}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="divide-y divide-[#ddd] md:hidden">
                        {group.cards.map((card, index) => (
                          <div key={`${card.checklist_id}-${group.name}-mobile-${index}`} className="p-3 odd:bg-white even:bg-[#f7f7f7]">
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-bold text-[#1d4f91]">{card.Player || '—'}</span>
                              <span className="shrink-0 font-mono text-xs text-[#666]">#{cardNumber(card)}</span>
                            </div>
                            <div className="mt-1 text-xs text-[#444]">{card.Team || '—'} · {card['Box Type'] || '—'}</div>
                            <div className="mt-1 text-[11px] text-[#777]">{card.Numbering || 'Non numérotée'} · {card['Hit Type'] && card['Hit Type'] !== 'none' ? card['Hit Type'] : card.Category}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </article>
        ))}
      </div>
    </section>
  )
}
