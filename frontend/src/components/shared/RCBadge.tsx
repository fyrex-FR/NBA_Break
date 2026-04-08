/**
 * Badge "Rookie Card" style Panini RC — bouclier doré avec RC en blanc.
 * Sizes: 'sm' (inline dans les tables), 'md' (fiche joueur), 'lg' (vue Rookies)
 */

interface RCBadgeProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function RCBadge({ size = 'sm', className = '' }: RCBadgeProps) {
  const dims = {
    sm: { w: 20, h: 24, fontSize: 6.5, fontWeight: 800 },
    md: { w: 32, h: 38, fontSize: 10.5, fontWeight: 800 },
    lg: { w: 48, h: 57, fontSize: 15.5, fontWeight: 800 },
  }[size]

  return (
    <svg
      width={dims.w}
      height={dims.h}
      viewBox="0 0 48 57"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <title>Rookie Card</title>
      {/* Ombre */}
      <ellipse cx="24" cy="54" rx="14" ry="3" fill="rgba(0,0,0,0.25)" />

      {/* Dégradé fond bouclier */}
      <defs>
        <linearGradient id="rcGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="50%" stopColor="#FFA500" />
          <stop offset="100%" stopColor="#CC7700" />
        </linearGradient>
        <linearGradient id="rcShine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <filter id="rcGlow">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#FFA500" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Bouclier */}
      <path
        d="M24 2 L44 10 L44 28 C44 40 34 50 24 54 C14 50 4 40 4 28 L4 10 Z"
        fill="url(#rcGold)"
        filter="url(#rcGlow)"
      />

      {/* Bordure bouclier */}
      <path
        d="M24 2 L44 10 L44 28 C44 40 34 50 24 54 C14 50 4 40 4 28 L4 10 Z"
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.5"
      />

      {/* Reflet */}
      <path
        d="M24 4 L42 11.5 L42 28 C42 38 33 47 24 51"
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Texte RC */}
      <text
        x="24"
        y="33"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize="16"
        fontWeight="900"
        fontFamily="'Arial Black', 'Impact', sans-serif"
        letterSpacing="-0.5"
        style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.5))' }}
      >
        RC
      </text>
    </svg>
  )
}
