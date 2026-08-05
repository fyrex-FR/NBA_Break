/**
 * Vue Odds — consultation de la matrice d'odds Topps pour une checklist.
 *
 * Écran de lecture pur : une ligne par set d'odds, une colonne par groupe de
 * configuration (Hobby, Delight, Value, Mega, ...), une heatmap logarithmique
 * sur les odds, et un détail dépliable par set (parallèles + familles
 * exclusives). Dégrade proprement quand aucune feuille d'odds n'existe — ce
 * qui est la norme hors Topps.
 */
import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { fetchOddsIndex, fetchOddsSheet } from '../../api/client'
import { OddsBadge, OddsBadgeList, groupLabel } from '../shared/OddsBadge'
import type { OddsConfig, OddsRow, OddsSetSummary, OddsBadgeCode } from '../../types'

type AvailabilityFilter = 'all' | 'hobby_only' | 'retail_only' | 'selected_config'

const LEGEND_ITEMS: { code: OddsBadgeCode; description: string }[] = [
  { code: 'hobby_only', description: 'Uniquement en Hobby / Jumbo.' },
  { code: 'hobby_delight', description: 'Hobby et Delight, jamais en retail.' },
  { code: 'retail_only', description: 'Absent de Hobby et Jumbo — retail uniquement.' },
  { code: 'sapphire_only', description: 'Uniquement en configuration Sapphire.' },
  { code: 'delight_only', description: 'Uniquement en Delight.' },
  { code: 'fanatics_only', description: 'Uniquement via Fanatics.' },
  { code: 'promo_only', description: 'Uniquement en pack promo.' },
  { code: 'partout', description: 'Disponible dans (quasi) toutes les configurations.' },
  { code: 'sp', description: 'Short Print — meilleures odds 1:200 ou plus dur.' },
  { code: 'ssp', description: 'Super Short Print — meilleures odds 1:1000 ou plus dur.' },
  { code: 'case_hit', description: 'Case Hit — meilleures odds 1:20 000 ou plus dur.' },
]

// Échelle log fixe (1 à 3 000 000) pour que l'intensité de la heatmap soit
// comparable d'un set à l'autre, pas seulement relative à la feuille ouverte.
const HEAT_LOG_MIN = 0 // log10(1)
const HEAT_LOG_MAX = Math.log10(3_000_000)

function heatIntensity(n: number): number {
  const v = Math.log10(Math.max(1, n))
  const t = 1 - (v - HEAT_LOG_MIN) / (HEAT_LOG_MAX - HEAT_LOG_MIN)
  return Math.min(1, Math.max(0, t))
}

function heatBg(n: number): string {
  const pct = Math.round(6 + heatIntensity(n) * 46)
  return `color-mix(in srgb, var(--accent) ${pct}%, var(--bg-panel))`
}

function formatOdds(n: number): string {
  return `1:${n.toLocaleString('fr-FR')}`
}

/** Ordre canonique des groupes, préservant l'ordre d'apparition dans `configs`. */
function orderedGroups(configs: OddsConfig[]): { group: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const c of configs) {
    if (!seen.has(c.group)) seen.set(c.group, groupLabel(c.group))
  }
  return Array.from(seen.entries()).map(([group, label]) => ({ group, label }))
}

/** Meilleures odds (1:N le plus bas) d'une ligne de parallèle pour un groupe donné. */
function bestOddsForGroup(row: OddsRow, group: string, configGroupOf: Map<string, string>): number | undefined {
  let best: number | undefined
  for (const [configKey, val] of Object.entries(row.odds)) {
    if (val == null) continue
    if (configGroupOf.get(configKey) !== group) continue
    if (best === undefined || val < best) best = val
  }
  return best
}

function formatExclusiveFamily(family: string, groups: string[]): string {
  const labels = groups.map(groupLabel)
  const suffix = labels.length === 1 ? ' uniquement' : ''
  return `${family} → ${labels.join(' & ')}${suffix}`
}

