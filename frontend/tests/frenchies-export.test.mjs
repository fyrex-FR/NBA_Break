import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { buildFrenchiesWorkbook } from '../src/utils/frenchiesExport.ts'

test('exporte un vrai xlsx avec une feuille par série, y compris les noms Excel invalides ou identiques', async () => {
  const series = [1, 2].map((n) => ({ id: String(n), name: 'Une très longue série / identique [2026] '.repeat(2), sets: ['Base', 'Auto'], players: [{ name: 'Victor Wembanyama', sets: new Set(['Base']), auto: 2, memo: 1 }] }))
  const data = await buildFrenchiesWorkbook(series)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(data)
  assert.equal(workbook.worksheets.length, 2)
  assert.notEqual(workbook.worksheets[0].name, workbook.worksheets[1].name)
  assert.equal(workbook.worksheets[0].getCell('A2').value, 'Victor Wembanyama')
  assert.equal(workbook.worksheets[0].getCell('B2').value, '×')
  assert.equal(workbook.worksheets[0].getCell('D2').value, 2)
  assert.equal(workbook.worksheets[0].getCell('E2').value, 1)
})
