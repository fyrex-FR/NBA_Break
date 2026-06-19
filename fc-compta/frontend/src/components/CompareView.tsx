import { useState } from 'react'
import type { BreakReport, CompareAnalysis, SpotComparison } from '../types'
import { fetchCompare } from '../api'
import { Loader2, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  breakA: BreakReport
  breakB: BreakReport
  sellerA: string | null
  sellerB: string | null
  onClose: () => void
}

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

export function CompareView({ breakA, breakB, sellerA, sellerB, onClose }: Props) {
  const [boxCostA, setBoxCostA] = useState('')
  const [boxCostB, setBoxCostB] = useState('')
  const [analysis, setAnalysis] = useState<CompareAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedCostA = parseFormula(boxCostA)
  const parsedCostB = parseFormula(boxCostB)
  const grilleA = breakA.grille_announced || 0
  const grilleB = breakB.grille_announced || 0
  const marginA = parsedCostA != null && grilleA
    ? Math.round((grilleA - parsedCostA) * 100) / 100
    : breakA.margin_eur
  const marginB = parsedCostB != null && grilleB
    ? Math.round((grilleB - parsedCostB) * 100) / 100
    : breakB.margin_eur
  const avgA = grilleA && breakA.total_spots
    ? Math.round(grilleA / breakA.total_spots * 100) / 100
    : null
  const avgB = grilleB && breakB.total_spots
    ? Math.round(grilleB / breakB.total_spots * 100) / 100
    : null

  async function runCompare() {
    setLoading(true)
    setError(null)
    try {
      const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api'
      const res = await fetch(`${BASE}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          break_a: breakA,
          break_b: breakB,
          box_cost_a: parsedCostA,
          box_cost_b: parsedCostB,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`)
      }
      const r = await res.json() as { analysis: CompareAnalysis }
      setAnalysis(r.analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  // suppress unused import warning
  void fetchCompare

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3"
        style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
          Comparaison
        </h2>
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'var(--surface-3)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
        >
          Fermer
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px" style={{ background: 'var(--border)' }}>
        <SummaryCard
          label="A"
          color="var(--accent)"
          seller={sellerA}
          title={breakA.title}
          grille={grilleA}
          spots={breakA.total_spots}
          avg={avgA}
          margin={marginA}
          products={breakA.detected_products.map(p => p.label)}
          boxCostInput={boxCostA}
          onBoxCostChange={setBoxCostA}
          parsedCost={parsedCostA}
          originalCost={breakA.total_box_cost}
        />
        <SummaryCard
          label="B"
          color="var(--blue)"
          seller={sellerB}
          title={breakB.title}
          grille={grilleB}
          spots={breakB.total_spots}
          avg={avgB}
          margin={marginB}
          products={breakB.detected_products.map(p => p.label)}
          boxCostInput={boxCostB}
          onBoxCostChange={setBoxCostB}
          parsedCost={parsedCostB}
          originalCost={breakB.total_box_cost}
        />
      </div>

      {/* ── Run analysis ── */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: 'var(--text-2)' }}>
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
            Analyse IA en cours…
          </div>
        ) : (
          <button
            onClick={runCompare}
            className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity"
            style={{ background: 'linear-gradient(135deg, var(--accent), #e85d04)', color: '#fff' }}
          >
            {analysis ? (
              <><RefreshCw className="w-4 h-4" /> Réanalyser</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Analyser spot par spot</>
            )}
          </button>
        )}

        {error && (
          <div className="mt-3 px-4 py-3 rounded-xl text-xs flex items-start gap-2"
            style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red-border)' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {analysis && (
        <div style={{ borderTop: '1px solid var(--border)' }}>

          {/* Verdict */}
          <div className="mx-4 mt-4 mb-4 px-5 py-4 rounded-xl"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--accent)', opacity: 0.7 }}>
              Verdict
            </div>
            <p className="text-sm font-semibold leading-relaxed" style={{ color: 'var(--accent)' }}>
              {analysis.verdict}
            </p>
          </div>

          {/* Spot comparison table */}
          {analysis.spot_comparison && analysis.spot_comparison.length > 0 && (
            <div className="mx-4 mb-4 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="px-4 py-2.5 flex items-center gap-3"
                style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                  Comparaison par équipe
                </span>
                <span className="flex items-center gap-3 ml-auto text-[10px] font-bold">
                  <span style={{ color: 'var(--accent)' }}>● A</span>
                  <span style={{ color: 'var(--blue)' }}>● B</span>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>Équipe</th>
                      <th className="text-right px-4 py-2 font-semibold" style={{ color: 'var(--accent)' }}>A</th>
                      <th className="text-right px-4 py-2 font-semibold" style={{ color: 'var(--blue)' }}>B</th>
                      <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>Notes IA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.spot_comparison.map((row, idx) => (
                      <SpotRow key={idx} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Global analysis */}
          {analysis.global_analysis && (
            <div className="mx-4 mb-4 px-5 py-4 rounded-xl"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
                Analyse globale
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
                {analysis.global_analysis}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label, color, seller, title, grille, spots, avg, margin,
  products, boxCostInput, onBoxCostChange, parsedCost, originalCost,
}: {
  label: string; color: string; seller: string | null; title: string
  grille: number; spots: number; avg: number | null; margin: number | null
  products: string[]; boxCostInput: string; onBoxCostChange: (v: string) => void
  parsedCost: number | null; originalCost: number
}) {
  const effectiveCost = parsedCost ?? originalCost
  const marginPct = margin != null && grille > 0 ? Math.round(margin / grille * 100) : null
  const isHighMargin = marginPct != null && marginPct > 40
  const marginColor = isHighMargin ? 'var(--red)' : marginPct != null && marginPct > 20 ? 'var(--yellow)' : 'var(--green)'

  return (
    <div className="p-4" style={{ background: 'var(--surface)' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest"
          style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
          {label}
        </span>
        {seller && (
          <span className="text-sm font-bold" style={{ color }}>{seller}</span>
        )}
      </div>

      <div className="text-sm font-semibold mb-3 leading-snug" style={{ color: 'var(--text)' }}>
        {title}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <MiniStat label="Grille" value={grille ? `${grille}€` : '—'} />
        <MiniStat label="Spots" value={`${spots}`} />
        <MiniStat label="Moy/spot" value={avg ? `${avg}€` : '—'} />
      </div>

      {/* Box cost */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0"
          style={{ color: 'var(--text-3)' }}>
          Coût box
        </span>
        <input
          type="text"
          value={boxCostInput}
          onChange={(e) => onBoxCostChange(e.target.value)}
          placeholder={originalCost ? `${originalCost}` : 'ex: 700 ou 12*60'}
          className="flex-1 px-2 py-1 rounded text-xs outline-none tabular-nums"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: parsedCost != null ? 'var(--text)' : 'var(--text-3)',
          }}
        />
        {parsedCost != null && (
          <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color }}>
            {parsedCost}€
          </span>
        )}
      </div>

      {/* Margin — prominent */}
      {margin != null && grille > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg"
          style={{ background: isHighMargin ? 'var(--red-dim)' : 'var(--green-dim)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: marginColor, opacity: 0.8 }}>
            Marge: {effectiveCost > 0 ? `${margin}€` : '—'}
          </span>
          {marginPct != null && (
            <span className="text-lg font-black tabular-nums" style={{ color: marginColor }}>
              {marginPct}%
            </span>
          )}
        </div>
      )}

      {products.length > 0 && (
        <div className="mt-2 text-[10px] leading-relaxed truncate" style={{ color: 'var(--text-3)' }}>
          {products.join(' · ')}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center px-2 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

function SpotRow({ row }: { row: SpotComparison }) {
  const isSplit = row.split_a > 1 || row.split_b > 1
  const isMissing = row.split_a === 0 || row.split_b === 0

  const priceANum = row.price_a ? parseFloat(row.price_a.replace(/[€\s,]/g, '')) : null
  const priceBNum = row.price_b ? parseFloat(row.price_b.replace(/[€\s,]/g, '')) : null

  let colorA = 'var(--text)'
  let colorB = 'var(--text)'
  if (priceANum != null && priceBNum != null && !isSplit && !isMissing) {
    if (priceANum < priceBNum) {
      colorA = 'var(--green)'; colorB = 'var(--red)'
    } else if (priceBNum < priceANum) {
      colorB = 'var(--green)'; colorA = 'var(--red)'
    }
  }

  return (
    <tr style={{
      borderBottom: '1px solid var(--border)',
      background: isSplit ? 'var(--yellow-dim)' : isMissing ? 'var(--red-dim)' : undefined,
    }}>
      <td className="px-4 py-2 font-semibold" style={{ color: 'var(--text)' }}>
        {row.team}
        {isSplit && (
          <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'var(--yellow-dim)', color: 'var(--yellow)' }}>
            split
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-right font-bold tabular-nums"
        style={{ color: row.split_a === 0 ? 'var(--text-3)' : colorA }}>
        {row.split_a === 0 ? '—' : (
          <>
            {row.price_a || '?'}
            {row.split_a > 1 && (
              <span className="text-[10px] ml-0.5" style={{ color: 'var(--yellow)' }}>×{row.split_a}</span>
            )}
          </>
        )}
      </td>
      <td className="px-4 py-2 text-right font-bold tabular-nums"
        style={{ color: row.split_b === 0 ? 'var(--text-3)' : colorB }}>
        {row.split_b === 0 ? '—' : (
          <>
            {row.price_b || '?'}
            {row.split_b > 1 && (
              <span className="text-[10px] ml-0.5" style={{ color: 'var(--yellow)' }}>×{row.split_b}</span>
            )}
          </>
        )}
      </td>
      <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-2)' }}>
        {row.notes}
      </td>
    </tr>
  )
}
