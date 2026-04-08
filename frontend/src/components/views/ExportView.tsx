import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { exportXlsx, downloadTemplate } from '../../api/client'

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <div
        onClick={() => onChange(!checked)}
        className="relative flex-shrink-0 rounded-full transition-colors"
        style={{
          width: 36, height: 20,
          background: checked ? 'var(--accent)' : 'var(--bg-hover)',
          border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-standard)'}`,
        }}
      >
        <div
          className="absolute top-0.5 rounded-full transition-transform"
          style={{
            width: 16, height: 16,
            background: '#fff',
            transform: checked ? 'translateX(17px)' : 'translateX(1px)',
          }}
        />
      </div>
    </label>
  )
}

export function ExportView() {
  const { selectedSport, selectedChecklistIds, masterKey, analysisData } = useAppStore()
  const [includeTeam, setIncludeTeam] = useState(true)
  const [includePlayer, setIncludePlayer] = useState(true)
  const [includeCards, setIncludeCards] = useState(true)
  const [includeAuto, setIncludeAuto] = useState(true)
  const [includeCase, setIncludeCase] = useState(true)
  const [includeLogoman, setIncludeLogoman] = useState(false)
  const [includeBase, setIncludeBase] = useState(false)
  const [sortMode, setSortMode] = useState('Équipe (A-Z)')
  const [loading, setLoading] = useState(false)

  if (!analysisData) return null

  // Aperçu lignes estimées
  const estimatedRows = analysisData.cards.filter((c) => {
    if (includeLogoman && c.Category === '🔥 Logoman') return true
    if (includeCase && c.Category === '✨ Case Hit') return true
    if (includeAuto && c.Category === '💎 Auto/Mem') return true
    if (includeBase && c.Category === '📄 Base/Autre') return true
    return false
  }).reduce((s, c) => s + c.Hits, 0)

  async function handleExport() {
    setLoading(true)
    try {
      const blob = await exportXlsx({
        sport_key: selectedSport,
        checklist_ids: selectedChecklistIds,
        master_key: masterKey,
        include_team: includeTeam,
        include_player: includePlayer,
        include_cards: includeCards,
        include_auto: includeAuto,
        include_case: includeCase,
        include_logoman: includeLogoman,
        include_base: includeBase,
        sort_mode: sortMode,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export_${selectedSport}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-medium mb-1">📤 Export Personnalisé</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
        {analysisData.metadata.checklists_count} checklists · {analysisData.metadata.total_rows.toLocaleString('fr-FR')} lignes sources
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Colonnes */}
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-tertiary)' }}>📋 COLONNES</h3>
          <Toggle checked={includeTeam}   onChange={setIncludeTeam}   label="Équipe" />
          <Toggle checked={includePlayer} onChange={setIncludePlayer} label="Joueur" />
          <Toggle checked={includeCards}  onChange={setIncludeCards}  label="Nombre de cartes" />
        </div>

        {/* Catégories */}
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-tertiary)' }}>🏷️ CATÉGORIES</h3>
          <Toggle checked={includeAuto}    onChange={setIncludeAuto}    label="💎 Auto/Memo" />
          <Toggle checked={includeCase}    onChange={setIncludeCase}    label="✨ Case Hits" />
          <Toggle checked={includeLogoman} onChange={setIncludeLogoman} label="🔥 Logoman" />
          <Toggle checked={includeBase}    onChange={setIncludeBase}    label="📄 Base/Autre" />
        </div>
      </div>

      {/* Tri */}
      {includeTeam && includePlayer && (
        <div className="mb-6">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>TRIER PAR</p>
          <div className="flex gap-2">
            {['Équipe (A-Z)', 'Joueur (A-Z)'].map((mode) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: sortMode === mode ? 'var(--accent)' : 'var(--bg-surface)',
                  color: sortMode === mode ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${sortMode === mode ? 'var(--accent)' : 'var(--border-subtle)'}`,
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Aperçu + actions */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={handleExport}
          disabled={loading}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-opacity"
          style={{ background: 'var(--accent)', color: '#fff', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '⏳ Génération...' : '📊 Télécharger Excel'}
        </button>
        <a
          href={downloadTemplate()}
          className="px-4 py-2.5 rounded-lg text-sm font-medium inline-flex items-center"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-standard)' }}
        >
          📥 Template
        </a>
        {estimatedRows > 0 && (
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            ~{estimatedRows.toLocaleString('fr-FR')} cartes dans l'export
          </span>
        )}
      </div>
    </div>
  )
}
