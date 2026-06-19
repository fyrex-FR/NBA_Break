import { useState, useMemo } from 'react'
import type { BreakReport } from '../types'
import {
  AlertTriangle, CheckCircle, XCircle, Info,
  Package, TrendingUp, ExternalLink, ChevronDown,
} from 'lucide-react'

interface Props { data: BreakReport }

function parseFormula(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^[\d.,\s*+\-/()]+$/.test(trimmed)) {
    try {
      const result = new Function(`return (${trimmed.replace(/,/g, '.')})`)()
      return typeof result === 'number' && isFinite(result) ? Math.round(result * 100) / 100 : null
    } catch { return null }
  }
  return null
}

function buildChecklistUrl(sportKey: string, checklistId: string): string {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify([checklistId]))))
  return `https://checklist.cardvaults.app?sport=${sportKey}&s=${encoded}`
}

export function BreakCard({ data }: Props) {
  const [overrides, setOverrides] = useState<Record<number, string>>({})
  const [showSpots, setShowSpots] = useState(false)

  const { effectiveBoxCost, effectiveMargin, effectiveMarginPct } = useMemo(() => {
    let total = 0
    for (let i = 0; i < data.box_estimates.length; i++) {
      const override = overrides[i]
      if (override !== undefined) {
        const parsed = parseFormula(override)
        total += parsed ?? 0
      } else {
        total += data.box_estimates[i].total_price_eur ?? 0
      }
    }
    total = Math.round(total * 100) / 100
    const margin = data.grille_announced > 0 && total > 0
      ? Math.round((data.grille_announced - total) * 100) / 100
      : null
    const marginPct = margin != null && data.grille_announced > 0
      ? Math.round((margin / data.grille_announced) * 1000) / 10
      : null
    return { effectiveBoxCost: total, effectiveMargin: margin, effectiveMarginPct: marginPct }
  }, [data.box_estimates, data.grille_announced, overrides])

  if (data.error) {
    return (
      <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="text-xs font-semibold mb-1 truncate" style={{ color: 'var(--text-2)' }}>{data.title}</div>
        <p className="text-sm" style={{ color: 'var(--red)' }}>{data.error}</p>
      </div>
    )
  }

  const hasMargin = effectiveMargin != null && effectiveBoxCost > 0
  const hasAnyOverride = Object.keys(overrides).length > 0

  let marginColor = 'var(--green)'
  let marginBg = 'var(--green-dim)'
  let marginBorder = 'var(--green-border)'
  if (effectiveMarginPct != null) {
    if (effectiveMarginPct > 40) {
      marginColor = 'var(--red)'; marginBg = 'var(--red-dim)'; marginBorder = 'var(--red-border)'
    } else if (effectiveMarginPct > 20) {
      marginColor = 'var(--yellow)'; marginBg = 'var(--yellow-dim)'; marginBorder = 'var(--yellow-border)'
    }
  }

  const soldPct = data.total_spots > 0 ? Math.round(data.sold_count / data.total_spots * 100) : 0
  const avgSpotPrice = data.grille_announced > 0 && data.total_spots > 0
    ? Math.round(data.grille_announced / data.total_spots * 100) / 100
    : null

  const errors = data.inconsistencies.filter(i => i.severity === 'error')
  const warnings = data.inconsistencies.filter(i => i.severity === 'warning')
  const infos = data.inconsistencies.filter(i => i.severity === 'info')

  const soldCount = data.spots.filter(s => s.status === 'SOLD' || s.status === 'UNAVAILABLE').length

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

      {/* ── Header ── */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-base leading-snug">{data.title}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {data.sport && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                {data.sport}
              </span>
            )}
            {data.auction_unresolved > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: 'var(--yellow-dim)', color: 'var(--yellow)' }}>
                {data.auction_unresolved} enchères en cours
              </span>
            )}
          </div>
        </div>
        {data.coverage === 'complete' && (
          <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
            style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>
            <CheckCircle className="w-3 h-3" /> Reconnu
          </span>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div className="px-5 pb-4 flex items-end gap-6">
        {data.grille_announced > 0 && (
          <StatItem label="Grille" value={`${data.grille_announced}€`} large />
        )}
        {data.total_sold > 0 && (
          <StatItem label="Vendu" value={`${data.total_sold}€`} />
        )}
        {avgSpotPrice && (
          <StatItem label="Moy / spot" value={`${avgSpotPrice}€`} />
        )}
        <div className="flex-1 min-w-[80px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Spots vendus
            </span>
            <span className="text-[10px] font-bold tabular-nums"
              style={{ color: soldPct > 70 ? 'var(--green)' : soldPct > 35 ? 'var(--yellow)' : 'var(--text-2)' }}>
              {data.sold_count}/{data.total_spots}
            </span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${soldPct}%`,
                background: soldPct > 70 ? 'var(--green)' : soldPct > 35 ? 'var(--yellow)' : 'var(--text-3)',
              }} />
          </div>
        </div>
      </div>

      {/* ── Margin hero banner ── */}
      {hasMargin && (
        <div className="mx-4 mb-4 rounded-lg px-4 py-3 flex items-center justify-between"
          style={{ background: marginBg, border: `1px solid ${marginBorder}` }}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 flex-shrink-0" style={{ color: marginColor }} />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: marginColor, opacity: 0.7 }}>
                Marge breaker
              </div>
              <div className="text-xs" style={{ color: marginColor, opacity: 0.8 }}>
                {effectiveMargin}€ de la grille
                {hasAnyOverride && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                    modifié
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-3xl font-black tabular-nums" style={{ color: marginColor }}>
            {effectiveMarginPct}%
          </div>
        </div>
      )}

      {/* ── Errors — full prominence ── */}
      {errors.length > 0 && (
        <div className="mx-4 mb-3 space-y-2">
          {errors.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-3 px-4 py-3 rounded-lg"
              style={{ background: 'var(--red-dim)', border: '1px solid var(--red-border)' }}>
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--red)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--red)' }}>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Warnings + infos — compact ── */}
      {(warnings.length > 0 || infos.length > 0) && (
        <div className="mx-4 mb-3 space-y-1.5">
          {warnings.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded text-xs"
              style={{ background: 'var(--yellow-dim)', color: 'var(--yellow)' }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{issue.message}</span>
            </div>
          ))}
          {infos.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded text-xs"
              style={{ background: 'var(--blue-dim)', color: 'var(--blue)' }}>
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Box cost section ── */}
      {data.box_estimates.length > 0 && (
        <div className="mx-4 mb-4 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
                Coût des box
              </span>
            </div>
            <span className="text-sm font-bold tabular-nums"
              style={{ color: effectiveBoxCost > 0 ? 'var(--text)' : 'var(--text-3)' }}>
              {effectiveBoxCost > 0 ? `${effectiveBoxCost}€` : '—'}
            </span>
          </div>
          <div>
            {data.box_estimates.map((e, idx) => {
              const overrideVal = overrides[idx] ?? ''
              const parsed = overrideVal ? parseFormula(overrideVal) : null
              return (
                <div key={idx} className="flex items-center gap-3 px-4 py-2 text-xs"
                  style={{ borderTop: idx > 0 ? '1px solid var(--border)' : undefined }}>
                  <span className="flex-1 truncate" style={{ color: 'var(--text-2)' }}>
                    {e.quantity > 1 ? `${e.quantity}× ` : ''}{e.product}
                    {e.box_type && (
                      <span className="ml-1" style={{ color: 'var(--text-3)' }}>({e.box_type})</span>
                    )}
                  </span>
                  <input
                    type="text"
                    value={overrideVal}
                    onChange={(ev) => setOverrides({ ...overrides, [idx]: ev.target.value })}
                    placeholder={e.total_price_eur ? `${e.total_price_eur}` : 'prix ou formule'}
                    className="w-24 px-2 py-0.5 rounded text-right text-xs outline-none tabular-nums"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: overrideVal && parsed != null ? 'var(--text)' : overrideVal ? 'var(--red)' : 'var(--text-3)',
                    }}
                  />
                  <span className="w-14 text-right tabular-nums font-semibold"
                    style={{ color: parsed != null ? 'var(--accent)' : e.total_price_eur ? 'var(--text)' : 'var(--text-3)' }}>
                    {parsed != null ? `${parsed}€` : e.total_price_eur ? `${e.total_price_eur}€` : '?'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Products footer ── */}
      {(data.detected_products.length > 0 || data.unmatched_products.length > 0) && (
        <div className="px-5 pb-4 space-y-1">
          {data.detected_products.length > 0 && (
            <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              <span className="font-semibold" style={{ color: 'var(--text-2)' }}>Produits détectés: </span>
              {data.detected_products.map((p, idx) => (
                <span key={idx}>
                  {idx > 0 && <span> · </span>}
                  {p.checklist_id ? (
                    <a
                      href={buildChecklistUrl(p.sport_key, p.checklist_id)}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      {p.label}<ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                    </a>
                  ) : <span>{p.label}</span>}
                  {p.source === 'catalog' && p.score != null && (
                    <span style={{ color: 'var(--text-3)' }}> ({Math.round(p.score * 100)}%)</span>
                  )}
                  {p.alternatives && p.alternatives.length > 0 && (
                    <span>
                      <span style={{ color: 'var(--yellow)' }}> ou </span>
                      {p.alternatives.map((alt, ai) => (
                        <span key={ai}>
                          {ai > 0 && <span style={{ color: 'var(--text-3)' }}>, </span>}
                          <a
                            href={buildChecklistUrl(p.sport_key, alt.checklist_id)}
                            target="_blank" rel="noopener noreferrer"
                            className="hover:underline"
                            style={{ color: 'var(--yellow)' }}
                          >
                            {alt.checklist_name} ({Math.round(alt.score * 100)}%)
                          </a>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
          {data.unmatched_products.length > 0 && (
            <div className="text-[11px]" style={{ color: 'var(--yellow)' }}>
              Non reconnus: {data.unmatched_products.map(p => p.label).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* ── Spots toggle + table ── */}
      {data.spots.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowSpots(!showSpots)}
            className="w-full flex items-center justify-between px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors cursor-pointer"
            style={{
              background: showSpots ? 'var(--surface-2)' : 'transparent',
              color: showSpots ? 'var(--text-2)' : 'var(--text-3)',
              border: 'none',
            }}
          >
            <span className="flex items-center gap-1.5">
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform duration-200"
                style={{ transform: showSpots ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
              Détail des spots ({data.spots.length})
            </span>
            {!showSpots && soldCount > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>
                {soldCount} vendus
              </span>
            )}
          </button>

          {showSpots && (
            <div className="overflow-x-auto" style={{ borderTop: '1px solid var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>Équipe</th>
                    <th className="text-right px-4 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>Prix</th>
                    <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>Source</th>
                    <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spots.map((spot, idx) => {
                    const isSold = spot.status === 'SOLD' || spot.status === 'UNAVAILABLE'
                    return (
                      <tr
                        key={idx}
                        style={{
                          borderTop: '1px solid var(--border)',
                          opacity: isSold ? 0.45 : 1,
                        }}
                      >
                        <td className="px-4 py-1.5 font-medium" style={{ color: 'var(--text)' }}>
                          {spot.name}
                        </td>
                        <td className="px-4 py-1.5 text-right font-bold tabular-nums"
                          style={{ color: spot.price_eur != null ? 'var(--text)' : 'var(--text-3)' }}>
                          {spot.price_eur != null ? `${spot.price_eur}€` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <SourceBadge source={spot.price_source} />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <StatusBadge status={spot.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatItem({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div className="flex-shrink-0">
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className={`font-bold tabular-nums ${large ? 'text-xl' : 'text-sm'}`} style={{ color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    final: { bg: 'var(--green-dim)', color: 'var(--green)' },
    live: { bg: 'var(--blue-dim)', color: 'var(--blue)' },
    auction: { bg: 'var(--yellow-dim)', color: 'var(--yellow)' },
  }
  const s = styles[source] ?? { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-3)' }
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
      style={{ background: s.bg, color: s.color }}>
      {source}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const isSold = status === 'SOLD' || status === 'UNAVAILABLE'
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
      style={{
        background: isSold ? 'var(--green-dim)' : 'rgba(255,255,255,0.05)',
        color: isSold ? 'var(--green)' : 'var(--text-3)',
      }}>
      {status === 'UNAVAILABLE' ? 'VENDU' : status}
    </span>
  )
}
