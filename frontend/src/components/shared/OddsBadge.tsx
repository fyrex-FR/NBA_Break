/**
 * Pastille odds Topps — calquée sur CategoryBadge.tsx (mêmes classes, même
 * approche couleur via color-mix pour rester lisible en clair/sombre).
 *
 * `OddsBadge` = mode compact (une pastille seule).
 * `OddsBadgeList` = mode liste (plusieurs badges côte à côte, flex-wrap).
 */
import type { OddsBadgeCode, OddsBest } from '../../types'
import { groupLabel, isBestBadge } from './oddsBadgeUtils'

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

const tone = (c: string): Colors => ({
  bg: `color-mix(in srgb, ${c} 14%, transparent)`,
  text: `color-mix(in srgb, ${c} 78%, var(--text-primary))`,
})

const AVAILABILITY_STYLES: Record<string, Colors> = {
  hobby_only: tone('#0ea5e9'),
  hobby_delight: tone('#14b8a6'),
  retail_only: tone('#22c55e'),
  sapphire_only: tone('#8b5cf6'),
  delight_only: tone('#06b6d4'),
  fanatics_only: tone('#ec4899'),
  promo_only: tone('#a1a1aa'),
  partout: { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' },
}

// Badges de rareté — ton neutre/alerte (jaune -> orange -> rouge, à mesure que ça se raréfie).
const RARITY_LABELS: Record<string, string> = {
  sp: 'SP',
  ssp: 'SSP',
  case_hit: 'Case hit',
}

const RARITY_STYLES: Record<string, Colors> = {
  sp: tone('#eab308'),
  ssp: tone('#f97316'),
  case_hit: tone('#ef4444'),
}

const FALLBACK_STYLE: Colors = { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
const BEST_STYLE: Colors = { bg: 'color-mix(in srgb, var(--accent) 16%, transparent)', text: 'var(--accent)' }

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
      className={`inline-flex items-center rounded-full h-[20px] px-2 text-[11px] font-semibold whitespace-nowrap${className ? ` ${className}` : ''}`}
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
