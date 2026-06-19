import type { BreakReport } from '../types'
import { AlertTriangle, CheckCircle, XCircle, Info, Package, TrendingUp } from 'lucide-react'

interface Props { data: BreakReport }

const SEVERITY_STYLE = {
  error: { bg: 'rgba(239,68,68,0.1)', color: 'var(--red)', Icon: XCircle },
  warning: { bg: 'rgba(234,179,8,0.1)', color: 'var(--yellow)', Icon: AlertTriangle },
  info: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', Icon: Info },
}

export function BreakCard({ data }: Props) {
  if (data.error) {
    return (
      <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-semibold mb-1">{data.title}</h3>
        <p className="text-sm" style={{ color: 'var(--red)' }}>{data.error}</p>
      </div>
    )
  }

  const hasMargin = data.margin_eur != null && data.total_box_cost > 0

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
            value={`${data.margin_eur}€ (${data.margin_pct}%)`}
            color={data.margin_pct! > 40 ? 'var(--red)' : data.margin_pct! > 20 ? 'var(--yellow)' : 'var(--green)'}
          />
        ) : (
          <Metric label="Marge" value="—" muted />
        )}
      </div>

      {/* Box cost estimation */}
      {data.box_estimates.length > 0 && data.total_box_cost > 0 && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
              Coût estimé des box: {data.total_box_cost}€
            </span>
          </div>
          <div className="space-y-1">
            {data.box_estimates.map((e, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>
                  {e.quantity > 1 ? `${e.quantity}× ` : ''}{e.product} <span style={{ color: 'var(--text-3)' }}>({e.box_type})</span>
                </span>
                <span style={{ color: e.total_price_eur ? 'var(--text)' : 'var(--text-3)' }}>
                  {e.total_price_eur ? `${e.total_price_eur}€` : '?'}
                  {e.confidence != null && e.confidence < 0.8 && <span className="ml-1" style={{ color: 'var(--yellow)' }}>~</span>}
                </span>
              </div>
            ))}
          </div>
          {hasMargin && (
            <div className="mt-2 pt-2 flex items-center gap-2 text-xs font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
              <TrendingUp className="w-3.5 h-3.5" style={{ color: data.margin_pct! > 40 ? 'var(--red)' : 'var(--accent)' }} />
              <span style={{ color: data.margin_pct! > 40 ? 'var(--red)' : 'var(--text)' }}>
                Marge breaker: {data.margin_eur}€ ({data.margin_pct}% de la grille)
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

      {/* Detected products */}
      {data.detected_products.length > 0 && (
        <div className="text-xs" style={{ color: 'var(--text-3)' }}>
          <span className="font-semibold">Produits détectés: </span>
          {data.detected_products.map((p, idx) => (
            <span key={idx}>
              {idx > 0 && ' · '}
              {p.status === 'mapped' ? '✅' : '❌'} {p.label}
              {p.source === 'catalog' && p.score != null && ` (${Math.round(p.score * 100)}%)`}
            </span>
          ))}
        </div>
      )}

      {/* Unmatched products */}
      {data.unmatched_products.length > 0 && (
        <div className="mt-1 text-xs" style={{ color: 'var(--yellow)' }}>
          ⚠️ Non reconnus: {data.unmatched_products.map((p) => p.label).join(', ')}
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
