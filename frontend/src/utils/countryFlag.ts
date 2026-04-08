/**
 * Converts a country name (as returned by nba_api) to a flag emoji.
 * Falls back to 🌍 if not found.
 */

const COUNTRY_TO_ISO: Record<string, string> = {
  // Amériques
  'USA': 'US', 'United States': 'US',
  'Canada': 'CA',
  'Brazil': 'BR', 'Brasil': 'BR',
  'Argentina': 'AR',
  'Dominican Republic': 'DO',
  'Puerto Rico': 'PR',
  'Venezuela': 'VE',
  'Mexico': 'MX',
  'Panama': 'PA',
  'Bahamas': 'BS',
  'Jamaica': 'JM',
  'Haiti': 'HT',
  // Europe
  'France': 'FR',
  'Germany': 'DE',
  'Spain': 'ES',
  'Serbia': 'RS',
  'Slovenia': 'SI',
  'Greece': 'GR',
  'Latvia': 'LV',
  'Lithuania': 'LT',
  'Croatia': 'HR',
  'Bosnia': 'BA', 'Bosnia and Herzegovina': 'BA',
  'Montenegro': 'ME',
  'Ukraine': 'UA',
  'Russia': 'RU',
  'Turkey': 'TR',
  'Italy': 'IT',
  'Poland': 'PL',
  'Czech Republic': 'CZ', 'Czechia': 'CZ',
  'Switzerland': 'CH',
  'Netherlands': 'NL',
  'Belgium': 'BE',
  'Sweden': 'SE',
  'Finland': 'FI',
  'Norway': 'NO',
  'Portugal': 'PT',
  'United Kingdom': 'GB',
  'England': 'GB',
  'Georgia': 'GE',
  'Romania': 'RO',
  'Hungary': 'HU',
  'Slovakia': 'SK',
  'Bulgaria': 'BG',
  'North Macedonia': 'MK',
  'Kosovo': 'XK',
  'Israel': 'IL',
  // Afrique
  'Nigeria': 'NG',
  'Cameroon': 'CM',
  'Senegal': 'SN',
  'Congo': 'CD', 'Democratic Republic of the Congo': 'CD',
  'Mali': 'ML',
  'Sudan': 'SD',
  'South Sudan': 'SS',
  'Egypt': 'EG',
  'Morocco': 'MA',
  'Tunisia': 'TN',
  'Ghana': 'GH',
  'Angola': 'AO',
  'Cape Verde': 'CV',
  // Asie/Océanie
  'Australia': 'AU',
  'New Zealand': 'NZ',
  'China': 'CN',
  'Japan': 'JP',
  'South Korea': 'KR',
  'Philippines': 'PH',
  'Iran': 'IR',
  'Lebanon': 'LB',
  'Kazakhstan': 'KZ',
}

function isoToFlag(iso: string): string {
  return iso.toUpperCase().replace(/./g, (c) =>
    String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
  )
}

export function countryFlag(country: string): string {
  if (!country) return ''
  const iso = COUNTRY_TO_ISO[country]
  if (!iso) return '🌍'
  return isoToFlag(iso)
}
