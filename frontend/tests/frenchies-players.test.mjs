import test from 'node:test'
import assert from 'node:assert/strict'
import { playersFromCards, playersFromCatalog, teamsFromPlayers, sortFrench } from '../src/utils/frenchies.ts'

const card = (Player, Team, Category, id = 'a', Hits = 1) => ({ Player, Team, Category, Hits, checklist_id: id, checklist_name: `Série ${id}`, Year: '2025-26' })

test('collections ouvertes : seuls les Frenchies comptent, dual rattaché à la bonne équipe', () => {
  const players = playersFromCards([
    card('Alex Sarr', 'Washington Wizards', '✍️ Auto', 'a', 3),
    card('Alex Sarr/Bilal Coulibaly', 'Washington Wizards/Washington Wizards', '💎 Auto/Mem'),
    card('Victor Wembanyama/LeBron James', 'San Antonio Spurs/Los Angeles Lakers', '✨ Case Hit'),
    card('LeBron James', 'Los Angeles Lakers', '✍️ Auto'),
    card('Victor Wembanyama', 'San Antonio Spurs', '🧵 Memo', 'b', 2),
  ])
  const by = Object.fromEntries(players.map((p) => [p.name, p]))
  assert.deepEqual(Object.keys(by).sort(), ['Alex Sarr', 'Bilal Coulibaly', 'Victor Wembanyama'])
  assert.equal(by['Alex Sarr'].autos, 4)
  assert.equal(by['Victor Wembanyama'].caseHits, 1)
  assert.equal(by['Victor Wembanyama'].memo, 2)
  assert.equal(by['Victor Wembanyama'].collections.length, 2)

  const teams = sortFrench(teamsFromPlayers(players), 'autos')
  assert.equal(teams[0].name, 'Washington Wizards')
  assert.equal(teams[0].autos, 5)
  assert.deepEqual(teams[0].players.map((p) => p.name), ['Alex Sarr', 'Bilal Coulibaly'])
  assert.equal(teams.find((t) => t.name === 'Los Angeles Lakers'), undefined)
})

test('catalogue : filtre par saison et équipe de la collection', () => {
  const row = (checklist_id, season, team, auto) => ({ checklist_id, name: checklist_id, season, team, auto, auto_mem: 1, mem: 0, case_hit: 0, logoman: 1, cards: 10, premium: 0 })
  const players = playersFromCatalog([
    { name: 'Nicolas Batum', team: 'Portland Trail Blazers', collections: [row('a', '2025-26', 'LA Clippers', 2), row('b', '2012-13', 'Portland Trail Blazers', 5)] },
  ], '2025-26')
  assert.equal(players.length, 1)
  assert.equal(players[0].team, 'LA Clippers')
  assert.equal(players[0].autos, 3)
  assert.equal(players[0].caseHits, 1)
  assert.equal(teamsFromPlayers(players)[0].name, 'LA Clippers')
  assert.equal(playersFromCatalog([{ name: 'X', team: '', collections: [] }], null).length, 0)
})
