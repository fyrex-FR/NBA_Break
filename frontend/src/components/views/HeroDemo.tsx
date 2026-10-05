import { useEffect, useState } from 'react'
import {
  Menu, Search, Layers, LayoutDashboard, User, Shield, X, ChevronDown, ChevronRight, Target,
  Library, Bookmark, Radio, Play, Check,
} from 'lucide-react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { CheckboxMark } from '../ui/primitives'
import { CATEGORY_META } from '../../constants/categories'
import { formatCount } from '../../utils/checklists'

/**
 * Démo animée de l'accueil : un téléphone qui rejoue le vrai parcours mobile
 * (sélection → vue d'ensemble → simulation). L'écran est rendu à la taille réelle
 * d'un iPhone (375 px) avec les mêmes classes que l'appli, puis réduit — ce que
 * l'on voit est donc l'interface réelle, pas une illustration.
 * Chiffres : une vraie analyse NBA 2025-26 (Topps Chrome Update + Bowman).
 */

const SCREEN_W = 375
const SCREEN_H = 740
const SCENE_MS = [5200, 4400, 4600]

export interface DemoChecklist {
  name: string
  rows: number
  odds: boolean
}

const SPOT_NAMES: Record<string, string[]> = {
  nba: ['Oklahoma City Thunder', 'Utah Jazz', 'Charlotte Hornets', 'Phoenix Suns', 'Memphis Grizzlies', 'San Antonio Spurs'],
  nfl: ['Chicago Bears', 'New England Patriots', 'New York Giants', 'Kansas City Chiefs', 'New York Jets', 'Dallas Cowboys'],
  soccer: ['Paris Saint-Germain', 'Real Madrid', 'Arsenal', 'Inter Milan', 'Bayern Munich', 'FC Barcelona'],
}

// Résultat réel d'une simulation « par équipe » (2 checklists NBA 2025-26).
const SPOT_STATS = [
  { score: 179, hits: 43, ch: 10, part: '4.1%' },
  { score: 179, hits: 48, ch: 7, part: '4.1%' },
  { score: 163, hits: 41, ch: 8, part: '3.7%' },
  { score: 162, hits: 39, ch: 9, part: '3.7%' },
  { score: 158, hits: 36, ch: 10, part: '3.6%' },
  { score: 149, hits: 23, ch: 16, part: '3.4%' },
]

// Répartition réelle de la même analyse.
const SUMMARY: Record<string, number> = { logoman: 0, case_hit: 260, auto_mem: 93, auto: 939, mem: 6, base_other: 1451 }
const TOTAL = 2749

const FALLBACK_CHECKLISTS: DemoChecklist[] = [
  { name: 'Topps Basketball', rows: 2147, odds: false },
  { name: 'Topps Bowman Basketball', rows: 1493, odds: false },
  { name: 'Topps Chrome Update Basketball', rows: 1256, odds: true },
  { name: 'Panini Donruss Basketball', rows: 1428, odds: false },
]

