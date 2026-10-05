import { useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'

/**
 * Vraie carte (photo/scan) posée à côté du téléphone, avec un reflet holo animé.
 * Fichier attendu : /public/hero-card.webp (ou .png), format portrait ~5:7.
 * Tant que le fichier n'existe pas, rien n'est affiché.
 */
const SOURCES = ['/hero-card.webp', '/hero-card.png', '/hero-card.jpg']

export function HeroCard() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [srcIndex, setSrcIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  if (srcIndex >= SOURCES.length) return null

  return (
    <div
      aria-hidden
      className="absolute -left-4 sm:-left-16 bottom-16 w-[112px] sm:w-[150px] aspect-[5/7] pointer-events-none"
      style={{
        perspective: 900,
        opacity: loaded ? 1 : 0,
        transition: 'opacity 0.4s',
      }}
    >
      <div
        className="relative w-full h-full rounded-[10px] overflow-hidden"
        style={{
          transformStyle: 'preserve-3d',
          animation: reduced ? undefined : 'holoFloat 6s ease-in-out infinite',
          transform: reduced ? 'rotate(-7deg)' : undefined,
          boxShadow: '0 24px 48px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12)',
        }}
      >
        <img
          src={SOURCES[srcIndex]}
          alt=""
          className="w-full h-full object-cover"
          onLoad={() => setLoaded(true)}
          onError={() => setSrcIndex((i) => i + 1)}
        />
        {/* Reflet holographique qui balaie la carte */}
        <div
          className="absolute inset-0 mix-blend-color-dodge opacity-70"
          style={{
            background: 'linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.55) 45%, rgba(120,220,255,0.45) 50%, rgba(255,140,220,0.4) 55%, transparent 68%)',
            backgroundSize: '260% 100%',
            animation: reduced ? undefined : 'holoShine 3.6s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  )
}
