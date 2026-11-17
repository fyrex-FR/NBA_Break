/** Petits formats partagés par le guide des boîtes et les fiches collection. */

/** « 2025-26 Panini Prizm Basketball » → « Panini Prizm ». */
export function shortProductName(name: string | null, season: string | null) {
  let n = name ?? ''
  if (season && n.startsWith(season)) n = n.slice(season.length)
  return n.replace(/\s+Basketball$/i, '').trim()
}

export function frenchDate(iso: string | null, style: 'long' | 'short' = 'long') {
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('fr-FR', style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' })
}

export function isUpcoming(iso: string | null) {
  return !!iso && new Date(`${iso}T23:59:59`).getTime() > Date.now()
}

export function usd(price: number | null | undefined) {
  if (price == null) return null
  return price.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: price % 1 ? 2 : 0 })
}
