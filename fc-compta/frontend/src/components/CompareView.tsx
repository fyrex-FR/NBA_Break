import { useState } from 'react'
import type { BreakReport, CompareAnalysis, SpotComparison } from '../types'
import { fetchCompare } from '../api'
import { Loader2, Sparkles, ArrowRight, AlertTriangle } from 'lucide-react'

interface Props {
  breakA: BreakReport
  breakB: BreakReport
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

export function CompareView({ breakA, breakB, onClose }: Props) {
  const [boxCostA, setBoxCostA] = useState('')
  const [boxCostB, setBoxCostB] = useState('')
  const [analysis, setAnalysis] = useState<CompareAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedCostA = parseFormula(boxCostA)
  const parsedCostB = parseFormula(boxCostB)
  const grilleA = breakA.grille_announced || 0
  const grilleB = breakB.grille_announced || 0
  const marginA = parsedCostA != null && grilleA ? Math.round((grilleA - parsedCostA) * 100) / 100 : breakA.margin_eur
  const marginB = parsedCostB != null && grilleB ? Math.round((grilleB - parsedCostB) * 100) / 100 : breakB.margin_eur
  const avgA = grilleA && breakA.total_spots ? Math.round(grilleA / breakA.total_spots * 100) / 100 : null
  const avgB = grilleB && breakB.total_spots ? Math.round(grilleB / breakB.total_spots * 100) / 100 : null

  async function runCompare() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetchCompare(breakA, breakB)
      setAnalysis(r.analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  // Override the fetch to pass box costs
  async function runCompareWithCosts() {
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
        throw new Error(body.detail || `HTTP ${res.status}`)
      }
      const r = await res.json()
      setAnalysis(r.analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Comparaison</h2>
        <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
          Fermer
        </button>
      </div>

      {/* Summary cards side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SummaryCard
          label="A"
          color="var(--accent)"
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
          color="#3b82f6"
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

      {/* Launch analysis */}
      {!analysis && !loading && (
        <button
          onClick={runCompareWithCosts}
          className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          style={{ background: 'linear-gradient(135deg, var(--accent), #e85d04)', color: '#fff' }}
        >
          <Sparkles className="w-4 h-4" />
          Analyser spot par spot
        </button>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: 'var(--text-2)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          Analyse IA en cours...
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl text-xs flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Results */}
      {analysis && (
        <div className="space-y-4">
          {/* Verdict */}
          <div className="px-5 py-4 rounded-xl text-sm font-semibold" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', color: 'var(--accent)' }}>
            {analysis.verdict}
          </div>

          {/* Spot comparison table */}
          {analysis.spot_comparison && analysis.spot_comparison.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="px-4 py-2.5" style={{ background: 'var(--surface-2)' }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
                  Comparaison par equipe
                </span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--text-2)' }}>Equipe</th>
                    <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--accent)' }}>A</th>
                    <th className="text-center px-3 py-2 font-semibold" style={{ color: '#3b82f6' }}>B</th>
                    <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.spot_comparison.map((row, idx) => (
                    <SpotRow key={idx} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Global analysis */}
          {analysis.global_analysis && (
            <div className="px-5 py-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>Analyse globale</div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{analysis.global_analysis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, color, title, grille, spots, avg, margin, products, boxCostInput, onBoxCostChange, parsedCost, originalCost }: {
  label: string; color: string; title: string; grille: number; spots: number; avg: number | null
  margin: number | null; products: string[]; boxCostInput: string; onBoxCostChange: (v: string) => void
  parsedCost: number | null; originalCost: number
}) {
  const effectiveCost = parsedCost ?? originalCost
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: `1px solid ${color}30` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: `${color}20`, color }}>{label}</span>
        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{title}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div>
          <div className="text-[10px] uppercase" style={{ color: 'var(--text-3)' }}>Grille</div>
          <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{grille ? `${grille}€` : '—'}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase" style={{ color: 'var(--text-3)' }}>Spots</div>
          <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{spots}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase" style={{ color: 'var(--text-3)' }}>Moy/spot</div>
          <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{avg ? `${avg}€` : '—'}</div>
        </div>
      </div>
      {/* Box cost input */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-3)' }}>Cout box:</span>
        <input
          type="text"
          value={boxCostInput}
          onChange={(e) => onBoxCostChange(e.target.value)}
          placeholder={originalCost ? `${originalCost}` : 'ex: 700 ou 12*60'}
          className="flex-1 px-2 py-1 rounded text-xs outline-none"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: parsedCost != null ? 'var(--text)' : 'var(--text-3)' }}
        />
        {parsedCost != null && <span className="text-xs font-semibold" style={{ color }}>{parsedCost}€</span>}
      </div>
      {/* Margin */}
      {margin != null && grille > 0 && (
        <div className="text-xs" style={{ color: margin > 0 ? (margin / grille > 0.4 ? 'var(--red)' : 'var(--green)') : 'var(--text-3)' }}>
          Marge: {margin}€ ({Math.round(margin / grille * 100)}%)
        </div>
      )}
      {/* Products */}
      {products.length > 0 && (
        <div className="mt-2 text-[10px]" style={{ color: 'var(--text-3)' }}>
          {products.join(' · ')}
        </div>
      )}
    </div>
  )
}

function SpotRow({ row }: { row: SpotComparison }) {
  const isSplit = row.split_a > 1 || row.split_b > 1
  const isMissing = row.split_a === 0 || row.split_b === 0
  return (
    <tr style={{ borderBottom: '1px solid var(--border)', background: isSplit ? 'rgba(234,179,8,0.03)' : isMissing ? 'rgba(239,68,68,0.03)' : undefined }}>
      <td className="px-4 py-2 font-medium" style={{ color: 'var(--text)' }}>
        {row.team}
        {isSplit && <span className="ml-1 text-[10px]" style={{ color: 'var(--yellow)' }}>split</span>}
      </td>
      <td className="px-3 py-2 text-center" style={{ color: row.split_a === 0 ? 'var(--text-3)' : 'var(--text)' }}>
        {row.split_a === 0 ? '—' : (
          <>
            {row.price_a || '?'}
            {row.split_a > 1 && <span className="text-[10px] ml-0.5" style={{ color: 'var(--yellow)' }}>x{row.split_a}</span>}
          </>
        )}
      </td>
      <td className="px-3 py-2 text-center" style={{ color: row.split_b === 0 ? 'var(--text-3)' : 'var(--text)' }}>
        {row.split_b === 0 ? '—' : (
          <>
            {row.price_b || '?'}
            {row.split_b > 1 && <span className="text-[10px] ml-0.5" style={{ color: 'var(--yellow)' }}>x{row.split_b}</span>}
          </>
        )}
      </td>
      <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--text-2)' }}>
        {row.notes}
      </td>
    </tr>
  )
}
