import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { exportXlsx, downloadTemplate } from '../../api/client'

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

  const checkboxStyle = { accentColor: 'var(--accent)' }

  return (
    <div>
      <h2 className="text-xl font-medium mb-4">📤 Export Personnalisé</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
        {analysisData.metadata.checklists_count} checklists incluses (filtre global appliqué)
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Column selection */}
        <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <h3 className="text-sm font-medium mb-3">📋 Colonnes à exporter</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={includeTeam} onChange={(e) => setIncludeTeam(e.target.checked)} style={checkboxStyle} />
              Équipe
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={includePlayer} onChange={(e) => setIncludePlayer(e.target.checked)} style={checkboxStyle} />
              Joueur
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={includeCards} onChange={(e) => setIncludeCards(e.target.checked)} style={checkboxStyle} />
              Nombre de cartes
            </label>
          </div>
        </div>

        {/* Category selection */}
        <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <h3 className="text-sm font-medium mb-3">🏷️ Catégories</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={includeAuto} onChange={(e) => setIncludeAuto(e.target.checked)} style={checkboxStyle} />
              💎 Auto/Memo
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={includeCase} onChange={(e) => setIncludeCase(e.target.checked)} style={checkboxStyle} />
              ✨ Case Hits
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={includeLogoman} onChange={(e) => setIncludeLogoman(e.target.checked)} style={checkboxStyle} />
              🔥 Logoman
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={includeBase} onChange={(e) => setIncludeBase(e.target.checked)} style={checkboxStyle} />
              📄 Base/Autre
            </label>
          </div>
        </div>
      </div>

      {/* Sort mode */}
      {includeTeam && includePlayer && (
        <div className="mb-6">
          <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Trier par</label>
          <div className="flex gap-2">
            {['Équipe (A-Z)', 'Joueur (A-Z)'].map((mode) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
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

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleExport}
          disabled={loading}
          className="px-4 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '⏳ Export...' : '📊 Télécharger Excel'}
        </button>
        <a
          href={downloadTemplate()}
          className="px-4 py-2.5 rounded-lg text-sm font-medium inline-flex items-center"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-standard)' }}
        >
          📥 Template Checklist
        </a>
      </div>
    </div>
  )
}
