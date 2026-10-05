import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Check, PanelLeftClose, PanelLeftOpen, Sun, Moon, BookOpenText, Lock, MessageCircle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { fetchSports } from '../../api/client'
import { NAV_ITEMS, NAV_SECTIONS, isItemEnabled, navItemFor, type NavItem } from '../../navigation'
import { Popover } from '../ui/primitives'

interface NavRailProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

export function NavRail({ mobileOpen, onMobileClose }: NavRailProps) {
  const { navCollapsed, toggleNavCollapsed, theme, toggleTheme, setChatOpen } = useAppStore()
  // Le drawer mobile est toujours déplié.
  const collapsed = navCollapsed && !mobileOpen

  return (
    <>
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-200 ${mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'var(--bg-overlay)' }}
        onClick={onMobileClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col h-dvh transition-[transform,width] duration-200 ease-out
          md:relative md:translate-x-0 md:flex-shrink-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: collapsed ? 64 : 248,
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border-subtle)',
        }}
        aria-label="Navigation principale"
      >
        <div className={`flex items-center gap-2.5 h-14 flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
          <img src="/brand/noclim-icon.svg" alt="" className="w-7 h-7 flex-shrink-0" />
          {!collapsed && (
            <span className="font-bold text-[15px] tracking-[-0.01em]" style={{ color: 'var(--text-primary)' }}>NoClim</span>
          )}
        </div>

        <div className={collapsed ? 'px-2' : 'px-3'}>
          <SportSwitcher collapsed={collapsed} onPicked={onMobileClose} />
        </div>

        <nav className={`flex-1 overflow-y-auto no-scrollbar py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
          <NavSections collapsed={collapsed} onNavigate={onMobileClose} />
        </nav>

        <div className={`flex-shrink-0 py-3 flex gap-1 ${collapsed ? 'flex-col items-center px-2' : 'items-center px-3'}`} style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <a href="/guide.html" target="_blank" rel="noreferrer" className="ui-btn ui-btn-ghost ui-btn-icon" title="Guide d'utilisation">
            <BookOpenText className="w-4 h-4" />
          </a>
          <button onClick={() => { setChatOpen(true); onMobileClose() }} className="ui-btn ui-btn-ghost ui-btn-icon md:hidden" title="Assistant">
            <MessageCircle className="w-4 h-4" />
          </button>
          <button onClick={toggleTheme} className="ui-btn ui-btn-ghost ui-btn-icon" title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {!collapsed && <span className="flex-1" />}
          <button onClick={toggleNavCollapsed} className="ui-btn ui-btn-ghost ui-btn-icon hidden md:inline-flex" title={collapsed ? 'Déplier le menu' : 'Replier le menu'}>
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>
      </aside>
    </>
  )
}

function SportSwitcher({ collapsed, onPicked }: { collapsed: boolean; onPicked: () => void }) {
  const { selectedSport, setSport } = useAppStore()
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })
  const [open, setOpen] = useState(false)
  const current = sports?.find((s) => s.key === selectedSport)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2.5 rounded-lg transition-colors ui-row-hover ${collapsed ? 'justify-center h-10' : 'h-10 px-2.5'}`}
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        title={collapsed ? current?.label : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-base leading-none">{current?.page_icon ?? '🃏'}</span>
        {!collapsed && (
          <>
            <span className="flex-1 min-w-0 text-left">
              <span className="block text-[11px] leading-3" style={{ color: 'var(--text-quaternary)' }}>Sport</span>
              <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{current?.label ?? '…'}</span>
            </span>
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-quaternary)' }} />
          </>
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} width={232}>
        <div role="listbox" aria-label="Sport">
          {sports?.map((s) => (
            <button
              key={s.key}
              role="option"
              aria-selected={s.key === selectedSport}
              onClick={() => { setSport(s.key); setOpen(false); onPicked() }}
              className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] ui-row-hover"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="w-5 text-center">{s.page_icon}</span>
              <span className="flex-1 text-left truncate">{s.label}</span>
              {s.key === selectedSport && <Check className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  )
}

function NavSections({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) {
  const { activeView, setActiveView, analysisData, selectedSport, breakContext, openSelection } = useAppStore()
  const [adminOpen, setAdminOpen] = useState(() => navItemFor(activeView)?.section === 'admin')
  const activeItem = navItemFor(activeView)
  const enabled = analysisData?.enabled_views

  function go(item: NavItem) {
    if (item.needsAnalysis && !analysisData) {
      openSelection('catalog')
    } else {
      setActiveView(item.view)
    }
    onNavigate()
  }

  return (
    <div className="space-y-4">
      {NAV_SECTIONS.map((section) => {
        const items = NAV_ITEMS.filter((i) => i.section === section.id)
          .filter((i) => isItemEnabled(i, enabled, selectedSport))
          .filter((i) => i.view !== '🎲 État du Break' || !!breakContext)
        if (items.length === 0) return null
        const isAdmin = !!section.collapsible
        const expanded = !isAdmin || adminOpen || collapsed
        return (
          <div key={section.id}>
            {!collapsed ? (
              isAdmin ? (
                <button onClick={() => setAdminOpen((v) => !v)} className="w-full flex items-center gap-1 px-2.5 mb-1 ui-eyebrow hover:text-[var(--text-secondary)]">
                  {section.label}
                  {adminOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              ) : (
                <div className="px-2.5 mb-1 ui-eyebrow">{section.label}</div>
              )
            ) : (
              <div className="mx-auto mb-2 w-5 h-px" style={{ background: 'var(--border-standard)' }} />
            )}
            {expanded && (
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const locked = item.needsAnalysis && !analysisData
                  const active = activeItem?.view === item.view && !locked
                  const Icon = item.icon
                  return (
                    <li key={item.view}>
                      <button
                        onClick={() => go(item)}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? item.label : locked ? 'Lance une analyse pour ouvrir cette vue' : undefined}
                        data-locked={locked}
                        className={`ui-nav-item group relative w-full flex items-center gap-2.5 rounded-lg text-[13px] ${collapsed ? 'justify-center h-9' : 'h-10 md:h-8 px-2.5 text-[14px] md:text-[13px]'}`}
                      >
                        {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: 'var(--accent)' }} />}
                        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? 'var(--accent)' : undefined }} />
                        {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                        {!collapsed && item.view === '🎲 État du Break' && (
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} />
                        )}
                        {!collapsed && locked && <Lock className="w-3 h-3 opacity-0 group-hover:opacity-100" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
