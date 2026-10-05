import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, User, Shield, Layers, Sun, Moon, Play, CornerDownLeft, Radio, Bookmark, MessageCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { NAV_ITEMS, isItemEnabled, sectionLabel } from '../../navigation'
import { useRunAnalysis } from '../../hooks/useRunAnalysis'
import { formatCount } from '../../utils/checklists'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: LucideIcon
  keywords?: string
  run: () => void
}

const MAX_ENTITIES = 6

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function CommandPalette() {
  const {
    paletteOpen, setPaletteOpen, analysisData, selectedSport, breakContext,
    setActiveView, setTargetPlayer, setTargetTeam, openSelection, toggleTheme, theme, selectedChecklistIds, setChatOpen,
  } = useAppStore()
  const runAnalysis = useRunAnalysis()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Raccourcis globaux : ⌘K / Ctrl+K, et "/" hors champ de saisie.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(!useAppStore.getState().paletteOpen)
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen])

  useEffect(() => {
    if (paletteOpen) {
      setQuery('')
      setIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [paletteOpen])

  // Index joueurs / équipes de l'analyse, triés par volume.
  const entities = useMemo(() => {
    if (!analysisData) return { players: [] as [string, number][], teams: [] as [string, number][] }
    const players = new Map<string, number>()
    const teams = new Map<string, number>()
    for (const c of analysisData.cards) {
      for (const p of c.Player.split('/')) { const k = p.trim(); if (k) players.set(k, (players.get(k) ?? 0) + c.Hits) }
      for (const t of c.Team.split('/')) { const k = t.trim(); if (k) teams.set(k, (teams.get(k) ?? 0) + c.Hits) }
    }
    const sort = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1])
    return { players: sort(players), teams: sort(teams) }
  }, [analysisData])

  const close = () => setPaletteOpen(false)

  const commands = useMemo<Command[]>(() => {
    const q = normalize(query.trim())
    const match = (c: Pick<Command, 'label' | 'keywords' | 'hint'>) =>
      !q || q.split(/\s+/).every((t) => normalize(`${c.label} ${c.keywords ?? ''} ${c.hint ?? ''}`).includes(t))

    const out: Command[] = []

    const actions: Command[] = [
      { id: 'a:select', group: 'Actions', label: 'Choisir des checklists', icon: Layers, keywords: 'selection catalogue', run: () => { close(); openSelection('catalog') } },
      { id: 'a:presets', group: 'Actions', label: 'Ouvrir un preset', icon: Bookmark, keywords: 'preset sauvegarde', run: () => { close(); openSelection('presets') } },
      { id: 'a:voggt', group: 'Actions', label: 'Charger un break Voggt', icon: Radio, keywords: 'voggt show live', run: () => { close(); openSelection('voggt') } },
      ...(selectedChecklistIds.length > 0 ? [{
        id: 'a:run', group: 'Actions', label: analysisData ? "Relancer l'analyse" : "Lancer l'analyse", icon: Play, keywords: 'analyser lancer',
        run: () => { close(); runAnalysis({ goTo: analysisData ? null : '🌍 Vue Globale' }) },
      }] : []),
      { id: 'a:chat', group: 'Actions', label: "Demander à l'assistant", icon: MessageCircle, keywords: 'chat ia question assistant', run: () => { close(); setChatOpen(true) } },
      { id: 'a:theme', group: 'Actions', label: theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre', icon: theme === 'dark' ? Sun : Moon, keywords: 'theme dark light', run: () => { toggleTheme(); close() } },
    ]

    const views: Command[] = NAV_ITEMS
      .filter((i) => isItemEnabled(i, analysisData?.enabled_views, selectedSport))
      .filter((i) => i.view !== '🎲 État du Break' || !!breakContext)
      .filter((i) => !i.needsAnalysis || !!analysisData)
      .map((i) => ({
        id: `v:${i.slug}`, group: 'Aller à', label: i.label, hint: sectionLabel(i.section), icon: i.icon, keywords: i.description,
        run: () => { setActiveView(i.view); close() },
      }))

    if (q && analysisData) {
      const players = entities.players.filter(([name]) => normalize(name).includes(q)).slice(0, MAX_ENTITIES)
      out.push(...players.map(([name, hits]) => ({
        id: `p:${name}`, group: 'Joueurs', label: name, hint: `${formatCount(hits)} cartes`, icon: User,
        run: () => { setTargetPlayer(name); setActiveView('🔍 Analyse Joueur'); close() },
      })))
      const teams = entities.teams.filter(([name]) => normalize(name).includes(q)).slice(0, MAX_ENTITIES)
      out.push(...teams.map(([name, hits]) => ({
        id: `t:${name}`, group: 'Équipes', label: name, hint: `${formatCount(hits)} cartes`, icon: Shield,
        run: () => { setTargetTeam(name); setActiveView('🛡️ Analyse Équipe'); close() },
      })))
    }

    out.push(...views.filter(match), ...actions.filter(match))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, analysisData, entities, selectedSport, breakContext, theme, selectedChecklistIds.length])

  useEffect(() => { setIndex(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!paletteOpen) return null

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, commands.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); commands[index]?.run() }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-2 sm:px-4 pt-2 sm:pt-[12vh]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0" style={{ background: 'var(--bg-overlay)' }} onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="relative w-full max-w-[600px] rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-pop)', animation: 'popIn 0.14s ease-out' }}
      >
        <div className="flex items-center gap-3 px-4 h-14" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={analysisData ? 'Joueur, équipe, vue ou action…' : 'Vue ou action…'}
            className="flex-1 bg-transparent outline-none text-[15px]"
            style={{ color: 'var(--text-primary)' }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
          <span className="ui-kbd hidden sm:inline-flex">Esc</span>
          <button onClick={close} className="sm:hidden ui-btn ui-btn-ghost ui-btn-sm">Annuler</button>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" className="max-h-[60dvh] sm:max-h-[52vh] overflow-y-auto p-1.5">
          {commands.length === 0 && (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Aucun résultat pour « {query} »
            </div>
          )}
          {commands.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null
            lastGroup = cmd.group
            const Icon = cmd.icon
            const active = i === index
            return (
              <div key={cmd.id}>
                {header && <div className="px-2.5 pt-2.5 pb-1 ui-eyebrow">{header}</div>}
                <button
                  data-idx={i}
                  role="option"
                  aria-selected={active}
                  onMouseMove={() => setIndex(i)}
                  onClick={cmd.run}
                  className="w-full flex items-center gap-3 px-2.5 h-10 rounded-lg text-left text-[13.5px]"
                  style={{ background: active ? 'var(--bg-hover)' : undefined, color: 'var(--text-primary)' }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? 'var(--accent)' : 'var(--text-tertiary)' }} />
                  <span className="flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && <span className="text-xs num" style={{ color: 'var(--text-quaternary)' }}>{cmd.hint}</span>}
                  {active && <CornerDownLeft className="w-3.5 h-3.5" style={{ color: 'var(--text-quaternary)' }} />}
                </button>
              </div>
            )
          })}
        </div>
        <div className="hidden sm:flex items-center gap-4 px-4 h-9 text-[11px]" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-quaternary)' }}>
          <span className="flex items-center gap-1"><span className="ui-kbd">↑</span><span className="ui-kbd">↓</span> naviguer</span>
          <span className="flex items-center gap-1"><span className="ui-kbd">↵</span> ouvrir</span>
          <span className="flex items-center gap-1"><span className="ui-kbd">/</span> ouvrir la recherche</span>
        </div>
      </div>
    </div>
  )
}
