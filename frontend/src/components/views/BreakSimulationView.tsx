import { useState, useMemo, useRef, useEffect } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import ExcelJS from 'exceljs'
import { useAppStore } from '../../stores/appStore'
import { DataTable } from '../shared/DataTable'
import { MetricCard } from '../shared/MetricCard'
import { LetterAssignmentUI } from './LetterAssignmentUI'
import { Save, Trash2, Download, Plus, ChevronDown, Loader2, Play, Target, Shield, UserPlus, User, CaseSensitive, CaseUpper, Grid2x2, Grid2x2Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMediaQuery, MOBILE_QUERY } from '../../hooks/useMediaQuery'
import { CategoryBadge } from '../shared/CategoryBadge'
import { prettyChecklist, errorMessage } from '../../utils/checklists'
import { CATEGORY_META } from '../../constants/categories'

const CATEGORY_RANK = new Map(CATEGORY_META.map((m, i) => [m.category, i]))
const categoryRank = (cat?: string) => CATEGORY_RANK.get(cat ?? '') ?? CATEGORY_META.length
import { X, Check } from 'lucide-react'
import { fetchBreakPlayers, fetchBreakSimulation, fetchSimulationPresets, saveSimulationPreset, deleteSimulationPreset } from '../../api/client'
import type { BreakSpotRecord, BreakSimulationResponse, SimulationPreset, BreakCardDetail, BreakPlayerStats } from '../../types'

const columnHelper = createColumnHelper<BreakSpotRecord>()

interface OddsColumnFlags {
  partAttendue: boolean
  breakScoreOdds: boolean
  hitsPerBox: boolean
}

