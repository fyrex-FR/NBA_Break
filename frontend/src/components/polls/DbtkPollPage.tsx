import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Box, Check, Loader2, Search, Sparkles, Users } from 'lucide-react'
import { fetchPollOptions, fetchPollResults, submitPollVote } from '../../api/client'
import type { PollOption, PollPreference, PollResultsResponse } from '../../types'

const PREFERENCE_LABELS: Record<PollPreference, string> = {
  value: 'Value',
  guarantee: 'Garantie',
  mix: 'Mixer',
}

function optionLabel(option: PollOption) {
  if (option.display_name?.trim()) return option.display_name.replace(/^\d{4}-\d{2}\s+/, '')
  return option.checklist_name
    .replace(/^\d{4}-\d{2}-/, '')
    .replace(/-(basketball-)?checklist$/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function ranking(entries: Record<string, number>) {
  return Object.entries(entries).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export function DbtkPollPage() {
  const [options, setOptions] = useState<PollOption[]>([])
  const [results, setResults] = useState<PollResultsResponse | null>(null)
  const [pseudo, setPseudo] = useState('')
  const [years, setYears] = useState<string[]>([])
  const [choices, setChoices] = useState<Record<string, PollPreference>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function refreshResults() {
    setResults(await fetchPollResults())
  }

  useEffect(() => {
    Promise.all([fetchPollOptions(), fetchPollResults()])
      .then(([optionData, resultData]) => {
        setOptions(optionData.options)
        setResults(resultData)
      })
      .catch(() => setMessage({ ok: false, text: 'Le sondage est momentanément indisponible.' }))
      .finally(() => setLoading(false))
  }, [])

  const availableYears = useMemo(
    () => Array.from(new Set(options.map((option) => option.year))).sort().reverse(),
    [options],
  )

  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return options.filter((option) => {
      if (!years.includes(option.year)) return false
      if (!normalizedQuery) return true
      return `${optionLabel(option)} ${option.checklist_name}`.toLowerCase().includes(normalizedQuery)
    })
  }, [options, query, years])

  function toggleYear(year: string) {
    const removing = years.includes(year)
    setYears((currentYears) => removing
      ? currentYears.filter((item) => item !== year)
      : [...currentYears, year],
    )
    if (removing) {
      const idsForYear = new Set(options.filter((option) => option.year === year).map((option) => option.checklist_id))
      setChoices((currentChoices) => Object.fromEntries(
        Object.entries(currentChoices).filter(([id]) => !idsForYear.has(id)),
      ))
    }
  }

  function toggleChecklist(id: string) {
    setChoices((currentChoices) => {
      const next = { ...currentChoices }
      if (next[id]) delete next[id]
      else next[id] = 'guarantee'
      return next
    })
  }

  function toggleChecklistPreference(id: string, preference: PollPreference) {
    setChoices((currentChoices) => {
      return { ...currentChoices, [id]: preference }
    })
  }

  function removeChecklist(id: string) {
    setChoices((currentChoices) => {
      const next = { ...currentChoices }
      delete next[id]
      return next
    })
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (pseudo.trim().length < 2 || years.length === 0 || Object.keys(choices).length === 0) {
      setMessage({ ok: false, text: 'Renseigne ton pseudo et choisis au moins une année et une box.' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      await submitPollVote({
        pseudo: pseudo.trim(),
        years,
        choices: Object.entries(choices).map(([checklist_id, preference]) => ({ checklist_id, preference })),
      })
      await refreshResults()
      setMessage({ ok: true, text: 'Ton vote est enregistré. Tu peux le modifier en revotant avec le même pseudo.' })
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Impossible d’enregistrer le vote.' })
    } finally {
      setSubmitting(false)
    }
  }

  const optionById = useMemo(() => new Map(options.map((option) => [option.checklist_id, option])), [options])

  return (
    <div data-sport="nba" data-theme="dark" className="dbtk-poll min-h-dvh" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <header className="border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-panel)' }}>
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <Box className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] font-semibold" style={{ color: 'var(--accent)' }}>DBTK · Pick Your Player</p>
            <h1 className="text-xl md:text-2xl font-extrabold">Choisis les prochaines box du break</h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 md:py-10 grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)] gap-6">
        <form onSubmit={handleSubmit} className="glass-panel rounded-2xl p-5 md:p-7 space-y-7">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} /> Ton vote</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Plusieurs années et plusieurs séries sont possibles.</p>
          </div>

          <label className="block">
            <span className="block text-sm font-semibold mb-2">Ton pseudo</span>
            <input value={pseudo} onChange={(event) => setPseudo(event.target.value)} maxLength={40} placeholder="Pseudo Voggt / Discord…" className="w-full rounded-xl px-4 py-3 border outline-none focus:ring-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-standard)' }} />
          </label>

          <fieldset>
            <legend className="text-sm font-semibold mb-3">1. Quelles années ?</legend>
            <div className="flex flex-wrap gap-2">
              {availableYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  aria-pressed={years.includes(year)}
                  onClick={(event) => {
                    toggleYear(year)
                    event.currentTarget.blur()
                  }}
                  className="px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors outline-none"
                  style={years.includes(year) ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'white' } : { background: 'var(--bg-secondary)', borderColor: 'var(--border-standard)', color: 'var(--text-secondary)' }}
                >
                  <span className="inline-flex items-center gap-1.5">{years.includes(year) && <Check className="w-3.5 h-3.5" />}{year}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold mb-1">2. Quelles séries / box ?</legend>
            <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>Chaque box est cochée en Garantie par défaut. Modifie son profil si besoin.</p>
            {years.length === 0 ? (
              <p className="rounded-xl p-4 text-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>Choisis d’abord une ou plusieurs années.</p>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-3 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher Prizm, Select, Flawless…" className="w-full rounded-xl pl-10 pr-4 py-2.5 border outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-standard)' }} />
                </div>
                <div className="max-h-80 overflow-y-auto rounded-xl border divide-y" style={{ borderColor: 'var(--border-standard)' }}>
                  {visibleOptions.map((option) => {
                    const selectedPreference = choices[option.checklist_id]
                    const selected = !!selectedPreference
                    return (
                      <div key={option.checklist_id} className="px-4 py-3 hover:bg-[var(--bg-hover)]" style={{ borderColor: 'var(--border-subtle)' }}>
                        <button type="button" onClick={(event) => { toggleChecklist(option.checklist_id); event.currentTarget.blur() }} className="w-full flex items-center gap-3 text-left outline-none">
                          <span
                            className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0"
                            style={selected
                              ? { background: '#16a34a', borderColor: '#22c55e' }
                              : { background: 'var(--bg-secondary)', borderColor: 'var(--border-standard)' }}
                          >
                            {selected && <Check className="w-3.5 h-3.5 text-white" />}
                          </span>
                          <span className="min-w-0"><span className="block text-sm font-medium">{optionLabel(option)}</span><span className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>{option.year}</span></span>
                        </button>
                        {selected && (
                          <div className="mt-3 ml-8 space-y-2">
                            <div className="grid grid-cols-3 gap-1.5">
                            {(Object.keys(PREFERENCE_LABELS) as PollPreference[]).map((value) => {
                              const active = selectedPreference === value
                              const activeStyle = value === 'value'
                                ? { background: '#2563eb', borderColor: '#3b82f6', color: 'white' }
                                : value === 'guarantee'
                                  ? { background: '#16a34a', borderColor: '#22c55e', color: 'white' }
                                  : { background: '#7c3aed', borderColor: '#8b5cf6', color: 'white' }
                              return (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={active}
                                onClick={(event) => { toggleChecklistPreference(option.checklist_id, value); event.currentTarget.blur() }}
                                className="rounded-lg border px-2 py-2 text-xs font-semibold outline-none"
                                style={active ? activeStyle : { background: 'transparent', borderColor: 'var(--border-standard)', color: 'var(--text-secondary)' }}
                              >
                                {PREFERENCE_LABELS[value]}
                              </button>
                              )
                            })}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeChecklist(option.checklist_id)}
                              className="w-full rounded-lg border px-2 py-2 text-xs font-semibold outline-none"
                              style={{ background: 'transparent', borderColor: 'var(--border-standard)', color: 'var(--text-tertiary)' }}
                            >
                              Retirer cette box
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {visibleOptions.length === 0 && <p className="p-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>Aucune box trouvée.</p>}
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>{Object.keys(choices).length} box sélectionnée{Object.keys(choices).length > 1 ? 's' : ''}</p>
              </>
            )}
          </fieldset>

          {message && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: message.ok ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)', color: message.ok ? '#4ade80' : '#f87171' }}>{message.text}</div>}

          <button disabled={submitting || loading} className="w-full rounded-xl py-3.5 font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: 'var(--accent)' }}>
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Enregistrer mon vote
          </button>
          <p className="text-xs flex items-start gap-2" style={{ color: 'var(--text-tertiary)' }}><Users className="w-4 h-4 shrink-0" /> Les votes sont transparents : ton pseudo et tes choix apparaîtront dans les résultats publics. Revoter avec le même pseudo remplace ton ancien vote.</p>
        </form>

        <aside className="glass-panel rounded-2xl p-5 md:p-6 h-fit lg:sticky lg:top-6">
          <h2 className="text-lg font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5" style={{ color: 'var(--accent)' }} /> Résultats en direct</h2>
          <p className="text-3xl font-black mt-4">{results?.voters ?? 0}</p>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>votant{results?.voters === 1 ? '' : 's'}</p>

          <ResultSection title="Années" rows={ranking(results?.years ?? {}).slice(0, 8)} label={(key) => key} />
          <ChecklistResults results={results} optionById={optionById} />

          <section className="mt-7">
            <h3 className="text-sm font-bold mb-3">Votes détaillés</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {(results?.votes ?? []).map((vote) => (
                <article key={`${vote.pseudo}-${vote.updated_at}`} className="rounded-xl p-3 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-sm">{vote.pseudo}</strong>
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>{vote.years.join(', ')}</p>
                  <ul className="text-xs mt-2 space-y-1">
                    {vote.choices.map((choice) => {
                      const option = optionById.get(choice.checklist_id)
                      return <li key={choice.checklist_id} className="flex items-start justify-between gap-2"><span>• {option ? optionLabel(option) : choice.checklist_id}</span><strong style={{ color: 'var(--accent)' }}>{PREFERENCE_LABELS[choice.preference]}</strong></li>
                    })}
                  </ul>
                </article>
              ))}
              {(results?.votes ?? []).length === 0 && <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Pas encore de vote.</p>}
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}

function ChecklistResults({ results, optionById }: { results: PollResultsResponse | null; optionById: Map<string, PollOption> }) {
  const rows = ranking(results?.checklists ?? {}).slice(0, 12)
  return (
    <section className="mt-7">
      <h3 className="text-sm font-bold mb-3">Box les plus demandées</h3>
      {rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Pas encore de vote.</p> : (
        <div className="space-y-4">
          {rows.map(([id, total]) => {
            const option = optionById.get(id)
            const counts = results?.checklist_preferences[id] ?? { value: 0, guarantee: 0, mix: 0 }
            return (
              <div key={id}>
                <div className="flex justify-between gap-3 text-xs mb-1.5"><span>{option ? `${option.year} · ${optionLabel(option)}` : id}</span><strong>{total}</strong></div>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  {(Object.keys(PREFERENCE_LABELS) as PollPreference[]).map((preference) => (
                    <span key={preference} className="rounded-md px-1.5 py-1 text-center" style={{ background: counts[preference] ? 'var(--accent-subtle)' : 'var(--bg-hover)', color: counts[preference] ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                      {PREFERENCE_LABELS[preference]} {counts[preference]}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ResultSection({ title, rows, label }: { title: string; rows: [string, number][]; label: (key: string) => string }) {
  const max = Math.max(1, ...rows.map(([, count]) => count))
  return (
    <section className="mt-7">
      <h3 className="text-sm font-bold mb-3">{title}</h3>
      {rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Pas encore de vote.</p> : (
        <div className="space-y-3">
          {rows.map(([key, count]) => (
            <div key={key}>
              <div className="flex justify-between gap-3 text-xs mb-1"><span className="truncate">{label(key)}</span><strong>{count}</strong></div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}><div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: 'var(--accent)' }} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
