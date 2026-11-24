import { useState } from 'react'
import { Menu, Search, Library, Target, Check, Loader2, Radio, X, Share2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { destinationFor, tabsOf, navItemFor } from '../../navigation'
import { useOddsConfig, ODDS_CHANNEL_LABELS_FR, ODDS_CHANNEL_ORDER } from '../../hooks/useOddsConfig'
import { plural, shortCollectionLabel } from '../../utils/checklists'
import { Popover } from '../ui/primitives'
import { buildShareUrl } from '../../hooks/useUrlSync'

export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { activeView, setPaletteOpen, analysisData, isAnalyzing, selectedSport, selectedChecklistIds } = useAppStore()
  const item = navItemFor(activeView)
  const destination = destinationFor(activeView)
  const multiTab = !!destination && tabsOf(destination.id, analysisData?.enabled_views, selectedSport).length > 1
  const showsHome = !!item?.needsAnalysis && !analysisData && destination?.id === 'collections'
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-2 px-3 md:px-6 flex-shrink-0"
      style={{
        height: 'calc(var(--topbar-h) + env(safe-area-inset-top))',
        paddingTop: 'env(safe-area-inset-top)',
        background: 'color-mix(in srgb, var(--bg-primary) 82%, transparent)',
        backdropFilter: 'saturate(1.4) blur(12px)',
        WebkitBackdropFilter: 'saturate(1.4) blur(12px)',
        borderBottom: '2px solid var(--rule-heavy)',
      }}
    >
      <button onClick={onOpenNav} className="md:hidden ui-btn ui-btn-ghost ui-btn-icon" aria-label="Ouvrir le menu">
        <Menu className="w-5 h-5" />
      </button>

      {/* Sur mobile, la barre du bas (et le titre de l'accueil) disent déjà où on est : on laisse la place à la collection ouverte. */}
      <div className={`min-w-0 items-center gap-1.5 text-[13px] ${destination && (selectedChecklistIds.length > 0 || showsHome) ? 'hidden sm:flex' : 'flex'}`}>
        {showsHome ? (
          <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>Collections</span>
        ) : (
          <>
            {/* Mobile : la destination (les onglets montrent où on est). Desktop : « Collections / Hits ». */}
            <span className={`font-semibold truncate text-[var(--text-primary)] ${multiTab ? 'sm:font-normal sm:text-[var(--text-quaternary)]' : ''}`}>
              {destination?.label ?? item?.label ?? 'Accueil'}
            </span>
            {multiTab && item && (
              <span className="hidden sm:inline font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                <span style={{ color: 'var(--text-quaternary)' }} className="font-normal">/ </span>{item.tab}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex-1" />

      <BreakChip />
      <OddsConfigChip />
      <SelectionChip />
      <ShareButton />

      <button
        onClick={() => setPaletteOpen(true)}
        className="hidden sm:inline-flex ui-btn ui-btn-secondary !h-8 !px-2.5 gap-2"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Rechercher"
      >
        <Search className="w-4 h-4" />
        <span className="hidden lg:inline text-[13px]">Rechercher</span>
        <span className="hidden lg:inline-flex gap-0.5"><span className="ui-kbd">{isMac ? '⌘' : 'Ctrl'}</span><span className="ui-kbd">K</span></span>
      </button>
      <button onClick={() => setPaletteOpen(true)} className="sm:hidden ui-btn ui-btn-ghost ui-btn-icon" aria-label="Rechercher">
        <Search className="w-5 h-5" />
      </button>

      {/* Analyse en cours alors qu'un résultat est déjà affiché : simple filet de progression. */}
      {isAnalyzing && analysisData && <span className="ui-progress-line" role="progressbar" aria-label="Mise à jour de l’analyse" />}
    </header>
  )
}

/* Bouton Partager : feuille de partage native (iPhone, tablette), sinon copie du lien. Discret : ce n'est pas l'action principale. */
function ShareButton() {
  const { selectedChecklistIds } = useAppStore()
  const [copied, setCopied] = useState(false)
  if (selectedChecklistIds.length === 0) return null

  async function share() {
    const url = buildShareUrl()
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: document.title, url })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copie le lien :', url)
    }
  }

  return (
    <button
      onClick={share}
      className="ui-btn ui-btn-ghost ui-btn-icon sm:!w-auto sm:!px-2.5 gap-2 flex-shrink-0"
      title="Partager cette vue"
      aria-label="Partager cette vue"
    >
      {copied ? <Check className="w-[18px] h-[18px]" style={{ color: 'var(--success)' }} /> : <Share2 className="w-[18px] h-[18px]" />}
      <span className="hidden sm:inline">{copied ? 'Lien copié' : 'Partager'}</span>
    </button>
  )
}

