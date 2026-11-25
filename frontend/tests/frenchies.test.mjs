import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFrenchies, frenchFamilyGroups } from '../src/utils/frenchies.ts'

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

test('les groupes contigus couvrent exactement les sets dans le même ordre', () => {
  const [group] = buildFrenchies([card('Victor Wembanyama', 'Z', 'none'), card('Victor Wembanyama', 'A', 'none'), card('Victor Wembanyama', 'Signatures', 'auto'), card('Victor Wembanyama', 'Patch', 'mem')])
  const spans = frenchFamilyGroups(group.columns)
  assert.deepEqual(spans.map(g => [g.family, g.start, g.columns.length]), [['none', 0, 2], ['auto', 2, 1], ['mem', 3, 1]])
  assert.deepEqual(spans.flatMap(g => g.columns), group.columns)
  assert.deepEqual(frenchFamilyGroups([]), [])
})
