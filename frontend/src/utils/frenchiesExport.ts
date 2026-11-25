import ExcelJS from 'exceljs'
import { FAMILY_LABELS, frenchFamilyGroups, type FrenchSeries } from './frenchies.ts'

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
    const sheet = workbook.addWorksheet(sheetName(group.name, used), { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] })
    const families = frenchFamilyGroups(group.columns)
    sheet.addRow(['Joueur', ...group.columns.map(() => ''), 'Auto', 'Memo'])
    sheet.addRow(['', ...group.columns.map((column) => column.name), '', ''])
    sheet.mergeCells(1, 1, 2, 1)
    sheet.mergeCells(1, group.columns.length + 2, 2, group.columns.length + 2)
    sheet.mergeCells(1, group.columns.length + 3, 2, group.columns.length + 3)
    for (const family of families) {
      const first = family.start + 2
      const last = first + family.columns.length - 1
      if (first !== last) sheet.mergeCells(1, first, 1, last)
      sheet.getCell(1, first).value = FAMILY_LABELS[family.family]
    }
    for (const player of group.players) {
      sheet.addRow([player.name, ...group.columns.map((column) => player.sets.has(column.key) ? '×' : ''), player.auto, player.memo])
    }
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(2).font = { bold: true }
    sheet.getColumn(1).width = 26
    for (let i = 2; i <= group.columns.length + 3; i++) {
      sheet.getColumn(i).width = 20
      sheet.getColumn(i).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    }
    for (const family of families) {
      const col = family.start + 2
      for (let row = 1; row <= sheet.rowCount; row++) {
        sheet.getCell(row, col).border = { left: { style: 'medium', color: { argb: 'FF94A3B8' } } }
      }
    }
  }
  return workbook.xlsx.writeBuffer()
}
