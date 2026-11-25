import { Fragment, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { sameIds } from '../../hooks/useRunAnalysis'
import { buildFrenchies, FAMILY_LABELS } from '../../utils/frenchies'
import { prettyChecklist } from '../../utils/checklists'
import './FrenchiesView.css'

export function FrenchiesView() {
  const { analysisData, selectedSport, selectedChecklistIds, analyzedChecklistIds } = useAppStore()
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const ready = selectedSport === 'nba' && !!analysisData && sameIds(selectedChecklistIds, analyzedChecklistIds)
  const series = useMemo(() => ready ? buildFrenchies(analysisData!.cards) : [], [analysisData, ready])

  async function exportExcel() {
    setError('')
    setExporting(true)
    try {
      const { buildFrenchiesWorkbook } = await import('../../utils/frenchiesExport')
      const buffer = await buildFrenchiesWorkbook(series)
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'frenchies.xlsx'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setError("L’export Excel a échoué. Réessaie.")
    } finally {
      setExporting(false)
    }
  }

  if (selectedSport !== 'nba') return <p>La vue Frenchies est disponible pour les checklists NBA.</p>
  if (!ready) return <p>Actualisation des checklists en cours…</p>
  return (
    <section aria-labelledby="frenchies-title">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 id="frenchies-title" className="text-lg font-semibold">Frenchies</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Les joueurs français dans chaque collection ouverte.</p>
        </div>
        <button className="ui-btn ui-btn-secondary" onClick={exportExcel} disabled={!series.length || exporting}>
          <Download size={16} /> {exporting ? 'Export en cours…' : 'Exporter en Excel'}
        </button>
      </div>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Liste vérifiée mais incomplète : certains joueurs français ou variantes de noms peuvent manquer. × indique une présence dans le set pour la famille indiquée ; un même set peut apparaître dans plusieurs familles. Auto et Memo comptent les lignes de checklist (selon Hits), parallèles compris ; une carte auto-memo compte dans les deux.
      </p>
      {error && <p role="alert" className="mb-4">{error}</p>}
      {series.length === 0 && <p>Aucune carte dans les checklists ouvertes.</p>}
      <div className="space-y-6">
        {series.map((group) => (
          <section key={group.id} aria-label={prettyChecklist(group.name)}>
            <h3 className="font-semibold mb-2">{prettyChecklist(group.name)}</h3>
            {group.players.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Aucun joueur de la liste vérifiée dans cette checklist.</p> : (
              <>
                <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>Fais défiler le tableau horizontalement pour voir tous les sets.</p>
                <div className="frenchies-scroll" role="region" aria-label={`Tableau ${prettyChecklist(group.name)}`} tabIndex={0}>
                  <table className="frenchies-table">
                    <thead><tr><th scope="col">Joueur</th>{group.columns.map((column, i) => <Fragment key={column.key}>{(i === 0 || group.columns[i - 1].family !== column.family) && <th scope="col" className="frenchies-family">{FAMILY_LABELS[column.family]}</th>}<th scope="col">{column.name}</th></Fragment>)}<th scope="col">Auto</th><th scope="col">Memo</th></tr></thead>
                    <tbody>{group.players.map((player) => (
                      <tr key={player.name}><th scope="row">{player.name}</th>{group.columns.map((column, i) => <Fragment key={column.key}>{(i === 0 || group.columns[i - 1].family !== column.family) && <td className="frenchies-family" aria-hidden="true" />}<td>{player.sets.has(column.key) ? '×' : ''}</td></Fragment>)}<td>{player.auto}</td><td>{player.memo}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}