export function HeroDemo({ sport, checklists }: { sport: string; checklists: DemoChecklist[] }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const small = useMediaQuery('(max-width: 639px)')
  const [scene, setScene] = useState(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) return
    const id = window.setTimeout(() => setScene((s) => (s + 1) % 3), SCENE_MS[scene])
    return () => window.clearTimeout(id)
  }, [scene, reduced])

  const scale = small ? 0.7 : 0.8
  const bezel = 11
  const list = checklists.length >= 4 ? checklists.slice(0, 4) : FALLBACK_CHECKLISTS

  return (
    <div className="relative mx-auto select-none" aria-hidden style={{ width: SCREEN_W * scale + bezel * 2 }}>
      <div className="absolute -inset-12 pointer-events-none" style={{ background: 'radial-gradient(closest-side, var(--accent-soft), transparent 70%)' }} />

      {/* Téléphone */}
      <div
        className="relative"
        style={{
          padding: bezel,
          borderRadius: 52 * scale + bezel,
          background: 'linear-gradient(145deg, #2a2d33, #0c0d10)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset, 0 30px 60px -20px rgba(0,0,0,0.55), 0 12px 24px -12px rgba(0,0,0,0.4)',
        }}
      >
        <div className="relative overflow-hidden" style={{ width: SCREEN_W * scale, height: SCREEN_H * scale, borderRadius: 44 * scale }}>
          <div
            className="absolute top-0 left-0"
            style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${scale})`, transformOrigin: 'top left', background: 'var(--bg-primary)' }}
          >
            <StatusBar />
            <div key={scene} className="absolute inset-x-0 bottom-0 top-[46px]" style={{ animation: reduced ? undefined : 'demoSceneIn 0.4s ease-out' }}>
              {scene === 0 && <SelectionScene list={list} reduced={reduced} />}
              {scene === 1 && <OverviewScene reduced={reduced} />}
              {scene === 2 && <SimulationScene spots={SPOT_NAMES[sport] ?? SPOT_NAMES.nba} reduced={reduced} />}
            </div>
            {/* Dynamic Island */}
            <div className="absolute top-[11px] left-1/2 -translate-x-1/2 w-[112px] h-[32px] rounded-full bg-black" />
          </div>
        </div>
      </div>

      {/* Étapes */}
      <div className="mt-4 flex justify-center gap-1.5">
        {['Sélection', 'Analyse', 'Simulation'].map((label, i) => (
          <span key={label} className="relative h-1 w-10 rounded-full overflow-hidden" style={{ background: 'var(--border-standard)' }} title={label}>
            {i === scene && (
              <span
                key={`p${scene}`}
                className="absolute inset-0 origin-left"
                style={{ background: 'var(--heat-gradient-warm)', animation: reduced ? undefined : `demoProgress ${SCENE_MS[scene]}ms linear both` }}
              />
            )}
            {i < scene && <span className="absolute inset-0" style={{ background: 'var(--accent)', opacity: 0.45 }} />}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Chrome de l'app (copie conforme de TopBar / MobileTabBar) ─────────── */

function StatusBar() {
  return (
    <div className="absolute inset-x-0 top-0 h-[46px] flex items-end justify-between px-8 pb-1.5 text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
      <span className="num">9:41</span>
      <span className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px] h-3">
          {[4, 6, 8, 11].map((h) => <span key={h} className="w-[3px] rounded-sm" style={{ height: h, background: 'currentColor' }} />)}
        </span>
        <span className="w-6 h-3 rounded-[4px] p-[1.5px]" style={{ border: '1px solid currentColor', opacity: 0.9 }}>
          <span className="block h-full w-3/4 rounded-[2px]" style={{ background: 'currentColor' }} />
        </span>
      </span>
    </div>
  )
}

function AppTopBar({ title, count }: { title: string; count: number }) {
  return (
    <header
      className="flex items-center gap-2 px-3 h-14"
      style={{ background: 'color-mix(in srgb, var(--bg-primary) 82%, transparent)', borderBottom: '1px solid var(--border-subtle)' }}
    >
      <span className="ui-btn ui-btn-icon"><Menu className="w-5 h-5" /></span>
      <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
      <span className="flex-1" />
      <span className="ui-btn ui-btn-secondary !h-8 !px-2.5">
        <Layers className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="num">{count} checklists</span>
      </span>
      <span className="ui-btn ui-btn-icon"><Search className="w-5 h-5" /></span>
    </header>
  )
}

function AppTabBar({ active, badge }: { active: 'Aperçu' | 'Joueur' | 'Équipe' | null; badge: number }) {
  const tabs = [
    { label: 'Aperçu', icon: LayoutDashboard },
    { label: 'Joueur', icon: User },
    { label: 'Équipe', icon: Shield },
    { label: 'Chercher', icon: Search },
    { label: 'Sélection', icon: Layers },
  ] as const
  return (
    <nav
      className="absolute bottom-0 inset-x-0 grid grid-cols-5 pb-5"
      style={{ background: 'color-mix(in srgb, var(--bg-panel) 92%, transparent)', borderTop: '1px solid var(--border-subtle)' }}
    >
      {tabs.map(({ label, icon: Icon }) => (
        <span
          key={label}
          className="relative flex flex-col items-center justify-center gap-0.5 h-14 text-[10.5px] font-medium"
          style={{ color: active === label ? 'var(--accent)' : 'var(--text-tertiary)' }}
        >
          <Icon className="w-5 h-5" />
          {label}
          {label === 'Sélection' && badge > 0 && (
            <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold num flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
              {badge}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

/* ── Scène 1 : panneau de sélection (copie de SelectionPanel en mobile) ── */

function SelectionScene({ list, reduced }: { list: DemoChecklist[]; reduced: boolean }) {
  // Deux checklists se cochent, puis le bouton Analyser est « pressé ».
  const [checked, setChecked] = useState(reduced ? 2 : 0)
  const [pressed, setPressed] = useState(false)
  useEffect(() => {
    if (reduced) return
    const t = [
      window.setTimeout(() => setChecked(1), 900),
      window.setTimeout(() => setChecked(2), 1900),
      window.setTimeout(() => setPressed(true), 3900),
    ]
    return () => t.forEach(window.clearTimeout)
  }, [reduced])
  const picked = [list[2], list[1]]
  const isOn = (cl: DemoChecklist) => picked.slice(0, checked).includes(cl)
  const rows = picked.slice(0, checked).reduce((s, c) => s + c.rows, 0)

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: 'var(--bg-panel)' }}>
      <div className="flex items-start gap-3 px-5 pt-4 pb-4">
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Sélection des checklists</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>NBA (Basket)</div>
        </div>
        <span className="ui-btn ui-btn-icon -mr-1.5 -mt-1"><X className="w-4 h-4" /></span>
      </div>
      <div className="px-5 pb-3">
        <div className="ui-segment">
          <button aria-pressed="true" tabIndex={-1}><Library className="w-3.5 h-3.5" />Catalogue</button>
          <button aria-pressed="false" tabIndex={-1}><Bookmark className="w-3.5 h-3.5" />Presets</button>
          <button aria-pressed="false" tabIndex={-1}><Radio className="w-3.5 h-3.5" />Break Voggt</button>
        </div>
      </div>
      <div className="px-5 py-3 space-y-2.5" style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-quaternary)' }} />
          <div className="ui-input pl-8 flex items-center" style={{ color: 'var(--text-quaternary)' }}>Prizm 2024, Donruss, Topps Chrome…</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="ui-select inline-flex items-center">Tous les produits</span>
          <span className="ui-select inline-flex items-center">A → Z</span>
          <span className="ui-chip !h-7">Sélectionnées <span className="num" style={{ color: 'var(--text-quaternary)' }}>{checked}</span></span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-3 py-2">
        <div className="flex items-center gap-2 px-2 h-9">
          <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-quaternary)' }} />
          <span className="text-[13px] font-semibold num" style={{ color: 'var(--text-primary)' }}>2025-26</span>
          <span className="text-xs num" style={{ color: checked ? 'var(--accent)' : 'var(--text-quaternary)' }}>{checked ? `${checked}/25` : 25}</span>
          <span className="flex-1" />
          <CheckboxMark checked={false} indeterminate={checked > 0} />
        </div>
        <ul>
          {list.map((cl) => {
            const on = isOn(cl)
            return (
              <li key={cl.name}>
                <div className="flex items-center gap-3 pl-8 pr-2 py-2 rounded-lg transition-colors" style={{ background: on ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : undefined }}>
                  <span style={{ animation: on && !reduced ? 'demoPop 0.3s ease-out' : undefined }}>
                    <CheckboxMark checked={on} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{cl.name}</div>
                    <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>
                      <span className="num">{formatCount(cl.rows)} cartes</span>
                      {cl.odds && <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}><Target className="w-3 h-3" /> odds</span>}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="px-5 pt-4 pb-9 flex items-center gap-3" style={{ borderTop: '1px solid var(--border-standard)' }}>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold num" style={{ color: 'var(--text-primary)' }}>{checked === 0 ? 'Aucune checklist' : `${checked} checklist${checked > 1 ? 's' : ''}`}</div>
          <div className="text-xs num" style={{ color: 'var(--text-tertiary)' }}>{checked ? `${formatCount(rows)} cartes` : 'Coche au moins une checklist'}</div>
        </div>
        <span
          className="ui-btn ui-btn-primary ui-btn-lg transition-transform"
          style={{ opacity: checked ? 1 : 0.45, transform: pressed ? 'scale(0.95)' : undefined }}
        >
          <Play className="w-4 h-4 fill-current" /> Analyser
        </span>
      </div>
    </div>
  )
}

/* ── Scène 2 : vue d'ensemble (copie de GlobalView en mobile) ─────────── */

const KPI_BORDERS = ['', 'border-l', 'border-t', 'border-l border-t']

function OverviewScene({ reduced }: { reduced: boolean }) {
  const cards = useCountUp(TOTAL, 1100, 200, reduced)
  const players = useCountUp(479, 1100, 200, reduced)
  const teams = useCountUp(82, 1100, 200, reduced)
  const premium = useCountUp(1298, 1300, 200, reduced)
  const kpis = [
    { label: 'Cartes', value: cards, hint: '2 checklists' },
    { label: 'Joueurs', value: players },
    { label: 'Équipes', value: teams },
    { label: 'Hits premium', value: premium, hint: '47 % des cartes', accent: true },
  ]
  return (
    <>
      <AppTopBar title="Vue d'ensemble" count={2} />
      <div className="px-4 pt-6 space-y-6">
        <section className="ui-card grid grid-cols-2 overflow-hidden">
          {kpis.map((k, i) => (
            <div key={k.label} className={`px-5 py-4 border-[var(--border-subtle)] ${KPI_BORDERS[i]}`}>
              <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
              <div className="mt-1 text-[26px] leading-8 font-semibold font-mono-num" style={{ color: k.accent ? 'var(--accent)' : 'var(--text-primary)' }}>
                {formatCount(k.value)}
              </div>
              {k.hint && <div className="text-xs mt-0.5" style={{ color: 'var(--text-quaternary)' }}>{k.hint}</div>}
            </div>
          ))}
        </section>

        <section className="ui-card p-4">
          <div className="text-[15px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Répartition des cartes</div>
          <div className="flex h-3 rounded-full overflow-hidden gap-[2px]">
            {CATEGORY_META.filter((m) => SUMMARY[m.key] > 0).map((m, i) => (
              <div
                key={m.key}
                className="origin-left"
                style={{ width: `${(SUMMARY[m.key] / TOTAL) * 100}%`, minWidth: 3, background: m.color, animation: reduced ? undefined : `demoGrow 0.6s cubic-bezier(.2,.8,.2,1) ${500 + i * 120}ms both` }}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-0.5 -mx-1.5">
            {CATEGORY_META.map((m) => {
              const v = SUMMARY[m.key]
              return (
                <div key={m.key} className="text-left rounded-lg px-1.5 py-1.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: m.color, opacity: v > 0 ? 1 : 0.35 }} />
                    {m.label}
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5 flex-wrap">
                    <span className="text-[15px] font-semibold num" style={{ color: v > 0 ? 'var(--text-primary)' : 'var(--text-quaternary)' }}>{formatCount(v)}</span>
                    <span className="text-xs num" style={{ color: 'var(--text-quaternary)' }}>
                      {v > 0 ? `${((v / TOTAL) * 100).toFixed(v / TOTAL < 0.01 ? 1 : 0)} %` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
      <AppTabBar active="Aperçu" badge={2} />
    </>
  )
}

/* ── Scène 3 : simulation (copie de BreakSimulationView + liste mobile) ── */

function SimulationScene({ spots, reduced }: { spots: string[]; reduced: boolean }) {
  const [pressed, setPressed] = useState(false)
  useEffect(() => {
    if (reduced) return
    const t = window.setTimeout(() => setPressed(true), 3600)
    return () => window.clearTimeout(t)
  }, [reduced])
  return (
    <>
      <AppTopBar title="Simulation" count={2} />
      <div className="px-4 pt-4">
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Spots', value: '82' },
            { label: 'Cartes', value: '2 749' },
            { label: 'Score total', value: '4 414' },
            { label: 'Hot spots', value: '26', hot: true },
          ].map((m) => (
            <div key={m.label} className="ui-card px-2.5 py-2 flex flex-col gap-0.5 min-w-0">
              <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-tertiary)' }}>{m.label}</span>
              <span className="text-[17px] leading-6 font-semibold font-mono-num truncate" style={{ color: m.hot ? 'color-mix(in srgb, var(--cat-logoman) 70%, var(--text-primary))' : 'var(--text-primary)' }}>{m.value}</span>
            </div>
          ))}
        </div>
        <div className="ui-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="ui-select inline-flex items-center">Score</span>
            <span className="ml-auto text-xs num" style={{ color: 'var(--text-quaternary)' }}>82 lignes</span>
          </div>
          <ul>
            {spots.slice(0, 6).map((name, i) => {
              const st = SPOT_STATS[i]
              return (
                <li key={name} style={{ borderBottom: '1px solid var(--border-subtle)', animation: reduced ? undefined : `demoRowIn 0.35s ease-out ${150 + i * 110}ms both` }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium leading-snug" style={{ color: 'var(--accent)' }}>{name}</div>
                      <div className="flex flex-wrap gap-x-3.5 gap-y-0.5 mt-1 text-xs">
                        <Stat label="Score" value={st.score} accent />
                        <Stat label="Hits" value={st.hits} />
                        <Stat label="✨" value={st.ch} color="var(--cat-case)" />
                        <Stat label="Part %" value={st.part} />
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-quaternary)' }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      <div className="absolute inset-x-3 bottom-[96px]">
        <span
          className="ui-btn ui-btn-primary ui-btn-lg w-full !h-12 !rounded-2xl transition-transform"
          style={{ boxShadow: 'var(--shadow-pop)', transform: pressed ? 'scale(0.97)' : undefined }}
        >
          {pressed ? <Check className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />} Relancer · Par équipe
        </span>
      </div>
      <AppTabBar active={null} badge={2} />
    </>
  )
}

function Stat({ label, value, accent, color }: { label: string; value: number | string; accent?: boolean; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span style={{ color: 'var(--text-quaternary)' }}>{label}</span>
      <span className="num font-semibold" style={{ color: accent ? 'var(--accent)' : color ?? 'var(--text-secondary)' }}>{value}</span>
    </span>
  )
}

/* ── Compteur animé ─────────────────────────────────────────────────────── */

function useCountUp(target: number, duration: number, delay: number, reduced: boolean) {
  const [value, setValue] = useState(reduced ? target : 0)
  useEffect(() => {
    if (reduced) return
    let raf = 0
    const start = performance.now() + delay
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, delay, reduced])
  return value
}
