import type { ChecklistInfo } from '../types'

export type ChecklistSort = 'year' | 'rows_desc' | 'rows_asc' | 'name_asc' | 'name_desc'

export function formatChecklistName(raw: string, displayName?: string) {
  if (displayName?.trim()) {
    const cleanDisplay = displayName.trim()
    const match = cleanDisplay.match(/^(\d{4}-\d{2})\s+(.+)$/)
    if (match) return { name: match[2], year: match[1] }
    return { name: cleanDisplay, year: '' }
  }
  const clean = raw.replace(/\.(parquet|xlsx)$/i, '')
  const match = clean.match(/^(\d{4}-\d{2})-(.+)$/)
  if (match) {
    const year = match[1]
    const name = match[2].replace(/-/g, ' ')
    const titleCaseName = name.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
    return { name: titleCaseName, year }
  }
  const fallback = clean.replace(/-/g, ' ')
  return { name: fallback.charAt(0).toUpperCase() + fallback.slice(1), year: '' }
}

export function sortChecklists(checklists: ChecklistInfo[], mode: ChecklistSort) {
  const sorted = [...checklists]
  sorted.sort((a, b) => {
    const aName = a.display_name || a.checklist_name
    const bName = b.display_name || b.checklist_name
    if (mode === 'rows_desc') return b.rows - a.rows || aName.localeCompare(bName)
    if (mode === 'rows_asc') return a.rows - b.rows || aName.localeCompare(bName)
    if (mode === 'name_desc') return bName.localeCompare(aName)
    return aName.localeCompare(bName)
  })
  return sorted
}

export function formatCount(n: number) {
  return n.toLocaleString('fr-FR')
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${formatCount(n)} ${n > 1 ? pluralForm : singular}`
}

/** "2025-26-Topps-Bowman-Basketball-Checklist.parquet" → "2025-26 Topps Bowman Basketball" */
export function prettyChecklist(raw: string) {
  const clean = raw.replace(/\.(parquet|xlsx)$/i, '')
  const m = clean.match(/^(\d{4}(?:-\d{2})?)-(.+)$/)
  const body = (m ? m[2] : clean).replace(/-/g, ' ').replace(/\s+Checklist$/i, '')
  return m ? `${m[1]} ${body}` : body
}

/** Message lisible depuis une erreur inconnue (catch). */
export function errorMessage(err: unknown, fallback = 'Erreur inattendue') {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return fallback
}
