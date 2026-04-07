import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { CategoryBadge } from '../shared/CategoryBadge'
import { CATEGORY_LOGOMAN, CATEGORY_CASE_HIT, CATEGORY_AUTO_MEM } from '../../types'
import type { CardRecord } from '../../types'

const columnHelper = createColumnHelper<CardRecord>()

const cardColumns = [
  columnHelper.accessor('Player', { header: 'Joueur' }),
  columnHelper.accessor('Team', { header: 'Équipe' }),
  columnHelper.accessor('Box Type', { header: 'Type' }),
  columnHelper.accessor('Category', { header: 'Catégorie', cell: (info) => <CategoryBadge category={info.getValue()} /> }),
  columnHelper.accessor('Numbering', { header: 'Num.' }),
  columnHelper.accessor('Hits', { header: 'Cartes' }),
]

export function FileAnalysisView() {
  const { analysisData } = useAppStore()
  const [selectedFile, setSelectedFile] = useState('')

  if (!analysisData) return null

  const allFiles = useMemo(() => {
    const set = new Set<string>()
    for (const c of analysisData.cards) {
      const name = c.checklist_name || c.File
      if (name) set.add(name)
    }
    return Array.from(set).sort()
  }, [analysisData.cards])

  const fileCards = useMemo(() => {
    if (!selectedFile) return []
    return analysisData.cards.filter((c) => (c.checklist_name || c.File) === selectedFile)
  }, [analysisData.cards, selectedFile])

  const totalHits = fileCards.reduce((s, c) => s + c.Hits, 0)
  const uniquePlayers = new Set(fileCards.flatMap((c) => c.Player.split('/').map((p) => p.trim()).filter(Boolean))).size
  const uniqueTeams = new Set(fileCards.flatMap((c) => c.Team.split('/').map((t) => t.trim()).filter(Boolean))).size

  return (
    <div>
      <h2 className="text-xl font-medium mb-4">📁 Analyse par Fichier</h2>

      <select
        value={selectedFile}
        onChange={(e) => setSelectedFile(e.target.value)}
        className="w-full max-w-lg rounded-lg px-3 py-2 text-sm mb-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
      >
        <option value="">Sélectionnez une checklist...</option>
        {allFiles.map((f) => (
          <option key={f} value={f}>{f.replace('.parquet', '')}</option>
        ))}
      </select>

      {!selectedFile ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          Sélectionnez une checklist pour voir son contenu.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <MetricCard label="Total Cartes" value={totalHits} icon="📊" />
            <MetricCard label="Joueurs" value={uniquePlayers} icon="🎴" />
            <MetricCard label="Équipes" value={uniqueTeams} icon="🛡️" />
            <MetricCard label="Logoman" value={fileCards.filter((c) => c.Category === CATEGORY_LOGOMAN).reduce((s, c) => s + c.Hits, 0)} icon="🔥" />
            <MetricCard label="Case Hit" value={fileCards.filter((c) => c.Category === CATEGORY_CASE_HIT).reduce((s, c) => s + c.Hits, 0)} icon="✨" />
          </div>

          <DataTable data={fileCards} columns={cardColumns as any} searchable searchPlaceholder="Rechercher dans cette checklist..." pageSize={100} exportName={selectedFile.replace('.parquet', '').replace(/\s+/g, '_')} />
        </>
      )}
    </div>
  )
}