export function OddsView() {
  const selectedSport = useAppStore((s) => s.selectedSport)
  const selectedChecklistIds = useAppStore((s) => s.selectedChecklistIds)
  const selectedConfigKey = useAppStore((s) => s.selectedConfigKey)
  const availableChecklists = useAppStore((s) => s.availableChecklists)

  const [manualChecklistId, setManualChecklistId] = useState('')
  const [expandedSet, setExpandedSet] = useState<string | null>(null)
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all')

  const { data: oddsIndex } = useQuery({
    queryKey: ['odds-index', selectedSport],
    queryFn: () => fetchOddsIndex(selectedSport),
    enabled: !!selectedSport,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const checklistsWithOdds = useMemo(() => {
    const ids = new Set(oddsIndex?.checklist_ids ?? [])
    return selectedChecklistIds.filter((id) => ids.has(id))
  }, [oddsIndex, selectedChecklistIds])

  const checklistId = manualChecklistId && checklistsWithOdds.includes(manualChecklistId)
    ? manualChecklistId
    : (checklistsWithOdds.length === 1 ? checklistsWithOdds[0] : '')

  const { data: sheetData, isLoading: sheetLoading, isError: sheetError } = useQuery({
    queryKey: ['odds-sheet', selectedSport, checklistId],
    queryFn: () => fetchOddsSheet(selectedSport, checklistId),
    enabled: !!checklistId,
    retry: false,
  })

  function checklistLabel(id: string): string {
    const cl = availableChecklists.find((c) => c.checklist_id === id)
    const raw = cl?.display_name || cl?.checklist_name || id
    return raw.replace('.parquet', '')
  }

  const groups = useMemo(() => orderedGroups(sheetData?.configs ?? []), [sheetData])
  const configGroupOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of sheetData?.configs ?? []) map.set(c.key, c.group)
    return map
  }, [sheetData])
  const selectedConfig = sheetData?.configs.find((c) => c.key === selectedConfigKey)
  const highlightGroup = selectedConfig?.group

  const allSets = useMemo(
    () => Object.values(sheetData?.set_summaries ?? {}).sort((a, b) => a.set.localeCompare(b.set)),
    [sheetData],
  )

  const filteredSets = useMemo(() => {
    if (availabilityFilter === 'hobby_only') return allSets.filter((s) => s.availability_badge === 'hobby_only')
    if (availabilityFilter === 'retail_only') return allSets.filter((s) => s.availability_badge === 'retail_only')
    if (availabilityFilter === 'selected_config') {
      if (!highlightGroup) return []
      return allSets.filter((s) => s.groups_present.includes(highlightGroup))
    }
    return allSets
  }, [allSets, availabilityFilter, highlightGroup])

  // ── Aucune checklist sélectionnée n'a de feuille d'odds : état vide explicite ──
  if (checklistsWithOdds.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-medium mb-4">🎯 Odds</h2>
        <div className="text-center py-16 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-solid)' }}>
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Aucune feuille d'odds pour les checklists sélectionnées.
          </p>
          <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-quaternary)' }}>
            C'est normal : les feuilles d'odds ne sont publiées que pour certains produits Topps. Panini et la
            plupart des autres marques n'en publient pas — l'app fonctionne normalement sans elles.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-medium mb-1">🎯 Odds</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Matrice odds × configuration, par set. Cliquez une ligne pour voir ses parallèles.
      </p>

      {/* Sélection de la checklist à inspecter */}
      {checklistsWithOdds.length > 1 && (
        <select
          value={checklistId}
          onChange={(e) => setManualChecklistId(e.target.value)}
          className="w-full max-w-lg rounded-lg px-3 py-2 text-sm mb-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-primary)' }}
        >
          <option value="">Sélectionnez une checklist...</option>
          {checklistsWithOdds.map((id) => (
            <option key={id} value={id}>{checklistLabel(id)}</option>
          ))}
        </select>
      )}

      {!checklistId && (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          Sélectionnez une checklist ci-dessus pour consulter sa feuille d'odds.
        </div>
      )}

      {checklistId && sheetLoading && (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Chargement de la feuille d'odds...</div>
      )}

      {checklistId && sheetError && (
        <div className="text-center py-12" style={{ color: '#ef4444' }}>Impossible de charger la feuille d'odds de cette checklist.</div>
      )}

      {checklistId && sheetData && (
        <>
          {/* En-tête produit */}
          <div className="rounded-xl p-4 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {sheetData.sheet.product_label || checklistLabel(checklistId)}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{allSets.length} sets</span>
            {sheetData.sheet.source && <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Source : {sheetData.sheet.source}</span>}
            {sheetData.sheet.updated_at && <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>Maj {sheetData.sheet.updated_at}</span>}
            {selectedConfig && (
              <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}>
                Config active : {selectedConfig.label}
              </span>
            )}
          </div>

          {/* Filtre disponibilité */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {([
              { key: 'all', label: 'Tous' },
              { key: 'hobby_only', label: 'Hobby only' },
              { key: 'retail_only', label: 'Retail only' },
              { key: 'selected_config', label: selectedConfig ? `Dispo en ${selectedConfig.label}` : 'Dispo dans la config sélectionnée' },
            ] as { key: AvailabilityFilter; label: string }[]).map((f) => (
              <button
                key={f.key}
                onClick={() => setAvailabilityFilter(f.key)}
                disabled={f.key === 'selected_config' && !selectedConfig}
                className="text-xs px-2.5 py-1.5 rounded-full transition-colors"
                style={{
                  background: availabilityFilter === f.key ? 'var(--accent)' : 'var(--bg-surface)',
                  color: availabilityFilter === f.key ? '#fff' : (f.key === 'selected_config' && !selectedConfig) ? 'var(--text-quaternary)' : 'var(--text-secondary)',
                  border: `1px solid ${availabilityFilter === f.key ? 'var(--accent)' : 'var(--border-standard)'}`,
                  opacity: f.key === 'selected_config' && !selectedConfig ? 0.5 : 1,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Table principale */}
          {filteredSets.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Aucun set ne correspond à ce filtre.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg mb-6" style={{ border: '1px solid var(--border-subtle)' }}>
              <table className="text-sm" style={{ minWidth: '100%', width: 'max-content' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface)' }}>
                    <th
                      className="px-4 py-3 text-left font-medium sticky left-0 z-10"
                      style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
                    >
                      Set
                    </th>
                    {groups.map((g) => (
                      <th
                        key={g.group}
                        className="px-3 py-3 text-center font-medium whitespace-nowrap"
                        style={{
                          color: g.group === highlightGroup ? 'var(--accent)' : 'var(--text-tertiary)',
                          borderBottom: `1px solid ${g.group === highlightGroup ? 'var(--accent)' : 'var(--border-subtle)'}`,
                          background: g.group === highlightGroup ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-surface))' : undefined,
                        }}
                      >
                        {g.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                      Badges
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSets.map((set: OddsSetSummary, i) => {
                    const isOpen = expandedSet === set.set
                    const rowBg = i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-surface)'
                    return (
                      <Fragment key={set.set}>
                        <tr
                          onClick={() => setExpandedSet(isOpen ? null : set.set)}
                          className="cursor-pointer"
                          style={{ background: rowBg }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
                        >
                          <td
                            className="px-4 py-2.5 sticky left-0 z-10 font-medium"
                            style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', background: 'inherit' }}
                          >
                            <span className="flex items-center gap-1.5">
                              {isOpen ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />}
                              {set.set}
                            </span>
                          </td>
                          {groups.map((g) => {
                            const best = set.best_by_group[g.group]
                            return (
                              <td
                                key={g.group}
                                className="px-3 py-2.5 text-center whitespace-nowrap"
                                style={{
                                  color: best ? 'var(--text-primary)' : 'var(--text-quaternary)',
                                  borderBottom: '1px solid var(--border-subtle)',
                                  background: best ? heatBg(best.odds) : undefined,
                                  fontWeight: best ? 600 : 400,
                                }}
                                title={best ? `${set.set} · ${g.label} · meilleures odds` : `${set.set} indisponible en ${g.label}`}
                              >
                                {best ? formatOdds(best.odds) : '–'}
                              </td>
                            )
                          })}
                          <td className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <OddsBadgeList codes={set.badges} bestByGroup={set.best_by_group} />
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${set.set}-detail`} style={{ background: rowBg }}>
                            <td colSpan={groups.length + 2} className="px-4 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <SetDetailPanel set={set} groups={groups} configGroupOf={configGroupOf} highlightGroup={highlightGroup} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Légende */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-tertiary)' }}>Légende des badges</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {LEGEND_ITEMS.map((item) => (
                <div key={item.code} className="flex items-center gap-2">
                  <OddsBadge code={item.code} />
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.description}</span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <OddsBadge code="best:mega" best={{ odds: 109, config_key: 'mega_box_ea', group: 'mega' }} />
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Meilleur endroit pour sortir ce set (survolez pour les odds).</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface SetDetailPanelProps {
  set: OddsSetSummary
  groups: { group: string; label: string }[]
  configGroupOf: Map<string, string>
  highlightGroup?: string
}

function SetDetailPanel({ set, groups, configGroupOf, highlightGroup }: SetDetailPanelProps) {
  return (
    <div className="space-y-3">
      {set.exclusive_parallel_families.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {set.exclusive_parallel_families.map((f) => (
            <span
              key={f.family}
              className="text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)' }}
            >
              {formatExclusiveFamily(f.family, f.groups)}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
        <table className="text-xs" style={{ minWidth: '100%', width: 'max-content' }}>
          <thead>
            <tr style={{ background: 'var(--bg-panel)' }}>
              <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>Parallèle</th>
              {groups.map((g) => (
                <th
                  key={g.group}
                  className="px-3 py-2 text-center font-medium whitespace-nowrap"
                  style={{ color: g.group === highlightGroup ? 'var(--accent)' : 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}
                >
                  {g.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {set.rows.map((row, i) => (
              <tr key={`${row.label}-${i}`} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-panel)' }}>
                <td className="px-3 py-2" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>
                  {row.parallel || row.label}
                </td>
                {groups.map((g) => {
                  const best = bestOddsForGroup(row, g.group, configGroupOf)
                  return (
                    <td
                      key={g.group}
                      className="px-3 py-2 text-center whitespace-nowrap"
                      style={{
                        color: best ? 'var(--text-primary)' : 'var(--text-quaternary)',
                        borderBottom: '1px solid var(--border-subtle)',
                        background: best ? heatBg(best) : undefined,
                        fontWeight: best ? 600 : 400,
                      }}
                    >
                      {best ? formatOdds(best) : '–'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
