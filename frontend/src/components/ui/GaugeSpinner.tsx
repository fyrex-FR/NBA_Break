/** Loader de marque : la jauge NoClim dont l'aiguille balaie du froid au chaud. */
export function GaugeSpinner({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="120 260 784 480" aria-hidden className="flex-shrink-0">
      <defs>
        <linearGradient id="gauge-heat" x1="212" y1="0" x2="812" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3FC8F2" />
          <stop offset="0.5" stopColor="#FF2E63" />
          <stop offset="1" stopColor="#FF5A1F" />
        </linearGradient>
      </defs>
      <path d="M 212 664 A 300 300 0 0 1 812 664" fill="none" stroke="url(#gauge-heat)" strokeWidth="96" strokeLinecap="round" />
      <g style={{ transformBox: 'view-box', transformOrigin: '512px 664px', animation: 'gaugeSweep 1.4s cubic-bezier(.45,0,.2,1) infinite alternate' }}>
        <line x1="512" y1="664" x2="726" y2="664" stroke="var(--text-primary)" strokeWidth="58" strokeLinecap="round" />
      </g>
      <circle cx="512" cy="664" r="50" fill="var(--text-primary)" />
    </svg>
  )
}
