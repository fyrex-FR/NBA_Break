/**
 * Vue Mapping Odds — correction manuelle du rattachement Box Type ↔ set d'odds.
 *
 * Calquée sur DetectionView.tsx : une section par checklist sélectionnée,
 * les Box Types non résolus en tête (SearchSelect + option « ignorer »), les
 * Box Types déjà résolus juste en dessous (modifiables), et un compteur de
 * couverture avant / après les modifications en attente.
 */
import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { detectOddsMapping, saveOddsMapping } from '../../api/client'
import { ODDS_MAPPING_NONE, type OddsMappingChecklist } from '../../types'
import { SearchSelect } from '../shared/SearchSelect'

/** Couleur de la pastille de couverture : vert / ambre / rouge selon le taux. */
function coverageColor(mapped: number, total: number): string {
  if (total === 0) return 'var(--text-quaternary)'
  const rate = mapped / total
  if (rate >= 0.8) return '#34d399'
  if (rate >= 0.5) return '#eab308'
  return '#ef4444'
}

function CoverageBadge({
  before,
  after,
}: {
  before: { mapped: number; total: number }
  after: { mapped: number; total: number }
}) {
  const changed = before.mapped !== after.mapped
  return (
    <div className="flex items-center gap-2 text-xs font-medium whitespace-nowrap">
      <span
        className="inline-flex items-center rounded-full px-2.5 py-1"
        style={{
          background: `${coverageColor(before.mapped, before.total)}22`,
          color: coverageColor(before.mapped, before.total),
        }}
      >
        {before.mapped} / {before.total} rattachés
      </span>
      {changed && (
        <>
          <span style={{ color: 'var(--text-quaternary)' }}>→</span>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1"
            style={{
              background: `${coverageColor(after.mapped, after.total)}22`,
              color: coverageColor(after.mapped, after.total),
            }}
          >
            {after.mapped} / {after.total} en attente
          </span>
        </>
      )}
    </div>
  )
}

