import type { OddsBadgeCode } from '../../types'

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
  china: 'China',
}

export function groupLabel(group: string): string {
  if (GROUP_LABELS_FR[group]) return GROUP_LABELS_FR[group]
  // silver_pack → Silver Pack ; fdi → FDI (sigles courts en capitales).
  return group.split('_').map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
}

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
