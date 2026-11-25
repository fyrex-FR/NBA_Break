import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { buildFrenchiesWorkbook } from '../src/utils/frenchiesExport.ts'

test('exporte un vrai xlsx avec une feuille par série, y compris les noms Excel invalides ou identiques', async () => {
  const series = [1, 2].map((n) => ({ id: String(n), name: 'Une très longue série / identique [2026] '.repeat(2), columns: [{ key: 'base', name: 'Base', family: 'none' }, { key: 'auto', name: 'Auto', family: 'auto' }], players: [{ name: 'Victor Wembanyama', sets: new Set(['base']), auto: 2, memo: 1 }] }))
  const data = await buildFrenchiesWorkbook(series)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(data)
  assert.equal(workbook.worksheets.length, 2)
  assert.notEqual(workbook.worksheets[0].name, workbook.worksheets[1].name)
  assert.equal(workbook.worksheets[0].getCell('A3').value, 'Victor Wembanyama')
  assert.equal(workbook.worksheets[0].getCell('B3').value, '×')
  assert.equal(workbook.worksheets[0].getCell('D3').value, 2)
  assert.equal(workbook.worksheets[0].getCell('E3').value, 1)
})

test('fusionne les familles sans colonnes vides et fige deux lignes', async () => {
  const columns = ['none', 'none', 'auto', 'mem', 'auto_mem', 'unknown'].map((family, i) => ({ key: String(i), name: `Set ${i}`, family }))
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await buildFrenchiesWorkbook([{ id: 'a', name: 'A', columns, players: [{ name: 'Victor Wembanyama', sets: new Set(['0', '2']), auto: 1, memo: 0 }] }]))
  const sheet = workbook.worksheets[0]
  assert.equal(sheet.getCell('B1').value, 'Bases / Inserts')
  assert.equal(sheet.getCell('C1').master.address, 'B1')
  assert.deepEqual(sheet.getRow(2).values.slice(2, 8), columns.map(c => c.name))
  assert.equal(sheet.columnCount, 9)
  assert.equal(sheet.getCell('H3').value, 1)
  assert.equal(sheet.views[0].xSplit, 1)
  assert.equal(sheet.views[0].ySplit, 2)
})
