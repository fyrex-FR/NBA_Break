import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { QuickPick } from '../shared/QuickPick'
import { prettyChecklist } from '../../utils/checklists'
import { CategoryBadge } from '../shared/CategoryBadge'
import { OddsBadgeList } from '../shared/OddsBadge'
import { discreetBadges } from '../shared/oddsBadgeUtils'
import { useOddsBadges } from '../../hooks/useOddsBadges'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT } from '../../types'
import type { CardRecord } from '../../types'

const columnHelper = createColumnHelper<CardRecord>()

function FileAnalysisViewContent() {
  const { analysisData: storeAnalysisData } = useAppStore()
  // Garanti non nul par le composant enveloppe ci-dessous.
  const analysisData = storeAnalysisData!
  const [selectedFile, setSelectedFile] = useState('')
  const { badgesFor } = useOddsBadges()

  const cardColumns = useMemo(() => [
    columnHelper.accessor('Player', { header: 'Joueur' }),
    columnHelper.accessor('Team', { header: 'Équipe' }),
    columnHelper.accessor('Box Type', {
      header: 'Type',
      cell: (info) => {
        const card = info.row.original
        const entry = badgesFor(card.checklist_id, card['Box Type'])
        return (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span>{info.getValue()}</span>
            {entry && <OddsBadgeList codes={discreetBadges(entry.badges)} bestByGroup={entry.best_by_group} />}
          </span>
        )
      },
    }),
    columnHelper.accessor('Category', { header: 'Catégorie', cell: (info) => <CategoryBadge category={info.getValue()} /> }),
  ], [badgesFor])


  const countsMap = new Map<string, number>()
  for (const c of analysisData.cards) {
    const name = c.checklist_name || c.File
    if (name) countsMap.set(name, (countsMap.get(name) ?? 0) + c.Hits)
  }
  const fileCounts = Array.from(countsMap.entries()).sort((a, b) => b[1] - a[1])
  const allFiles = fileCounts.map(([name]) => name)
  // Une seule checklist : pas de choix à faire.
  const activeFile = selectedFile || (allFiles.length === 1 ? allFiles[0] : '')

  const fileCards = activeFile ? analysisData.cards.filter((c) => (c.checklist_name || c.File) === activeFile) : []

  const totalHits = fileCards.reduce((s, c) => s + c.Hits, 0)
  const uniquePlayers = new Set(fileCards.flatMap((c) => c.Player.split('/').map((p) => p.trim()).filter(Boolean))).size
  const uniqueTeams = new Set(fileCards.flatMap((c) => c.Team.split('/').map((t) => t.trim()).filter(Boolean))).size

  return (
    <div>

      {!activeFile ? (
        <QuickPick title="Checklists de la sélection" items={fileCounts} onPick={setSelectedFile} format={prettyChecklist} />
      ) : (
        <>
          {allFiles.length > 1 && (
            <select value={activeFile} onChange={(e) => setSelectedFile(e.target.value)} className="ui-input !h-10 max-w-lg mb-4">
              {allFiles.map((f) => <option key={f} value={f}>{prettyChecklist(f)}</option>)}
            </select>
          )}
          <div className="grid grid-cols-5 gap-2 sm:gap-3 mb-4 sm:mb-6">
            <MetricCard label="Cartes" value={totalHits} />
            <MetricCard label="Joueurs" value={uniquePlayers} />
            <MetricCard label="Équipes" value={uniqueTeams} />
            <MetricCard label="Logoman" value={fileCards.filter((c) => c.Category === CATEGORY_LOGOMAN).reduce((s, c) => s + c.Hits, 0)} valueColor="var(--cat-logoman)" />
            <MetricCard label="Case hit" value={fileCards.filter((c) => c.Category === CATEGORY_CASE_HIT).reduce((s, c) => s + c.Hits, 0)} valueColor="var(--cat-case)" />
          </div>

          <DataTable data={fileCards} columns={cardColumns} searchable searchPlaceholder="Rechercher dans cette checklist..." pageSize={100} exportName={activeFile.replace('.parquet', '').replace(/\s+/g, '_')} mobileColumns={['Box Type', 'Team', 'Category']} />
        </>
      )}
    </div>
  )
}

/** Attend qu'une analyse soit chargée : les hooks du contenu s'exécutent toujours dans le même ordre. */
export function FileAnalysisView() {
  const ready = useAppStore((s) => !!s.analysisData)
  return ready ? <FileAnalysisViewContent /> : null
}