function SelectionChip() {
  const { selectedChecklistIds, availableChecklists, openSelection, isAnalyzing } = useAppStore()
  const open = availableChecklists.filter((c) => selectedChecklistIds.includes(c.checklist_id))
  const count = selectedChecklistIds.length
  const first = open[0]

  return (
    <button
      onClick={() => openSelection('catalog')}
      className="ui-btn ui-btn-secondary !h-10 sm:!h-8 !px-2.5 min-w-0 max-w-[200px] sm:max-w-[300px]"
      title={count ? open.map(shortCollectionLabel).join('\n') : 'Choisir les collections'}
    >
      {isAnalyzing
        ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" style={{ color: 'var(--accent)' }} />
        : <Library className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />}
      {count === 0 ? (
        <span className="truncate">Choisir une collection</span>
      ) : (
        <>
          <span className="truncate">{first ? shortCollectionLabel(first) : plural(count, 'collection')}</span>
          {count > 1 && <span className="num flex-shrink-0 font-semibold" style={{ color: 'var(--accent)' }}>+{count - 1}</span>}
        </>
      )}
    </button>
  )
}

function OddsConfigChip() {
  const { selectedConfigKeys, toggleConfigKey, clearConfigKeys } = useAppStore()
  const { configOptions } = useOddsConfig()
  const [open, setOpen] = useState(false)
  if (configOptions.length === 0) return null

  const selectedLabels = configOptions.filter((c) => selectedConfigKeys.includes(c.key)).map((c) => c.label)
  const summary = selectedLabels.length === 0 ? 'Toutes configs' : selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels.length} configs`

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`ui-chip !h-8 ${selectedLabels.length ? 'is-active' : ''}`}
        title="Configuration de box utilisée pour pondérer les odds"
      >
        <Target className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
        <span className="max-w-[120px] truncate">{summary}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="right" width={300}>
        <div className="px-2.5 pt-2 pb-1.5 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Je break du…</div>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Pondère les pastilles odds et la simulation.</div>
          </div>
          {selectedConfigKeys.length > 0 && (
            <button onClick={clearConfigKeys} className="ui-btn ui-btn-ghost ui-btn-sm">Effacer</button>
          )}
        </div>
        {ODDS_CHANNEL_ORDER.map((channel) => {
          const opts = configOptions.filter((c) => c.channel === channel)
          if (opts.length === 0) return null
          return (
            <div key={channel} className="py-1">
              <div className="px-2.5 py-1 ui-eyebrow">{ODDS_CHANNEL_LABELS_FR[channel] || channel}</div>
              {opts.map((c) => {
                const on = selectedConfigKeys.includes(c.key)
                return (
                  <button
                    key={c.key}
                    onClick={() => toggleConfigKey(c.key)}
                    className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-[13px] ui-row-hover"
                    style={{ color: 'var(--text-primary)' }}
                    role="menuitemcheckbox"
                    aria-checked={on}
                  >
                    <span
                      className="inline-flex items-center justify-center w-4 h-4 rounded-[5px]"
                      style={{ background: on ? 'var(--accent)' : 'transparent', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`, color: 'var(--accent-fg)' }}
                    >
                      {on && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                    {c.label}
                  </button>
                )
              })}
            </div>
          )
        })}
      </Popover>
    </div>
  )
}

function BreakChip() {
  const { breakContext, setActiveView, clearBreakContext, activeView } = useAppStore()
  if (!breakContext) return null
  return (
    <div className="flex items-center rounded-sm h-8 pl-1.5 md:pl-2.5 pr-0 md:pr-1 gap-1.5" style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)' }}>
      <button onClick={() => setActiveView('🎲 État du Break')} className="md:hidden pr-1.5" aria-label="Break en cours">
        <Radio className="w-4 h-4 animate-pulse" style={{ color: 'var(--danger)' }} />
      </button>
      <Radio className="hidden md:block w-3.5 h-3.5" style={{ color: 'var(--danger)' }} />
      <button
        onClick={() => setActiveView('🎲 État du Break')}
        className="hidden md:block text-xs font-medium max-w-[160px] truncate"
        style={{ color: activeView === '🎲 État du Break' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        title={breakContext.detail.title}
      >
        {breakContext.detail.title || 'Break actif'}
      </button>
      <button onClick={clearBreakContext} className="hidden md:inline-flex ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon" aria-label="Quitter le break">
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
