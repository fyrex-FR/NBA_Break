import { Segmented } from '../ui/primitives'
import { Loader2, Download, FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { exportXlsx, downloadTemplate } from '../../api/client'
import { HIT_TYPE_AUTO, HIT_TYPE_AUTO_MEM, HIT_TYPE_MEM } from '../../types'

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 py-2.5 text-left"
    >
      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
      <span
        className="relative flex-shrink-0 rounded-full transition-colors"
        style={{ width: 38, height: 22, background: checked ? 'var(--accent)' : 'var(--bg-hover)', boxShadow: checked ? 'none' : 'inset 0 0 0 1px var(--border-standard)' }}
      >
        <span
          className="absolute top-[3px] left-[3px] rounded-full transition-transform"
          style={{ width: 16, height: 16, background: '#fff', transform: checked ? 'translateX(16px)' : 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }}
        />
      </span>
    </button>
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
    if (includeAuto && [HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM].includes(c['Hit Type'] || '')) return true
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
      <p className="text-sm mb-4 sm:mb-6 num" style={{ color: 'var(--text-tertiary)' }}>
        {analysisData.metadata.checklists_count} checklists · {analysisData.metadata.total_rows.toLocaleString('fr-FR')} lignes sources
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <section className="ui-card p-4">
          <h3 className="ui-eyebrow mb-2">Colonnes</h3>
          <Toggle checked={includeTeam}   onChange={setIncludeTeam}   label="Équipe" />
          <Toggle checked={includePlayer} onChange={setIncludePlayer} label="Joueur" />
          <Toggle checked={includeCards}  onChange={setIncludeCards}  label="Nombre de cartes" />
        </section>

        <section className="ui-card p-4">
          <h3 className="ui-eyebrow mb-2">Catégories</h3>
          <Toggle checked={includeAuto}    onChange={setIncludeAuto}    label="Hits auto / memo" />
          <Toggle checked={includeCase}    onChange={setIncludeCase}    label="Case hits" />
          <Toggle checked={includeLogoman} onChange={setIncludeLogoman} label="Logoman" />
          <Toggle checked={includeBase}    onChange={setIncludeBase}    label="Base / autre" />
        </section>
      </div>

      {includeTeam && includePlayer && (
        <div className="mb-6">
          <p className="ui-eyebrow mb-2">Trier par</p>
          <Segmented<string>
            value={sortMode}
            onChange={setSortMode}
            ariaLabel="Tri de l'export"
            options={[{ value: 'Équipe (A-Z)', label: 'Équipe A → Z' }, { value: 'Joueur (A-Z)', label: 'Joueur A → Z' }]}
          />
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={handleExport} disabled={loading} className="ui-btn ui-btn-primary ui-btn-lg flex-1 sm:flex-none">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {loading ? 'Génération…' : 'Télécharger l’Excel'}
        </button>
        <a href={downloadTemplate()} className="ui-btn ui-btn-secondary ui-btn-lg">
          <FileSpreadsheet className="w-4 h-4" /> Template
        </a>
        {estimatedRows > 0 && (
          <span className="w-full sm:w-auto text-xs num" style={{ color: 'var(--text-tertiary)' }}>
            ≈ {estimatedRows.toLocaleString('fr-FR')} cartes dans l’export
          </span>
        )}
      </div>
    </div>
  )
}
