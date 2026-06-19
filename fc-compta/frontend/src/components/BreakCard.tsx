import { useState, useMemo } from 'react'
import type { BreakReport } from '../types'
import { AlertTriangle, CheckCircle, XCircle, Info, Package, TrendingUp, ExternalLink, ChevronDown } from 'lucide-react'

interface Props { data: BreakReport }

const SEVERITY_STYLE = {
  error: { bg: 'rgba(239,68,68,0.1)', color: 'var(--red)', Icon: XCircle },
  warning: { bg: 'rgba(234,179,8,0.1)', color: 'var(--yellow)', Icon: AlertTriangle },
  info: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', Icon: Info },
}

function parseFormula(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Allow simple expressions: number, number*number, number+number
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

  // Recalculate box costs with overrides
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
    const margin = data.grille_announced > 0 && total > 0 ? Math.round((data.grille_announced - total) * 100) / 100 : null
    const marginPct = margin != null && data.grille_announced > 0 ? Math.round((margin / data.grille_announced) * 1000) / 10 : null
    return { effectiveBoxCost: total, effectiveMargin: margin, effectiveMarginPct: marginPct }
  }, [data.box_estimates, data.grille_announced, overrides])

  if (data.error) {
    return (
      <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-semibold mb-1">{data.title}</h3>
        <p className="text-sm" style={{ color: 'var(--red)' }}>{data.error}</p>
      </div>
    )
  }

  const hasMargin = effectiveMargin != null && effectiveBoxCost > 0
  const hasAnyOverride = Object.keys(overrides).length > 0

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">{data.title}</h3>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            {data.sport?.toUpperCase()} — {data.total_spots} spots — {data.sold_count} vendus
          </span>
        </div>
        {data.coverage === 'complete' && (
          <span className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)' }}>
            <CheckCircle className="w-3 h-3" /> Reconnu
          </span>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Metric label="Grille" value={data.grille_announced > 0 ? `${data.grille_announced}€` : '—'} />
        <Metric label="Vendus" value={`${data.sold_count}/${data.total_spots}`} />
        {data.auction_unresolved > 0 ? (
          <Metric label="Enchères" value={`${data.auction_unresolved} spots`} muted />
        ) : (
          <Metric label="Total vendu" value={data.total_sold > 0 ? `${data.total_sold}€` : '—'} />
        )}
        {hasMargin ? (
          <Metric
            label="Marge estimée"
            value={`${effectiveMargin}€ (${effectiveMarginPct}%)`}
            color={effectiveMarginPct! > 40 ? 'var(--red)' : effectiveMarginPct! > 20 ? 'var(--yellow)' : 'var(--green)'}
          />
        ) : (
          <Metric label="Marge" value="—" muted />
        )}
      </div>

      {/* Box cost estimation — always show if products detected */}
      {data.box_estimates.length > 0 && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
              Coût des box: {effectiveBoxCost > 0 ? `${effectiveBoxCost}€` : '—'}
              {hasAnyOverride && <span className="ml-1" style={{ color: 'var(--accent)' }}>(modifié)</span>}
            </span>
          </div>
          <div className="space-y-1.5">
            {data.box_estimates.map((e, idx) => {
              const overrideVal = overrides[idx] ?? ''
              const parsed = overrideVal ? parseFormula(overrideVal) : null
              return (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className="flex-1" style={{ color: 'var(--text-2)' }}>
                    {e.quantity > 1 ? `${e.quantity}× ` : ''}{e.product} <span style={{ color: 'var(--text-3)' }}>({e.box_type})</span>
                  </span>
                  <input
                    type="text"
                    value={overrideVal}
                    onChange={(ev) => setOverrides({ ...overrides, [idx]: ev.target.value })}
                    placeholder={e.total_price_eur ? `${e.total_price_eur}` : 'prix ou formule'}
                    className="w-24 px-2 py-0.5 rounded text-right text-xs outline-none"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: overrideVal && parsed != null ? 'var(--text)' : overrideVal ? 'var(--red)' : 'var(--text-3)',
                    }}
                  />
                  <span className="w-14 text-right" style={{ color: parsed != null ? 'var(--accent)' : e.total_price_eur ? 'var(--text)' : 'var(--text-3)' }}>
                    {parsed != null ? `${parsed}€` : e.total_price_eur ? `${e.total_price_eur}€` : '?'}
                  </span>
                </div>
              )
            })}
          </div>
          {hasMargin && (
            <div className="mt-2 pt-2 flex items-center gap-2 text-xs font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
              <TrendingUp className="w-3.5 h-3.5" style={{ color: effectiveMarginPct! > 40 ? 'var(--red)' : 'var(--accent)' }} />
              <span style={{ color: effectiveMarginPct! > 40 ? 'var(--red)' : 'var(--text)' }}>
                Marge breaker: {effectiveMargin}€ ({effectiveMarginPct}% de la grille)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Inconsistencies */}
      {data.inconsistencies.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {data.inconsistencies.map((issue, idx) => {
            const s = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.info
            return (
              <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: s.bg, color: s.color }}>
                <s.Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{issue.message}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Detected products with checklist links */}
      {data.detected_products.length > 0 && (
        <div className="text-xs" style={{ color: 'var(--text-3)' }}>
          <span className="font-semibold">Produits détectés: </span>
          {data.detected_products.map((p, idx) => (
            <span key={idx}>
              {idx > 0 && ' · '}
              {p.checklist_id ? (
                <a
                  href={buildChecklistUrl(p.sport_key, p.checklist_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  ✅ {p.label}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ) : (
                <span>
                  {p.status === 'mapped' ? '✅' : '❌'} {p.label}
                </span>
              )}
              {p.source === 'catalog' && p.score != null && ` (${Math.round(p.score * 100)}%)`}
            </span>
          ))}
        </div>
      )}

      {/* Unmatched products */}
      {data.unmatched_products.length > 0 && (
        <div className="mt-1 text-xs" style={{ color: 'var(--yellow)' }}>
          Non reconnus: {data.unmatched_products.map((p) => p.label).join(', ')}
        </div>
      )}

      {/* Spots detail (collapsible) */}
      {data.spots.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowSpots(!showSpots)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide cursor-pointer"
            style={{ color: 'var(--text-2)', background: 'none', border: 'none', padding: 0 }}
          >
            <ChevronDown
              className="w-3.5 h-3.5 transition-transform"
              style={{ transform: showSpots ? 'rotate(180deg)' : 'rotate(0)' }}
            />
            Détail des spots ({data.spots.length})
          </button>
          {showSpots && (
            <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th className="text-left px-3 py-1.5 font-semibold" style={{ color: 'var(--text-2)' }}>Équipe</th>
                    <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--text-2)' }}>Prix</th>
                    <th className="text-center px-3 py-1.5 font-semibold" style={{ color: 'var(--text-2)' }}>Source</th>
                    <th className="text-center px-3 py-1.5 font-semibold" style={{ color: 'var(--text-2)' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spots.map((spot, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-3 py-1.5" style={{ color: 'var(--text)' }}>{spot.name}</td>
                      <td className="px-3 py-1.5 text-right" style={{ color: spot.price_eur != null ? 'var(--text)' : 'var(--text-3)' }}>
                        {spot.price_eur != null ? `${spot.price_eur}€` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{
                          background: spot.price_source === 'final' ? 'rgba(34,197,94,0.1)' :
                                     spot.price_source === 'live' ? 'rgba(59,130,246,0.1)' :
                                     spot.price_source === 'auction' ? 'rgba(234,179,8,0.1)' : 'rgba(255,255,255,0.05)',
                          color: spot.price_source === 'final' ? 'var(--green)' :
                                 spot.price_source === 'live' ? '#3b82f6' :
                                 spot.price_source === 'auction' ? 'var(--yellow)' : 'var(--text-3)',
                        }}>
                          {spot.price_source}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{
                          background: spot.status === 'SOLD' || spot.status === 'UNAVAILABLE' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
                          color: spot.status === 'SOLD' || spot.status === 'UNAVAILABLE' ? 'var(--green)' : 'var(--text-3)',
                        }}>
                          {spot.status === 'UNAVAILABLE' ? 'VENDU' : spot.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, color, muted }: { label: string; value: string; color?: string; muted?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className="text-sm font-semibold" style={{ color: color || (muted ? 'var(--text-3)' : 'var(--text)') }}>{value}</div>
    </div>
  )
}