export function OddsMappingView() {
  const { selectedSport, selectedChecklistIds, availableChecklists } = useAppStore()

  const [checklists, setChecklists] = useState<OddsMappingChecklist[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // pending[checklist_id][box_type] = set root choisi (ou ODDS_MAPPING_NONE)
  const [pending, setPending] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<Record<string, string | null>>({})

  useEffect(() => {
    if (selectedChecklistIds.length === 0) {
      setChecklists([])
      return
    }
    setLoading(true)
    setError(null)
    detectOddsMapping(selectedSport, selectedChecklistIds)
      .then((data) => {
        setChecklists(data.checklists)
        setPending({})
        setMsg({})
      })
      .catch((err) => setError(err.message || 'Erreur lors du chargement du mapping.'))
      .finally(() => setLoading(false))
  }, [selectedSport, selectedChecklistIds])

  function checklistLabel(id: string): string {
    return availableChecklists.find((c) => c.checklist_id === id)?.checklist_name || id
  }

  function setPendingValue(checklistId: string, boxType: string, setRoot: string) {
    setPending((prev) => ({
      ...prev,
      [checklistId]: { ...(prev[checklistId] || {}), [boxType]: setRoot },
    }))
  }

  function clearPendingValue(checklistId: string, boxType: string) {
    setPending((prev) => {
      const scoped = { ...(prev[checklistId] || {}) }
      delete scoped[boxType]
      return { ...prev, [checklistId]: scoped }
    })
  }

  function effectiveValue(cl: OddsMappingChecklist, boxType: string): string {
    const pendingVal = pending[cl.checklist_id]?.[boxType]
    if (pendingVal !== undefined) return pendingVal
    return cl.resolved[boxType] ?? ''
  }

  async function handleSave(cl: OddsMappingChecklist) {
    const changes = pending[cl.checklist_id]
    if (!changes || Object.keys(changes).length === 0) return
    setSaving((prev) => ({ ...prev, [cl.checklist_id]: true }))
    setMsg((prev) => ({ ...prev, [cl.checklist_id]: null }))
    try {
      const result = await saveOddsMapping(selectedSport, cl.checklist_id, changes)
      // Réconcilie l'état local avec ce que le backend vient d'enregistrer :
      // les Box Types marqués __none__ disparaissent (résolus ET non-résolus),
      // les autres passent en résolus.
      setChecklists((prev) =>
        prev.map((c) => {
          if (c.checklist_id !== cl.checklist_id) return c
          const nextResolved = { ...c.resolved }
          let nextUnresolved = c.unresolved.filter((bt) => !(bt in changes))
          for (const [boxType, setRoot] of Object.entries(changes)) {
            if (setRoot === ODDS_MAPPING_NONE) {
              delete nextResolved[boxType]
            } else {
              nextResolved[boxType] = setRoot
              nextUnresolved = nextUnresolved.filter((bt) => bt !== boxType)
            }
          }
          return { ...c, resolved: nextResolved, unresolved: nextUnresolved }
        }),
      )
      setPending((prev) => ({ ...prev, [cl.checklist_id]: {} }))
      setMsg((prev) => ({
        ...prev,
        [cl.checklist_id]: `Enregistré : ${result.entries_count} rattachement(s) au total pour cette checklist.`,
      }))
      setTimeout(() => setMsg((prev) => ({ ...prev, [cl.checklist_id]: null })), 4000)
    } catch (err: any) {
      setMsg((prev) => ({ ...prev, [cl.checklist_id]: `Erreur : ${err.message}` }))
    } finally {
      setSaving((prev) => ({ ...prev, [cl.checklist_id]: false }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="text-3xl mb-3 animate-pulse">🔗</div>
          <p style={{ color: 'var(--text-tertiary)' }}>Chargement du mapping odds...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-medium mb-1">🔗 Mapping Odds</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Corrige le rattachement automatique entre les Box Types de la checklist et les sets de la feuille
        d'odds. Un Box Type peut être laissé de côté volontairement (« ignorer »).
      </p>

      {error && (
        <div className="rounded-lg px-4 py-2 mb-4 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {selectedChecklistIds.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          Sélectionnez au moins une checklist dans la barre latérale.
        </div>
      ) : (
        <div className="space-y-4">
          {checklists.map((cl) => (
            <ChecklistMappingCard
              key={cl.checklist_id}
              cl={cl}
              label={checklistLabel(cl.checklist_id)}
              pending={pending[cl.checklist_id] || {}}
              saving={saving[cl.checklist_id] || false}
              msg={msg[cl.checklist_id] || null}
              effectiveValue={(boxType) => effectiveValue(cl, boxType)}
              onSelect={(boxType, setRoot) => setPendingValue(cl.checklist_id, boxType, setRoot)}
              onIgnore={(boxType) => setPendingValue(cl.checklist_id, boxType, ODDS_MAPPING_NONE)}
              onReset={(boxType) => clearPendingValue(cl.checklist_id, boxType)}
              onSave={() => handleSave(cl)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ChecklistMappingCardProps {
  cl: OddsMappingChecklist
  label: string
  pending: Record<string, string>
  saving: boolean
  msg: string | null
  effectiveValue: (boxType: string) => string
  onSelect: (boxType: string, setRoot: string) => void
  onIgnore: (boxType: string) => void
  onReset: (boxType: string) => void
  onSave: () => void
}

function ChecklistMappingCard({
  cl,
  label,
  pending,
  saving,
  msg,
  effectiveValue,
  onSelect,
  onIgnore,
  onReset,
  onSave,
}: ChecklistMappingCardProps) {
  const boxTypesAll = useMemo(
    () => Array.from(new Set([...Object.keys(cl.resolved), ...cl.unresolved])).sort((a, b) => a.localeCompare(b)),
    [cl.resolved, cl.unresolved],
  )

  const unresolvedGroup = boxTypesAll.filter((bt) => effectiveValue(bt) === '')
  const resolvedGroup = boxTypesAll.filter((bt) => {
    const v = effectiveValue(bt)
    return v !== '' && v !== ODDS_MAPPING_NONE
  })
  const ignoredGroup = boxTypesAll.filter((bt) => effectiveValue(bt) === ODDS_MAPPING_NONE)

  const before = { mapped: Object.keys(cl.resolved).length, total: boxTypesAll.length }
  const after = { mapped: resolvedGroup.length, total: boxTypesAll.length }
  const hasPending = Object.keys(pending).length > 0

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div
        className="px-4 py-3 flex flex-wrap items-center justify-between gap-2"
        style={{ borderBottom: cl.has_odds ? '1px solid var(--border-subtle)' : 'none' }}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{label}</div>
          <div className="text-xs truncate" style={{ color: 'var(--text-quaternary)' }}>{cl.checklist_id}</div>
        </div>
        {cl.has_odds && <CoverageBadge before={before} after={after} />}
      </div>

      {!cl.has_odds ? (
        <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-quaternary)' }}>
          Pas de feuille d'odds pour ce produit.
        </div>
      ) : (
        <div className="px-4 py-4">
          {boxTypesAll.length === 0 ? (
            <p className="text-sm py-2" style={{ color: 'var(--text-quaternary)' }}>
              Aucun Box Type trouvé pour cette checklist.
            </p>
          ) : (
            <>
              {unresolvedGroup.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: '#eab308' }}>
                    À rattacher ({unresolvedGroup.length})
                  </p>
                  <div className="space-y-2">
                    {unresolvedGroup.map((bt) => (
                      <MappingRow
                        key={bt}
                        boxType={bt}
                        value={effectiveValue(bt)}
                        options={cl.available_sets}
                        isPending={bt in pending}
                        onSelect={(v) => onSelect(bt, v)}
                        onIgnore={() => onIgnore(bt)}
                        onReset={() => onReset(bt)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {ignoredGroup.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-quaternary)' }}>
                    Ignorés en attente ({ignoredGroup.length})
                  </p>
                  <div className="space-y-2">
                    {ignoredGroup.map((bt) => (
                      <div
                        key={bt}
                        className="flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm"
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}
                      >
                        <span className="flex-1 truncate" style={{ color: 'var(--text-tertiary)' }} title={bt}>
                          {bt}
                        </span>
                        <span className="text-xs italic" style={{ color: 'var(--text-quaternary)' }}>volontairement ignoré</span>
                        <button
                          onClick={() => onReset(bt)}
                          className="text-xs px-2 py-1 rounded-md"
                          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)' }}
                        >
                          ↺ Annuler
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {resolvedGroup.length > 0 && (
                <details className="mb-2">
                  <summary
                    className="text-xs font-medium uppercase tracking-wide mb-2 cursor-pointer select-none"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Déjà rattachés ({resolvedGroup.length}) — cliquer pour modifier
                  </summary>
                  <div className="space-y-2 mt-2">
                    {resolvedGroup.map((bt) => (
                      <MappingRow
                        key={bt}
                        boxType={bt}
                        value={effectiveValue(bt)}
                        options={cl.available_sets}
                        isPending={bt in pending}
                        onSelect={(v) => onSelect(bt, v)}
                        onIgnore={() => onIgnore(bt)}
                        onReset={() => onReset(bt)}
                      />
                    ))}
                  </div>
                </details>
              )}

              <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={onSave}
                  disabled={saving || !hasPending}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--accent)', color: '#fff', opacity: saving || !hasPending ? 0.5 : 1 }}
                >
                  {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer les corrections'}
                </button>
                {msg && (
                  <span className="text-sm" style={{ color: msg.startsWith('Erreur') ? '#ef4444' : '#34d399' }}>
                    {msg}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface MappingRowProps {
  boxType: string
  value: string
  options: string[]
  isPending: boolean
  onSelect: (v: string) => void
  onIgnore: () => void
  onReset: () => void
}

function MappingRow({ boxType, value, options, isPending, onSelect, onIgnore, onReset }: MappingRowProps) {
  return (
    <div className="p-2 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--text-secondary)' }} title={boxType}>
          {boxType}
        </span>
        <button
          onClick={onIgnore}
          className="text-xs px-2 py-1 rounded-md whitespace-nowrap flex-shrink-0"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-tertiary)' }}
        >
          Ignorer
        </button>
        {isPending && (
          <button
            onClick={onReset}
            className="text-xs px-2 py-1 rounded-md whitespace-nowrap flex-shrink-0"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-standard)', color: 'var(--text-secondary)' }}
            title="Annuler la modification en attente"
          >
            ↺
          </button>
        )}
      </div>
      {/* SearchSelect a une marge basse (mb-6) fixe dans son propre balisage ; on la
          neutralise par collapsing de marges via ce wrapper -mb-6, pour ne pas gonfler
          artificiellement la carte. */}
      <div className="-mb-6">
        <SearchSelect
          options={options}
          value={value}
          onChange={onSelect}
          placeholder="Choisir un set d'odds..."
        />
      </div>
    </div>
  )
}
