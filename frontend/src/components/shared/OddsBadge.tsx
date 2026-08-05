/**
 * Pastille odds Topps — calquée sur CategoryBadge.tsx (mêmes classes, même
 * approche couleur via rgba() translucides pour rester lisible en clair/sombre).
 *
 * `OddsBadge` = mode compact (une pastille seule).
 * `OddsBadgeList` = mode liste (plusieurs badges côte à côte, flex-wrap).
 */
import type { OddsBadgeCode, OddsBest } from '../../types'

const GROUP_LABELS_FR: Record<string, string> = {
  hobby: 'Hobby',
  jumbo: 'Jumbo',
  delight: 'Delight',
  sapphire: 'Sapphire',
  value: 'Value',
  mega: 'Mega',
  fanatics: 'Fanatics',
  promo: 'Promo',
  blaster: 'Blaster',
  hanger: 'Hanger',
  retail: 'Retail',
}

export function groupLabel(group: string): string {
  return GROUP_LABELS_FR[group] || (group ? group.charAt(0).toUpperCase() + group.slice(1) : group)
}

type Colors = { bg: string; text: string }

// Badges de disponibilité — visuellement distincts entre eux (hobby / retail / special).
const AVAILABILITY_LABELS: Record<string, string> = {
  hobby_only: 'Hobby only',
  hobby_delight: 'Hobby & Delight',
  retail_only: 'Retail only',
  sapphire_only: 'Sapphire only',
  delight_only: 'Delight only',
  fanatics_only: 'Fanatics only',
  promo_only: 'Promo only',
  partout: 'Partout',
}

const AVAILABILITY_STYLES: Record<string, Colors> = {
  hobby_only: { bg: 'rgba(14, 165, 233, 0.15)', text: '#0ea5e9' },
  hobby_delight: { bg: 'rgba(20, 184, 166, 0.15)', text: '#14b8a6' },
  retail_only: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
  sapphire_only: { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6' },
  delight_only: { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4' },
  fanatics_only: { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899' },
  promo_only: { bg: 'rgba(161, 161, 170, 0.15)', text: '#a1a1aa' },
  partout: { bg: 'rgba(148, 163, 184, 0.15)', text: 'var(--text-tertiary)' },
}

// Badges de rareté — ton neutre/alerte (jaune -> orange -> rouge, à mesure que ça se raréfie).
const RARITY_LABELS: Record<string, string> = {
  sp: 'SP',
  ssp: 'SSP',
  case_hit: 'Case hit',
}

const RARITY_STYLES: Record<string, Colors> = {
  sp: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' },
  ssp: { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316' },
  case_hit: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
}

const FALLBACK_STYLE: Colors = { bg: 'rgba(148, 163, 184, 0.15)', text: 'var(--text-tertiary)' }
const BEST_STYLE: Colors = { bg: 'color-mix(in srgb, var(--accent) 16%, transparent)', text: 'var(--accent)' }

/** Vrai pour les codes `best:<group>` — pas de pastille de disponibilité ni de rareté. */
export function isBestBadge(code: OddsBadgeCode): boolean {
  return code.startsWith('best:')
}

/**
 * Sous-ensemble "discret" d'une liste de badges : le badge de disponibilité
 * (s'il existe) + le badge de rareté (s'il existe), jamais les `best:<group>`.
 * C'est ce qu'on affiche dans une cellule de tableau (Box Type).
 */
export function discreetBadges(codes: OddsBadgeCode[]): OddsBadgeCode[] {
  return codes.filter((c) => !isBestBadge(c))
}

function resolve(code: OddsBadgeCode): { label: string; colors: Colors } {
  if (isBestBadge(code)) {
    const group = code.slice('best:'.length)
    return { label: `Best : ${groupLabel(group)}`, colors: BEST_STYLE }
  }
  if (AVAILABILITY_LABELS[code]) {
    return { label: AVAILABILITY_LABELS[code], colors: AVAILABILITY_STYLES[code] || FALLBACK_STYLE }
  }
  if (RARITY_LABELS[code]) {
    return { label: RARITY_LABELS[code], colors: RARITY_STYLES[code] || FALLBACK_STYLE }
  }
  return { label: code, colors: FALLBACK_STYLE }
}

interface OddsBadgeProps {
  code: OddsBadgeCode
  /** Meilleures odds du group, pour le tooltip d'un badge `best:<group>`. */
  best?: OddsBest | null
  className?: string
}

/** Mode compact : une pastille seule. */
export function OddsBadge({ code, best, className }: OddsBadgeProps) {
  const { label, colors } = resolve(code)
  const title = isBestBadge(code) && best ? `1:${best.odds.toLocaleString('fr-FR')}` : undefined
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap${className ? ` ${className}` : ''}`}
      style={{ background: colors.bg, color: colors.text }}
      title={title}
    >
      {label}
    </span>
  )
}

interface OddsBadgeListProps {
  codes: OddsBadgeCode[]
  /** Pour afficher les odds en tooltip des badges `best:<group>`. */
  bestByGroup?: Record<string, OddsBest>
  className?: string
}

/** Mode liste : plusieurs badges côte à côte, avec flex-wrap. */
export function OddsBadgeList({ codes, bestByGroup, className }: OddsBadgeListProps) {
  if (!codes.length) return null
  return (
    <span className={`inline-flex flex-wrap items-center gap-1${className ? ` ${className}` : ''}`}>
      {codes.map((code) => (
        <OddsBadge
          key={code}
          code={code}
          best={isBestBadge(code) ? bestByGroup?.[code.slice('best:'.length)] : undefined}
        />
      ))}
    </span>
  )
}
