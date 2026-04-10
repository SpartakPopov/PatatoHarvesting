/**
 * components/Sidebar/Gauge.jsx
 *
 * Semicircular SVG arc gauge for current potato yield %.
 * Arc spans 180° left → 180° right (full semicircle = 100%).
 * Needle angle: π × (1 − pct/100) radians from East axis.
 */

const ARC_LEN = 245 // ≈ π × 78  (arc radius in SVG units)

function GaugeNeedle({ pct }) {
  const angle = Math.PI * (1 - (pct ?? 0) / 100)
  return (
    <line
      x1="100" y1="100"
      x2={(100 + Math.cos(angle) * 60).toFixed(1)}
      y2={(100 - Math.sin(angle) * 60).toFixed(1)} // SVG y-axis is inverted
      stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.85"
    />
  )
}

export default function Gauge({ pct }) {
  const safe   = pct ?? 0
  const offset = (ARC_LEN * (1 - safe / 100)).toFixed(1)

  const color =
    safe >= 80 ? '#22c55e' :
    safe >= 60 ? '#eab308' :
    safe >= 40 ? '#f97316' : '#ef4444'

  return (
    <div className="gauge-wrap">
      <svg width="220" height="126" viewBox="0 0 200 115" className="gauge-svg">
        <defs>
          <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#991b1b" />
            <stop offset="30%"  stopColor="#f97316" />
            <stop offset="55%"  stopColor="#eab308" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>

        {/* Background track */}
        <path d="M 22 100 A 78 78 0 0 1 178 100"
              fill="none" stroke="rgba(255,255,255,0.07)"
              strokeWidth="14" strokeLinecap="round" />

        {/* Value arc */}
        <path d="M 22 100 A 78 78 0 0 1 178 100"
              fill="none" stroke="url(#arcGrad)"
              strokeWidth="14" strokeLinecap="round"
              strokeDasharray={ARC_LEN} strokeDashoffset={offset} />

        <GaugeNeedle pct={safe} />
        <circle cx="100" cy="100" r="5" fill="white" opacity="0.85" />

        {/* Scale labels */}
        <text x="18"  y="113" fontSize="9" fill="#6b7a99" textAnchor="middle">0</text>
        <text x="100" y="22"  fontSize="9" fill="#6b7a99" textAnchor="middle">50</text>
        <text x="182" y="113" fontSize="9" fill="#6b7a99" textAnchor="middle">100</text>
      </svg>

      <div className="gauge-center">
        <span className="gauge-big" style={{ color }}>
          {pct != null ? pct.toFixed(1) : '--'}
        </span>
        <span className="gauge-unit">% potato</span>
      </div>
    </div>
  )
}
