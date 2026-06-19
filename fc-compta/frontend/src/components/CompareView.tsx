import { useState } from 'react'
import type { BreakReport, CompareAnalysis } from '../types'
import { fetchCompare } from '../api'
import { Loader2, TrendingUp, AlertTriangle, Package, Layers, MessageSquare } from 'lucide-react'

interface Props {
  breakA: BreakReport
  breakB: BreakReport
  onClose: () => void
}

const SECTIONS: { key: keyof CompareAnalysis; label: string; Icon: typeof TrendingUp }[] = [
  { key: 'prix_marge', label: 'Prix & Marge', Icon: TrendingUp },
  { key: 'splits', label: 'Splits', Icon: Layers },
  { key: 'contenu', label: 'Contenu', Icon: Package },
  { key: 'red_flags', label: 'Red Flags', Icon: AlertTriangle },
]

export function CompareView({ breakA, breakB, onClose }: Props) {
  const [analysis, setAnalysis] = useState<CompareAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const avgA = breakA.grille_announced && breakA.total_spots ? Math.round(breakA.grille_announced / breakA.total_spots * 100) / 100 : null
  const avgB = breakB.grille_announced && breakB.total_spots ? Math.round(breakB.grille_announced / breakB.total_spots * 100) / 100 : null

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg">Comparaison</h2>
        <button onClick={onClose} className="text-xs px-3 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
          Fermer
        </button>
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}></th>
              <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--accent)' }}>A — {breakA.title.slice(0, 30)}</th>
              <th className="text-center px-3 py-2 font-semibold" style={{ color: '#3b82f6' }}>B — {breakB.title.slice(0, 30)}</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Grille" a={breakA.grille_announced ? `${breakA.grille_announced}€` : '—'} b={breakB.grille_announced ? `${breakB.grille_announced}€` : '—'} />
            <Row label="Spots" a={`${breakA.total_spots}`} b={`${breakB.total_spots}`} />
            <Row label="Prix moyen/spot" a={avgA ? `${avgA}€` : '—'} b={avgB ? `${avgB}€` : '—'} />
            <Row label="Vendus" a={`${breakA.sold_count}/${breakA.total_spots}`} b={`${breakB.sold_count}/${breakB.total_spots}`} />
            <Row label="Enchères non résolues" a={`${breakA.auction_unresolved}`} b={`${breakB.auction_unresolved}`} />
            <Row label="Coût box estimé" a={breakA.total_box_cost ? `${breakA.total_box_cost}€` : '—'} b={breakB.total_box_cost ? `${breakB.total_box_cost}€` : '—'} />
            <Row label="Marge" a={breakA.margin_eur != null ? `${breakA.margin_eur}€ (${breakA.margin_pct}%)` : '—'} b={breakB.margin_eur != null ? `${breakB.margin_eur}€ (${breakB.margin_pct}%)` : '—'} />
            <Row label="Produits" a={breakA.detected_products.map(p => p.label).join(', ') || '—'} b={breakB.detected_products.map(p => p.label).join(', ') || '—'} />
            <Row label="Incohérences" a={`${breakA.inconsistencies.length}`} b={`${breakB.inconsistencies.length}`} />
          </tbody>
        </table>
      </div>

      {/* AI analysis */}
      {!analysis && !loading && (
        <button
          onClick={runCompare}
          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
        >
          <MessageSquare className="w-4 h-4" />
          Analyser avec l'IA
        </button>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: 'var(--text-2)' }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          Analyse en cours...
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {analysis && (
        <div className="space-y-3 mt-4">
          {/* Verdict */}
          <div className="px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: 'rgba(249,115,22,0.1)', color: 'var(--accent)' }}>
            {analysis.verdict}
          </div>

          {/* Sections */}
          {SECTIONS.map(({ key, label, Icon }) => (
            analysis[key] ? (
              <div key={key} className="px-4 py-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-2)' }} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{label}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>{analysis[key]}</p>
              </div>
            ) : null
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-2)' }}>{label}</td>
      <td className="px-3 py-2 text-center" style={{ color: 'var(--text)' }}>{a}</td>
      <td className="px-3 py-2 text-center" style={{ color: 'var(--text)' }}>{b}</td>
    </tr>
  )
}
