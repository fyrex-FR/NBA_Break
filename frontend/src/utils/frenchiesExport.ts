import ExcelJS from 'exceljs'
import { FAMILY_LABELS, type FrenchSeries } from './frenchies.ts'

/** Un nom de feuille Excel est limité à 31 caractères et doit être unique. */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*\[\]:]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Série'
  let candidate = base.slice(0, 31).replace(/'+$/g, '') || 'Série'
  let n = 2
  while (used.has(candidate.toLocaleLowerCase('fr'))) {
    const suffix = ` (${n++})`
    candidate = base.slice(0, 31 - suffix.length).replace(/'+$/g, '') + suffix
  }
  used.add(candidate.toLocaleLowerCase('fr'))
  return candidate
}

export async function buildFrenchiesWorkbook(series: FrenchSeries[]) {
  const workbook = new ExcelJS.Workbook()
  const used = new Set<string>()
  for (const group of series) {
    const sheet = workbook.addWorksheet(sheetName(group.name, used), { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
    const columns = group.columns.flatMap((column, i) => i === 0 || group.columns[i - 1].family !== column.family ? [null, column] : [column])
    sheet.addRow(['Joueur', ...columns.map((column, i) => column?.name ?? FAMILY_LABELS[columns[i + 1]!.family]), 'Auto', 'Memo'])
    for (const player of group.players) {
      sheet.addRow([player.name, ...columns.map((column) => column && player.sets.has(column.key) ? '×' : ''), player.auto, player.memo])
    }
    sheet.getRow(1).font = { bold: true }
    columns.forEach((column, i) => { if (!column) { sheet.getColumn(i + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1E8F0' } }; sheet.getColumn(i + 2).font = { bold: true } } })
    sheet.getColumn(1).width = 26
    for (let i = 2; i <= columns.length + 3; i++) sheet.getColumn(i).width = 20
  }
  return workbook.xlsx.writeBuffer()
}
