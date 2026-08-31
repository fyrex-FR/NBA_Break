import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Box, Check, Loader2, Search, Sparkles, Users } from 'lucide-react'
import { fetchPollOptions, fetchPollResults, submitPollVote } from '../../api/client'
import type { PollOption, PollPreference, PollResultsResponse } from '../../types'

const PREFERENCE_LABELS: Record<PollPreference, string> = {
  value: 'Value avant tout',
  guarantee: 'Box avec hit garanti',
  either: 'Peu importe, les deux me vont',
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
  const [checklistIds, setChecklistIds] = useState<string[]>([])
  const [preference, setPreference] = useState<PollPreference>('either')
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
    if (years.includes(year)) {
      setYears(years.filter((item) => item !== year))
      const idsForYear = new Set(options.filter((option) => option.year === year).map((option) => option.checklist_id))
      setChecklistIds(checklistIds.filter((id) => !idsForYear.has(id)))
    } else {
      setYears([...years, year])
    }
  }

  function toggleChecklist(id: string) {
    setChecklistIds(checklistIds.includes(id) ? checklistIds.filter((item) => item !== id) : [...checklistIds, id])
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (pseudo.trim().length < 2 || years.length === 0 || checklistIds.length === 0) {
      setMessage({ ok: false, text: 'Renseigne ton pseudo et choisis au moins une année et une box.' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      await submitPollVote({ pseudo: pseudo.trim(), years, checklist_ids: checklistIds, preference })
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
    <div data-sport="nba" data-theme="dark" className="min-h-dvh" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
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
                <button key={year} type="button" onClick={() => toggleYear(year)} className="px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors" style={years.includes(year) ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'white' } : { background: 'var(--bg-secondary)', borderColor: 'var(--border-standard)' }}>
                  {year}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold mb-3">2. Quelles séries / box ?</legend>
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
                    const selected = checklistIds.includes(option.checklist_id)
                    return (
                      <label key={option.checklist_id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)]" style={{ borderColor: 'var(--border-subtle)' }}>
                        <input type="checkbox" checked={selected} onChange={() => toggleChecklist(option.checklist_id)} className="sr-only" />
                        <span className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0" style={selected ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border-standard)' }}>{selected && <Check className="w-3.5 h-3.5 text-white" />}</span>
                        <span className="min-w-0"><span className="block text-sm font-medium">{optionLabel(option)}</span><span className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>{option.year}</span></span>
                      </label>
                    )
                  })}
                  {visibleOptions.length === 0 && <p className="p-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>Aucune box trouvée.</p>}
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>{checklistIds.length} box sélectionnée{checklistIds.length > 1 ? 's' : ''}</p>
              </>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold mb-3">3. Pour ce break, tu privilégies quoi ?</legend>
            <div className="grid md:grid-cols-3 gap-2">
              {(Object.keys(PREFERENCE_LABELS) as PollPreference[]).map((value) => (
                <label key={value} className="rounded-xl border p-3 cursor-pointer text-sm font-medium" style={preference === value ? { borderColor: 'var(--accent)', background: 'var(--accent-subtle)' } : { borderColor: 'var(--border-standard)', background: 'var(--bg-secondary)' }}>
                  <input type="radio" name="preference" value={value} checked={preference === value} onChange={() => setPreference(value)} className="mr-2" />{PREFERENCE_LABELS[value]}
                </label>
              ))}
            </div>
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
          <ResultSection title="Box les plus demandées" rows={ranking(results?.checklists ?? {}).slice(0, 12)} label={(key) => optionById.has(key) ? `${optionById.get(key)!.year} · ${optionLabel(optionById.get(key)!)}` : key} />
          <ResultSection title="Orientation" rows={ranking(results?.preferences ?? {})} label={(key) => PREFERENCE_LABELS[key as PollPreference] ?? key} />

          <section className="mt-7">
            <h3 className="text-sm font-bold mb-3">Votes détaillés</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {(results?.votes ?? []).map((vote) => (
                <article key={`${vote.pseudo}-${vote.updated_at}`} className="rounded-xl p-3 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-sm">{vote.pseudo}</strong>
                    <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>{PREFERENCE_LABELS[vote.preference]}</span>
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>{vote.years.join(', ')}</p>
                  <ul className="text-xs mt-2 space-y-1">
                    {vote.checklist_ids.map((id) => {
                      const option = optionById.get(id)
                      return <li key={id}>• {option ? optionLabel(option) : id}</li>
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
