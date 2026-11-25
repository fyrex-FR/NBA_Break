import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFrenchies } from '../src/utils/frenchies.ts'

const card = (player, box, hit, id = 'a', hits = 1) => ({ Player: player, 'Box Type': box, 'Hit Type': hit, checklist_id: id, checklist_name: `Série ${id}`, Hits: hits })

test('regroupe par checklist, reconnaît les duals et compte auto-memo dans les deux', () => {
  const result = buildFrenchies([
    card('Victor Wembanyama / Nolan Traore', 'Base', 'none'),
    card('Victor Wembanyama', 'Signatures', 'auto_mem', 'a', 2),
    card('Victor Wembanyama', 'Base', 'mem', 'b'),
    card('Victor Wembanyama Jr.', 'Base', 'auto'),
  ])
  assert.equal(result.length, 2)
  const a = result.find((series) => series.id === 'a')
  const w = a.players.find((player) => player.name === 'Victor Wembanyama')
  const n = a.players.find((player) => player.name === 'Nolan Traoré')
  assert.deepEqual(a.columns.map(c => c.name), ['Base', 'Signatures'])
  assert.deepEqual(a.columns.filter(c => w.sets.has(c.key)).map(c => c.name), ['Base', 'Signatures'])
  assert.equal(w.auto, 2)
  assert.equal(w.memo, 2)
  assert.equal(n.auto, 0)
  assert.equal(result.find((series) => series.id === 'b').players[0].memo, 1)
})

test('garde les séries sans joueur reconnu et ne double pas un joueur répété sur un dual', () => {
  const groups = buildFrenchies([
    card('LeBron James', 'Base', 'auto', 'vide'),
    card('Nolan Traore / Nolan Traoré', 'Dual', 'auto_mem', 'dual'),
  ])
  assert.equal(groups.find((group) => group.id === 'vide').players.length, 0)
  assert.deepEqual(groups.find((group) => group.id === 'vide').columns, [])
  const player = groups.find((group) => group.id === 'dual').players[0]
  assert.equal(player.auto, 1)
  assert.equal(player.memo, 1)
})

test("classe les colonnes selon Hit Type, même pour un set partagé", () => {
  const [group] = buildFrenchies([card("Victor Wembanyama", "Signatures", "none"), card("Nolan Traoré", "Signatures", "auto"), card("Victor Wembanyama", "Patch", "mem"), card("Victor Wembanyama", "Dual", "auto_mem")])
  assert.deepEqual(group.columns.map(c => [c.family, c.name]), [["none", "Signatures"], ["auto", "Signatures"], ["mem", "Patch"], ["auto_mem", "Dual"]])
  const victor = group.players.find(p => p.name === "Victor Wembanyama")
  assert.equal(victor.sets.has(group.columns[0].key), true)
  assert.equal(victor.sets.has(group.columns[1].key), false)
})


test('export Excel conserve les familles, séparateurs et présences', async () => {
  const ExcelJS = (await import('exceljs')).default
  const { buildFrenchiesWorkbook } = await import('../src/utils/frenchiesExport.ts')
  const groups = buildFrenchies([card('Victor Wembanyama', 'Signatures', 'none'), card('Nolan Traoré', 'Signatures', 'auto'), card('Victor Wembanyama', 'Patch', 'mem'), card('Victor Wembanyama', 'Dual', 'auto_mem')])
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await buildFrenchiesWorkbook(groups))
  const sheet = workbook.worksheets[0]
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['Joueur', 'Bases / Inserts', 'Signatures', 'Auto', 'Signatures', 'Memo', 'Patch', 'Auto / Memo', 'Dual', 'Auto', 'Memo'])
  assert.equal(sheet.getRow(3).getCell(3).value, '×')
  assert.equal(sheet.getRow(3).getCell(5).value, '')
  assert.equal(sheet.views[0].xSplit, 1)
  assert.equal(sheet.views[0].ySplit, 1)
})