function buildSpotColumns(method: string, oddsCols: OddsColumnFlags) {
  const isPlayerMethod = method === 'player' || method.endsWith('letter_assignment')

  const rcCell = (val: number) =>
    val > 0 ? <span className="font-medium" style={{ color: 'var(--success)' }}>{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>

  return [
    columnHelper.accessor('Spot', {
      header: 'Spot',
      cell: (info) => (
        <span className="font-medium" style={{ color: 'var(--accent)' }}>
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('Cartes', { header: 'Cartes' }),
    columnHelper.accessor('Cartes RC', {
      header: 'RC',
      cell: (info) => rcCell((info.getValue() as number) ?? 0),
    }),
    columnHelper.accessor('Auto', { header: 'Auto' }),
    columnHelper.accessor('Memo', { header: 'Memo' }),
    columnHelper.accessor('Auto/Memo', { header: 'A+M' }),
    columnHelper.accessor('Total Hits', { header: 'Hits' }),
    columnHelper.accessor('Auto/Memo RC', {
      header: 'Auto RC',
      cell: (info) => rcCell((info.getValue() as number) ?? 0),
    }),
    columnHelper.accessor('Logoman', {
      header: '🔥',
      cell: (info) => {
        const val = info.getValue() as number
        return val > 0 ? <span className="font-medium" style={{ color: 'var(--cat-logoman)' }}>{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Logoman RC', {
      header: '🔥RC',
      cell: (info) => rcCell((info.getValue() as number) ?? 0),
    }),
    columnHelper.accessor('Case Hit', {
      header: '✨',
      cell: (info) => {
        const val = info.getValue() as number
        return val > 0 ? <span className="font-medium" style={{ color: 'var(--cat-case)' }}>{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Case Hit RC', {
      header: '✨RC',
      cell: (info) => rcCell((info.getValue() as number) ?? 0),
    }),
    columnHelper.accessor('Auto garanties', {
      header: 'Garanties',
      cell: (info) => {
        const val = info.getValue() as number
        return val > 0
          ? <span className="font-medium" style={{ color: 'var(--accent)' }}>{val}</span>
          : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    ...(!isPlayerMethod ? [
      columnHelper.accessor('Nb Joueurs', { header: 'Joueurs #' }),
    ] : []),
    columnHelper.accessor('Immaculate Only', {
      header: 'Immacu. Only',
      cell: (info) => {
        const v = info.getValue() as number
        return v > 0
          ? <span style={{ color: 'var(--cat-automem)', fontWeight: 600 }}>{v}</span>
          : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
      },
    }),
    columnHelper.accessor('Break Score', { header: 'Score' }),
    columnHelper.accessor('Part du break', { header: 'Part %', cell: (info) => `${info.getValue()}%` }),
    // Colonnes odds — injectées uniquement quand le champ correspondant est présent
    // dans les données renvoyées par l'API (une configuration est sélectionnée et
    // une feuille d'odds existe pour la sélection). Aucun changement sinon.
    ...(oddsCols.partAttendue ? [
      columnHelper.accessor('Part attendue', {
        header: 'Part attendue',
        cell: (info) => {
          const v = info.getValue()
          return v === undefined || v === null
            ? <span style={{ color: 'var(--text-quaternary)' }}>—</span>
            : <span style={{ color: 'var(--accent)' }}>{Number(v).toFixed(2)}%</span>
        },
      }),
    ] : []),
    ...(oddsCols.breakScoreOdds ? [
      columnHelper.accessor('Break Score (odds)', {
        header: 'Score (odds)',
        cell: (info) => {
          const v = info.getValue()
          return v === undefined || v === null
            ? <span style={{ color: 'var(--text-quaternary)' }}>—</span>
            : <span className="font-medium" style={{ color: 'var(--cat-automem)' }}>{Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 3 })}</span>
        },
      }),
    ] : []),
    ...(oddsCols.hitsPerBox ? [
      columnHelper.accessor('Hits / box', {
        header: 'Hits/box',
        cell: (info) => {
          const v = info.getValue()
          return v === undefined || v === null
            ? <span style={{ color: 'var(--text-quaternary)' }}>—</span>
            : <span>{Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 3 })}</span>
        },
      }),
    ] : []),
    columnHelper.accessor('Hot Spot', { header: 'Hot', cell: (info) => info.getValue() || '—' }),
    ...(!isPlayerMethod ? [
      columnHelper.accessor('Joueurs', {
        header: 'Joueurs',
        cell: (info) => {
          const val = info.getValue()
          return val ? <span className="text-[10px] leading-tight opacity-70 block max-w-[240px] truncate">{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
        },
      }),
    ] : [
      columnHelper.accessor('Équipes', {
        header: 'Équipes',
        cell: (info) => {
          const val = info.getValue()
          return val ? <span className="text-[10px] leading-tight opacity-70 block max-w-[240px] truncate">{val}</span> : <span style={{ color: 'var(--text-quaternary)' }}>—</span>
        },
      }),
    ]),
  ]
}

const METHODS: { value: string; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'team', label: 'Par équipe', hint: 'Un spot par équipe', icon: Shield },
  { value: 'team_player', label: 'Équipe + joueurs', hint: 'Certains joueurs sortis en spot à part', icon: UserPlus },
  { value: 'player', label: 'Par joueur', hint: 'Un spot par joueur', icon: User },
  { value: 'letter', label: 'Par lettre', hint: 'Initiale du joueur', icon: CaseSensitive },
  { value: 'surname_letter', label: 'Lettre du nom', hint: 'Initiale du nom de famille', icon: CaseUpper },
  { value: 'letter_assignment', label: 'Lettres assignées', hint: 'Tu répartis les lettres par spot', icon: Grid2x2 },
  { value: 'surname_letter_assignment', label: 'Lettres du nom assignées', hint: 'Idem, sur le nom de famille', icon: Grid2x2Check },
]

export function BreakSimulationView() {
  const { selectedSport, selectedChecklistIds, masterKey, availableChecklists, selectedConfigKeys, setActiveView } = useAppStore()
  const [method, setMethod] = useState('team')
  const [result, setResult] = useState<BreakSimulationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hitsGuaranteed, setHitsGuaranteed] = useState<Record<string, string>>({})
  const [extractedPlayers, setExtractedPlayers] = useState<string[]>([])
  const [availablePlayers, setAvailablePlayers] = useState<string[]>([])
  const [playerStats, setPlayerStats] = useState<Record<string, BreakPlayerStats>>({})
  const [playersLoading, setPlayersLoading] = useState(false)
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerSort, setPlayerSort] = useState<keyof BreakPlayerStats | 'player'>('total_hits')
  const [playerSortDirection, setPlayerSortDirection] = useState<'asc' | 'desc'>('desc')
  // Letter Assignment mode state
  const [letterCustomMap, setLetterCustomMap] = useState<Record<string, string>>({})
  const [letterExtracted, setLetterExtracted] = useState<string[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null)
  // Trie sur le Break Score pondéré par les odds plutôt que sur le Break Score historique.
  const [sortByOdds, setSortByOdds] = useState(false)

  // Presets state
  const [presets, setPresets] = useState<SimulationPreset[]>([])
  const [newPresetName, setNewPresetName] = useState('')
  const [presetsLoading, setPresetsLoading] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)

  const resultsRef = useRef<HTMLDivElement>(null)
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const currentMethod = METHODS.find((m) => m.value === method) ?? METHODS[0]
  const isAssignment = method.endsWith('letter_assignment')
  // Derniers paramètres envoyés à /simulate/break (hors config odds), pour pouvoir
  // relancer la simulation quand la configuration odds change sans rejouer tout
  // le formulaire (méthode lettre-assignation incluse).
  const lastRunParamsRef = useRef<Omit<Parameters<typeof fetchBreakSimulation>[0], 'config_key' | 'config_keys'> | null>(null)

  // Load presets on mount or sport change
  useEffect(() => {
    if (!selectedSport) return
    setPresetsLoading(true)
    fetchSimulationPresets(selectedSport)
      .then(data => setPresets(data.presets))
      .catch(err => console.error('Failed to fetch sim presets:', err))
      .finally(() => setPresetsLoading(false))
  }, [selectedSport])

  useEffect(() => {
    if (method !== 'team_player' || !selectedSport || selectedChecklistIds.length === 0) {
      setAvailablePlayers([])
      setPlayerStats({})
      return
    }
    setPlayersLoading(true)
    fetchBreakPlayers({
      sport_key: selectedSport,
      checklist_ids: selectedChecklistIds,
      master_key: masterKey,
      method: 'letter',
    })
      .then(data => {
        setAvailablePlayers(data.players)
        setPlayerStats(data.stats)
      })
      .catch(err => {
        console.error('Failed to fetch break players:', err)
        setAvailablePlayers([])
        setPlayerStats({})
      })
      .finally(() => setPlayersLoading(false))
  }, [method, selectedSport, selectedChecklistIds, masterKey])

  const checklistsInfo = useMemo(() =>
    selectedChecklistIds.map(id => availableChecklists.find(c => c.checklist_id === id)).filter(Boolean),
    [selectedChecklistIds, availableChecklists]
  )

  const hasAnyGuaranteed = Object.values(hitsGuaranteed).some(v => parseInt(v) > 0)
  const filteredPlayers = useMemo(() => {
    const query = playerSearch.trim().toLocaleLowerCase('fr')
    const filtered = query
      ? availablePlayers.filter(player => {
          const teams = playerStats[player]?.teams.join(' ') ?? ''
          return `${player} ${teams}`.toLocaleLowerCase('fr').includes(query)
        })
      : availablePlayers
    return [...filtered].sort((left, right) => {
      const leftValue = playerSort === 'player' ? left : (playerStats[left]?.[playerSort] ?? 0)
      const rightValue = playerSort === 'player' ? right : (playerStats[right]?.[playerSort] ?? 0)
      const comparison = typeof leftValue === 'string' || Array.isArray(leftValue)
        ? String(leftValue).localeCompare(String(rightValue), 'fr')
        : Number(leftValue) - Number(rightValue)
      return playerSortDirection === 'asc' ? comparison : -comparison
    })
  }, [availablePlayers, playerSearch, playerSort, playerSortDirection, playerStats])

  function togglePlayerSort(column: keyof BreakPlayerStats | 'player') {
    if (playerSort === column) {
      setPlayerSortDirection(current => current === 'asc' ? 'desc' : 'asc')
    } else {
      setPlayerSort(column)
      setPlayerSortDirection(column === 'player' ? 'asc' : 'desc')
    }
  }

  async function runSimulate(overrides?: {
    method?: string
    custom_map?: Record<string, string>
    custom_spots?: string[]
    extracted?: string[]
  }) {
    setLoading(true)
    setError(null)
    const guaranteedMap: Record<string, number> = {}
    for (const id of selectedChecklistIds) {
      const raw = hitsGuaranteed[id]
      const n = (raw !== undefined && raw !== '') ? parseInt(raw) : 0
      guaranteedMap[id] = isNaN(n) ? 0 : Math.max(0, n)
    }
    const effectiveMethod = overrides?.method ?? method
    const isAssignmentMethod = effectiveMethod.endsWith('letter_assignment')
    // Assignment modes send their explicit reviewed player mapping as custom.
    const apiMethod = isAssignmentMethod ? 'custom' : effectiveMethod
    const params = {
      sport_key: selectedSport,
      checklist_ids: selectedChecklistIds,
      master_key: masterKey,
      method: apiMethod,
      custom_scope: isAssignmentMethod ? 'players' : undefined,
      custom_map: overrides?.custom_map,
      custom_spots: overrides?.custom_spots,
      checklist_hits_guaranteed: hasAnyGuaranteed ? guaranteedMap : undefined,
      extracted_players: overrides?.extracted ?? extractedPlayers,
    }
    lastRunParamsRef.current = params
    try {
      const data = await fetchBreakSimulation({ ...params, config_keys: selectedConfigKeys })
      setResult(data)
      setPanelOpen(false)
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (err: unknown) {
      setError(errorMessage(err, 'Erreur lors de la simulation.'))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  // Relance automatiquement la dernière simulation quand les configurations odds
  // change (sélecteur global "je break du..."), pour que les colonnes Part
  // attendue / Break Score (odds) reflètent toujours la config ouverte. Ne fait
  // rien tant qu'aucune simulation n'a été lancée.
  useEffect(() => {
    if (!lastRunParamsRef.current) return
    setLoading(true)
    setError(null)
    fetchBreakSimulation({ ...lastRunParamsRef.current, config_keys: selectedConfigKeys })
      .then((data) => setResult(data))
      .catch((err: unknown) => { setError(errorMessage(err, 'Erreur lors de la simulation.')); setResult(null) })
      .finally(() => setLoading(false))
  }, [selectedConfigKeys])

  async function handleSimulate() {
    await runSimulate()
  }

  function handleLetterAssignmentSubmit(params: {
    custom_map: Record<string, string>
    extracted_players: string[]
    custom_spots: string[]
  }) {
    setLetterCustomMap(params.custom_map)
    setLetterExtracted(params.extracted_players)
    runSimulate({
      method,
      custom_map: params.custom_map,
      custom_spots: params.custom_spots,
      extracted: params.extracted_players,
    })
  }

  async function handleSavePreset() {
    if (!newPresetName.trim() || !selectedSport) return
    const guaranteedMap: Record<string, number> = {}
    for (const id of selectedChecklistIds) {
      const raw = hitsGuaranteed[id]
      const n = (raw !== undefined && raw !== '') ? parseInt(raw) : 0
      guaranteedMap[id] = isNaN(n) ? 0 : Math.max(0, n)
    }

    const preset: SimulationPreset = {
      name: newPresetName,
      checklist_ids: selectedChecklistIds,
      method,
      extracted_players: method.endsWith('letter_assignment') ? letterExtracted : extractedPlayers,
      hits_guaranteed: guaranteedMap,
      custom_map: method.endsWith('letter_assignment') ? letterCustomMap : undefined,
    }

    try {
      await saveSimulationPreset(selectedSport, preset)
      const data = await fetchSimulationPresets(selectedSport)
      setPresets(data.presets)
      setNewPresetName('')
    } catch (err: unknown) {
      alert(errorMessage(err))
    }
  }

  async function handleDeletePreset(name: string) {
    if (!selectedSport || !confirm(`Supprimer la configuration "${name}" ?`)) return
    try {
      await deleteSimulationPreset(selectedSport, name)
      setPresets(prev => prev.filter(p => p.name !== name))
    } catch (err: unknown) {
      alert(errorMessage(err))
    }
  }

  function handleLoadPreset(p: SimulationPreset) {
    setMethod(p.method)
    if (p.method.endsWith('letter_assignment')) {
      setLetterCustomMap(p.custom_map ?? {})
      setLetterExtracted(p.extracted_players)
    } else {
      setExtractedPlayers(p.extracted_players)
    }
    const hg: Record<string, string> = {}
    Object.entries(p.hits_guaranteed).forEach(([id, val]) => {
      hg[id] = String(val)
    })
    setHitsGuaranteed(hg)
    useAppStore.getState().setSelectedChecklistIds(p.checklist_ids)
    setPresetsOpen(false)
  }

  function exportCardDetails(cards: BreakCardDetail[], breakMethod: string) {
    const headers = ['Spot', 'Player', 'Team', 'Box Type', 'Numbering', 'Category', 'Hit Type', 'Checklist']
    const rows = cards.map(c => [
      c.Spot, c.Player, c.Team, c['Box Type'], c.Numbering, c.Category, c['Hit Type'], c.Checklist
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `break_${breakMethod}_cartes.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportBySpot(spots: BreakSpotRecord[], cards: BreakCardDetail[], breakMethod: string) {
    const isAuto = (c: BreakCardDetail) =>
      ['auto', 'mem', 'auto_mem'].includes(c['Hit Type'] || '')

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Break par Spot')
    ws.columns = [
      { key: 'joueur', width: 38 },
      { key: 'cartes', width: 10 },
      { key: 'auto', width: 12 },
    ]

    // Global column header
    const headerRow = ws.addRow(['Joueur', 'Cartes', 'Auto/Memo'])
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }
      cell.alignment = { horizontal: 'center' }
    })

    for (const spot of spots) {
      const spotCards = cards.filter(c => c.Spot === spot.Spot && !c.is_multi_ref)

      // Spot header row
      const spotRow = ws.addRow([`Spot ${spot.Spot}`, spot.Cartes, spot['Auto/Memo']])
      spotRow.height = 18
      spotRow.eachCell(cell => {
        cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
        cell.alignment = { horizontal: cell.address.startsWith('A') ? 'left' : 'center' }
      })

      if (spotCards.length === 0) {
        const emptyRow = ws.addRow(['(aucune carte)', 0, 0])
        emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' } }
      } else {
        // Aggregate per player
        const playerMap: Record<string, { cards: number; auto: number }> = {}
        for (const c of spotCards) {
          const key = c.Player || '—'
          if (!playerMap[key]) playerMap[key] = { cards: 0, auto: 0 }
          playerMap[key].cards += 1
          if (isAuto(c)) playerMap[key].auto += 1
        }
        let rowIdx = 0
        for (const [player, data] of Object.entries(playerMap)) {
          const r = ws.addRow([player, data.cards, data.auto])
          r.getCell(1).alignment = { horizontal: 'left' }
          r.getCell(2).alignment = { horizontal: 'center' }
          r.getCell(3).alignment = { horizontal: 'center' }
          // Alternating row background
          if (rowIdx % 2 === 1) {
            r.eachCell(cell => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
            })
          }
          rowIdx++
        }
        // TOTAL row
        const totalRow = ws.addRow(['TOTAL', spotCards.length, spotCards.filter(isAuto).length])
        totalRow.eachCell(cell => {
          cell.font = { bold: true }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
          cell.alignment = { horizontal: cell.address.startsWith('A') ? 'left' : 'center' }
        })
      }

      // Empty separator
      ws.addRow([])
    }

    // Borders on all non-empty rows
    ws.eachRow(row => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        }
      })
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `break_${breakMethod}_par_spot.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>

      {/* Méthode + lancement */}
      <section className="ui-card p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Méthode de break</div>
          {!isAssignment && (
            <button
              onClick={handleSimulate}
              disabled={loading || selectedChecklistIds.length === 0}
              className="ui-btn ui-btn-primary hidden sm:inline-flex"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              {loading ? 'Simulation…' : 'Simuler'}
            </button>
          )}
        </div>
        <div className="flex sm:grid sm:grid-cols-4 xl:grid-cols-7 gap-2 overflow-x-auto no-scrollbar snap-x -mx-4 px-4 sm:mx-0 sm:px-0 pb-0.5" role="radiogroup" aria-label="Méthode de break">
          {METHODS.map((m) => {
            const Icon = m.icon
            const on = method === m.value
            return (
              <button
                key={m.value}
                role="radio"
                aria-checked={on}
                onClick={() => { setMethod(m.value); setResult(null) }}
                className="flex-shrink-0 w-[132px] sm:w-auto snap-start text-left rounded-xl px-3 py-2.5 transition-colors"
                style={{
                  background: on ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  boxShadow: on ? '0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent)' : '0 0 0 1px var(--border-subtle)',
                }}
              >
                <Icon className="w-4 h-4 mb-1.5" style={{ color: on ? 'var(--accent)' : 'var(--text-tertiary)' }} />
                <div className="text-[12.5px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{m.label}</div>
                <div className="hidden sm:block text-[11px] leading-snug mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{m.hint}</div>
              </button>
            )
          })}
        </div>
        <p className="sm:hidden text-xs mt-2.5" style={{ color: 'var(--text-tertiary)' }}>{currentMethod.hint}</p>
      </section>

      <div className="grid gap-3 lg:grid-cols-2 items-start mb-6 [&>div]:!mb-0">
      {/* Presets Management */}
      <div className="mb-3 ui-card overflow-hidden">
        <button
          onClick={() => setPresetsOpen(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 text-left ui-row-hover"
        >
          <div className="flex items-center gap-2">
            <Save size={14} style={{ color: 'var(--text-tertiary)' }} />
            <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
              Configurations enregistrées <span className="num" style={{ color: 'var(--text-quaternary)' }}>{presets.length || ''}</span>
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${presetsOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-quaternary)' }} />
        </button>

        {presetsOpen && (
          <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {/* List of presets */}
            <div className="space-y-1 mb-4">
              {presets.length === 0 && !presetsLoading && (
                <p className="text-xs italic px-2 py-1" style={{ color: 'var(--text-quaternary)' }}>Aucune configuration sauvegardée.</p>
              )}
              {presetsLoading && <p className="text-xs px-2 py-1">Chargement...</p>}
              {presets.map(p => (
                <div key={p.name} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-quaternary)' }}>
                      {p.checklist_ids.length} checklists · {METHODS.find((m) => m.value === p.method)?.label ?? p.method}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleLoadPreset(p)}
                      title="Charger"
                      className="ui-btn ui-btn-secondary ui-btn-sm"
                    >
                      Charger
                    </button>
                    <button
                      onClick={() => handleDeletePreset(p.name)}
                      title="Supprimer"
                      className="ui-btn ui-btn-ghost ui-btn-danger ui-btn-sm ui-btn-icon"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Save current config */}
            <div className="flex gap-2 items-center pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <input
                type="text"
                placeholder="Nom de la configuration..."
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="ui-input flex-1"
              />
              <button
                onClick={handleSavePreset}
                disabled={!newPresetName.trim() || selectedChecklistIds.length === 0}
                className="ui-btn ui-btn-primary"
                style={{ height: 34 }}
              >
                <Plus size={14} />
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hits garantis par checklist */}
      {checklistsInfo.length > 0 && (
        <div className="mb-4 ui-card overflow-hidden">
          <button
            onClick={() => setPanelOpen(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 text-left ui-row-hover"
          >
            <span className="flex flex-col">
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Hits garantis par box</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Pondère le score de chaque checklist selon ses autos/memo garantis</span>
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${panelOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-quaternary)' }} />
          </button>
          {panelOpen && <div className="px-4 pb-4 pt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="space-y-2">
              {checklistsInfo.map((cl) => (
                <div key={cl!.checklist_id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                    {prettyChecklist(cl!.checklist_name)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{cl!.year}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      placeholder="0"
                      value={hitsGuaranteed[cl!.checklist_id] ?? ''}
                      onChange={(e) => setHitsGuaranteed(prev => ({ ...prev, [cl!.checklist_id]: e.target.value }))}
                      inputMode="numeric"
                      className="ui-input !w-16 text-center"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>hits/box</span>
                  </div>
                </div>
              ))}
            </div>
            {!hasAnyGuaranteed && (
              <p className="text-xs mt-3" style={{ color: 'var(--text-quaternary)' }}>
                Sans saisie, toutes les checklists ont un poids égal (×1).
              </p>
            )}
          </div>}
        </div>
      )}

      </div>

      {method === 'team_player' && (
        <div className="mb-6 ui-card p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              Joueurs à sortir de leur équipe
            </p>
            <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>
              {extractedPlayers.length} sélectionné{extractedPlayers.length > 1 ? 's' : ''}
            </span>
          </div>
          {extractedPlayers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {extractedPlayers.map((p) => (
                <button key={p} onClick={() => setExtractedPlayers((cur) => cur.filter((x) => x !== p))} className="ui-chip is-active !h-7">
                  {p} <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 mb-3">
            <input
              type="search"
              value={playerSearch}
              onChange={(event) => setPlayerSearch(event.target.value)}
              placeholder="Rechercher un joueur ou une équipe…"
              className="ui-input flex-1"
            />
            {isMobile && (
              <select
                value={playerSort}
                onChange={(e) => togglePlayerSort(e.target.value as keyof BreakPlayerStats | 'player')}
                className="ui-select !h-[34px]"
                aria-label="Trier les joueurs"
              >
                <option value="total_hits">Hits</option>
                <option value="cards">Cartes</option>
                <option value="auto">Autos</option>
                <option value="case_hits">Case</option>
                <option value="player">Nom</option>
              </select>
            )}
          </div>
          {playersLoading ? (
            <p className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Chargement des joueurs...</p>
          ) : isMobile ? (
            <ul className="max-h-[60dvh] overflow-y-auto -mx-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {filteredPlayers.map((player) => {
                const checked = extractedPlayers.includes(player)
                const stats = playerStats[player]
                const toggle = () => setExtractedPlayers((cur) => checked ? cur.filter((x) => x !== player) : [...cur, player])
                return (
                  <li key={player} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <button onClick={toggle} aria-pressed={checked} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[var(--bg-hover)]" style={{ background: checked ? 'var(--accent-soft)' : undefined }}>
                      <span
                        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: checked ? 'var(--accent)' : 'transparent', border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`, color: 'var(--accent-fg)' }}
                      >
                        {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{player}</span>
                        <span className="block text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{stats?.teams.join(', ') || '—'}</span>
                      </span>
                      <span className="text-right text-xs num flex-shrink-0">
                        <span className="block font-semibold" style={{ color: 'var(--accent)' }}>{stats?.total_hits ?? 0} hits</span>
                        <span className="block" style={{ color: 'var(--text-quaternary)' }}>{stats?.cards ?? 0} cartes</span>
                      </span>
                    </button>
                  </li>
                )
              })}
              {filteredPlayers.length === 0 && (
                <li className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-quaternary)' }}>Aucun joueur trouvé.</li>
              )}
            </ul>
          ) : (
            <div className="max-h-[28rem] overflow-auto rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
              <table className="w-full min-w-[860px] text-xs">
                <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-surface)' }}>
                  <tr>
                    <th className="px-3 py-2 text-center">Sortir</th>
                    {([
                      ['player', 'Joueur'],
                      ['teams', 'Équipe(s)'],
                      ['cards', 'Cartes'],
                      ['auto', 'Autos'],
                      ['memo', 'Mémos'],
                      ['auto_memo', 'A+M'],
                      ['total_hits', 'Hits'],
                      ['case_hits', 'Case'],
                      ['logoman', 'Logo'],
                    ] as Array<[keyof BreakPlayerStats | 'player', string]>).map(([key, label]) => (
                      <th key={key} className={`px-3 py-2 ${key === 'player' || key === 'teams' ? 'text-left' : 'text-right'}`}>
                        <button type="button" onClick={() => togglePlayerSort(key)} className="font-medium whitespace-nowrap">
                          {label}{playerSort === key ? (playerSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map(player => {
                    const checked = extractedPlayers.includes(player)
                    const stats = playerStats[player]
                    return (
                      <tr key={player} className="cursor-pointer" style={{ borderTop: '1px solid var(--border-subtle)', background: checked ? 'var(--accent-soft)' : 'var(--bg-primary)' }} onClick={() => setExtractedPlayers(current => checked ? current.filter(item => item !== player) : [...current, player])}>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => setExtractedPlayers(current => checked ? current.filter(item => item !== player) : [...current, player])}
                            aria-label={`Sortir ${player}`}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{player}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate" title={stats?.teams.join(', ')}>{stats?.teams.join(', ') || '—'}</td>
                        <td className="px-3 py-2 text-right">{stats?.cards ?? 0}</td>
                        <td className="px-3 py-2 text-right">{stats?.auto ?? 0}</td>
                        <td className="px-3 py-2 text-right">{stats?.memo ?? 0}</td>
                        <td className="px-3 py-2 text-right">{stats?.auto_memo ?? 0}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--accent)' }}>{stats?.total_hits ?? 0}</td>
                        <td className="px-3 py-2 text-right">{stats?.case_hits ?? 0}</td>
                        <td className="px-3 py-2 text-right">{stats?.logoman ?? 0}</td>
                      </tr>
                    )
                  })}
                  {filteredPlayers.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-6 text-center" style={{ color: 'var(--text-quaternary)' }}>Aucun joueur trouvé.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Letter Assignment UI */}
      {method.endsWith('letter_assignment') && (
        <div className="mb-6 ui-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-tertiary)' }}>
            {method === 'surname_letter_assignment' ? 'Assignation par lettre du nom' : 'Assignation des joueurs par lettre'}
          </p>
          <LetterAssignmentUI
            onSubmit={handleLetterAssignmentSubmit}
            initialCustomMap={Object.keys(letterCustomMap).length > 0 ? letterCustomMap : undefined}
            initialExtractedPlayers={letterExtracted.length > 0 ? letterExtracted : undefined}
            submitLabel={loading ? '⏳ Simulation...' : '🎲 Simuler'}
            disabled={loading || selectedChecklistIds.length === 0}
            groupingMethod={method === 'surname_letter_assignment' ? 'surname_letter' : 'letter'}
          />
        </div>
      )}

      {error && (
        <div className="rounded-lg px-4 py-2 mb-4 text-sm" style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {result && (() => {
        const oddsCols: OddsColumnFlags = {
          partAttendue: result.spots.some((s) => s['Part attendue'] !== undefined),
          breakScoreOdds: result.spots.some((s) => s['Break Score (odds)'] !== undefined),
          hitsPerBox: result.spots.some((s) => s['Hits / box'] !== undefined),
        }
        const hasOdds = oddsCols.partAttendue || oddsCols.breakScoreOdds
        const coverage = result.summary.odds_coverage
        const sortKey = sortByOdds && oddsCols.breakScoreOdds ? 'Break Score (odds)' : 'Break Score'

        return (
        <div ref={resultsRef}>
          {/* Bandeau de couverture odds — uniquement si une pondération a été calculée. */}
          {hasOdds && coverage !== undefined && (
            coverage < 0.8 ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 mb-4 text-sm"
                style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)', color: 'var(--text-primary)' }}
              >
                <span>
                  ⚠️ Couverture odds partielle : <strong style={{ color: 'var(--cat-case)' }}>{(coverage * 100).toFixed(0)}%</strong> de
                  la masse de probabilité est rattachée à des cartes de la checklist. Complète le mapping pour
                  fiabiliser le classement pondéré.
                </span>
                <button
                  onClick={() => setActiveView('🔗 Mapping Odds')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                  style={{ background: 'var(--cat-case)', color: '#111' }}
                >
                  Corriger le mapping
                </button>
              </div>
            ) : (
              <p className="text-xs mb-4" style={{ color: 'var(--text-quaternary)' }}>
                ✓ Couverture odds : {(coverage * 100).toFixed(0)}%
              </p>
            )
          )}

          {/* Summary KPIs */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
            <MetricCard label="Spots" value={result.spots.length} />
            <MetricCard label="Cartes" value={result.summary.total_cartes} />
            <MetricCard label="Score total" value={result.summary.total_break_score} />
            <MetricCard label="Hot spots" value={result.summary.hot_spots} valueColor="var(--cat-logoman)" />
          </div>

          {/* Export + tri odds */}
          <div className="flex flex-wrap items-center sm:justify-end gap-2 mb-3">
            {oddsCols.breakScoreOdds && (
              <button
                onClick={() => setSortByOdds((v) => !v)}
                className={`ui-chip ${sortByOdds ? 'is-active' : ''}`}
                title="Bascule le tri du tableau entre le Break Score historique et le Break Score pondéré par les odds"
              >
                <Target className="w-3.5 h-3.5" /> Trier par score odds
              </button>
            )}
            {result.card_details && result.card_details.length > 0 && (
              <>
                <button
                  onClick={() => void exportBySpot(result.spots, result.card_details, method)}
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                >
                  <Download size={13} />
                  Excel par spot
                </button>
                <button
                  onClick={() => exportCardDetails(result.card_details, method)}
                  className="ui-btn ui-btn-ghost ui-btn-sm"
                >
                  <Download size={13} />
                  CSV des cartes
                </button>
              </>
            )}
          </div>

          {/* Full table */}
          <DataTable
            data={result.spots}
            columns={buildSpotColumns(method, oddsCols)}
            onRowClick={(row) => setSelectedSpot(row.Spot)}
            pageSize={100}
            searchable
            searchPlaceholder="Rechercher un spot..."
            exportName={`break_${method}`}
            initialSorting={[{ id: sortKey, desc: true }]}
            mobileColumns={['Break Score', 'Total Hits', 'Case Hit', 'Part du break']}
          />

          {/* Panel détail d'un spot */}
          {selectedSpot && (() => {
            // Les hits d'abord (Logoman → base), pour lire la valeur du spot d'un coup d'œil.
            const spotCards = result.card_details
              .filter(c => c.Spot === selectedSpot)
              .sort((a, b) => categoryRank(a.Category) - categoryRank(b.Category) || (a.Player || '').localeCompare(b.Player || ''))
            const spotRow = result.spots.find(s => s.Spot === selectedSpot)
            return (
              <div
                className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-4"
                style={{ background: 'var(--bg-overlay)' }}
                onClick={() => setSelectedSpot(null)}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Spot ${selectedSpot}`}
                  className="w-full max-w-2xl rounded-t-3xl md:rounded-2xl overflow-hidden flex flex-col"
                  style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-pop)', maxHeight: '88dvh', animation: 'popIn 0.18s ease-out', paddingBottom: 'env(safe-area-inset-bottom)' }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="md:hidden flex justify-center pt-2"><span className="w-10 h-1 rounded-full" style={{ background: 'var(--border-strong)' }} /></div>
                  <div className="flex items-start justify-between gap-3 px-5 pt-3 md:pt-4 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="min-w-0">
                      <h3 className="text-[17px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {selectedSpot} {spotRow?.['Hot Spot'] ? <span className="text-sm">🔥</span> : null}
                      </h3>
                      {spotRow && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs num" style={{ color: 'var(--text-tertiary)' }}>
                          <span><b style={{ color: 'var(--text-primary)' }}>{spotRow.Cartes}</b> cartes</span>
                          <span><b style={{ color: 'var(--text-primary)' }}>{spotRow['Auto/Memo']}</b> A+M</span>
                          <span>Score <b style={{ color: 'var(--accent)' }}>{spotRow['Break Score']}</b></span>
                          <span><b style={{ color: 'var(--text-primary)' }}>{spotRow['Part du break']}%</b> du break</span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setSelectedSpot(null)} className="ui-btn ui-btn-ghost ui-btn-icon -mr-2" aria-label="Fermer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="overflow-y-auto flex-1">
                    {spotCards.length === 0 ? (
                      <p className="text-sm px-5 py-8 text-center" style={{ color: 'var(--text-quaternary)' }}>
                        Aucune carte pour ce spot.
                      </p>
                    ) : isMobile ? (
                      <ul>
                        {spotCards.map((c, i) => (
                          <li key={i} className="px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: c.is_multi_ref ? 0.75 : 1 }}>
                            <div className="flex items-center gap-2">
                              <span className="flex-1 min-w-0 text-[14px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.Player || '—'}</span>
                              {c.Category && <CategoryBadge category={c.Category} />}
                            </div>
                            <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                              {c['Box Type'] || '—'}{c.Numbering ? ` · ${c.Numbering}` : ''}{c.is_multi_ref ? ' · multi' : ''}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            {['Joueur', 'Équipe', 'Type', 'Numérotation', 'Catégorie', 'Checklist'].map(h => (
                              <th key={h} className="px-3 first:pl-5 py-2 text-left font-medium" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {spotCards.map((c, i) => (
                            <tr key={i} className="ui-row-hover" style={{ opacity: c.is_multi_ref ? 0.75 : 1 }}>
                              <td className="px-3 pl-5 py-2" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>
                                <span>{c.Player || '—'}</span>
                                {c.is_multi_ref && <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>multi</span>}
                              </td>
                              <td className="px-3 py-2" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>{c.Team || '—'}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>{c['Box Type'] || '—'}</td>
                              <td className="px-3 py-2 num" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>{c.Numbering || '—'}</td>
                              <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>{c.Category ? <CategoryBadge category={c.Category} /> : '—'}</td>
                              <td className="px-3 py-2 max-w-[160px] truncate" style={{ color: 'var(--text-quaternary)', borderBottom: '1px solid var(--border-subtle)' }}>{c.Checklist || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
        )
      })()}

      {!isAssignment && (
        <div className="sm:hidden sticky z-20 mt-4 -mx-1" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleSimulate}
            disabled={loading || selectedChecklistIds.length === 0}
            className="ui-btn ui-btn-primary ui-btn-lg w-full !h-12 !rounded-2xl"
            style={{ boxShadow: 'var(--shadow-pop)' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {loading ? 'Simulation…' : result ? `Relancer · ${currentMethod.label}` : `Simuler · ${currentMethod.label}`}
          </button>
        </div>
      )}
    </div>
  )
}
