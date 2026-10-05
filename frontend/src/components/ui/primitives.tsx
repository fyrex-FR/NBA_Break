import { useEffect, useRef, type ReactNode } from 'react'
import { useEscape } from '../../hooks/useEscape'
import { X, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/* ── Segmented control ─────────────────────────────────────────────────── */

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode; icon?: LucideIcon; count?: number }[]
  className?: string
  ariaLabel?: string
}

export function Segmented<T extends string>({ value, onChange, options, className = '', ariaLabel }: SegmentedProps<T>) {
  return (
    <div className={`ui-segment ${className}`} role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const Icon = opt.icon
        return (
          <button key={opt.value} type="button" aria-pressed={value === opt.value} onClick={() => onChange(opt.value)}>
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {opt.label}
            {opt.count !== undefined && (
              <span className="num text-[11px]" style={{ color: 'var(--text-quaternary)' }}>{opt.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ── Sheet (panneau latéral droit / plein écran mobile) ─────────────────── */

interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
  labelledBy?: string
}

export function Sheet({ open, onClose, children, width = 520, labelledBy }: SheetProps) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0" style={{ background: 'var(--bg-overlay)', animation: 'fadeIn 0.15s ease-out' }} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative h-full w-full flex flex-col"
        style={{
          maxWidth: width,
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border-standard)',
          boxShadow: 'var(--shadow-pop)',
          animation: 'sheetIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/* ── Popover ancré ──────────────────────────────────────────────────────── */

interface PopoverProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  align?: 'left' | 'right'
  width?: number
  className?: string
}

export function Popover({ open, onClose, children, align = 'left', width = 280, className = '' }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEscape(open, onClose)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const parent = ref.current?.parentElement
      if (parent && !parent.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      ref={ref}
      className={`absolute top-full mt-1.5 z-[55] rounded-xl p-1.5 ${align === 'right' ? 'right-0' : 'left-0'} ${className}`}
      style={{
        width,
        background: 'var(--bg-elevated)',
        boxShadow: 'var(--shadow-pop)',
        animation: 'popIn 0.14s ease-out',
      }}
    >
      {children}
    </div>
  )
}

/* ── En-tête de page ────────────────────────────────────────────────────── */

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  eyebrow?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, description, icon: Icon, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className={`${actions ? 'flex' : 'hidden sm:flex'} flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 sm:mb-6`}>
      <div className="hidden sm:flex items-start gap-3 min-w-0">
        {Icon && (
          <div
            className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="ui-eyebrow mb-0.5">{eyebrow}</div>}
          <h1 className="text-[22px] leading-7 font-display" style={{ color: 'var(--text-primary)' }}>{title}</h1>
          {description && (
            <p className="hidden sm:block text-sm mt-1 max-w-2xl" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

/* ── État vide ──────────────────────────────────────────────────────────── */

export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl" style={{ border: '1px dashed var(--border-standard)' }}>
      {Icon && (
        <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-surface)', color: 'var(--text-tertiary)' }}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
      {children && <div className="text-sm mt-1 max-w-sm" style={{ color: 'var(--text-tertiary)' }}>{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ── Sheet header ───────────────────────────────────────────────────────── */

export function SheetHeader({ id, title, subtitle, onClose }: { id?: string; title: ReactNode; subtitle?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3 px-5 pt-5 pb-4 flex-shrink-0">
      <div className="flex-1 min-w-0">
        <h2 id={id} className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>}
      </div>
      <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon -mr-1.5 -mt-1" aria-label="Fermer">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

/* ── Case à cocher (visuel seul) ────────────────────────────────────────── */

export function CheckboxMark({ checked, indeterminate = false }: { checked: boolean; indeterminate?: boolean }) {
  const on = checked || indeterminate
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center w-4 h-4 rounded-[5px] flex-shrink-0 transition-colors"
      style={{
        background: on ? 'var(--accent)' : 'transparent',
        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`,
        color: 'var(--accent-fg)',
      }}
    >
      {checked ? <Check className="w-3 h-3" strokeWidth={3} /> : indeterminate ? <span className="w-2 h-0.5 rounded" style={{ background: 'currentColor' }} /> : null}
    </span>
  )
}
