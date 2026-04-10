/**
 * components/Sidebar/Sparkline.jsx
 *
 * SVG polyline chart of the last N potato-% readings.
 * Reference lines at 90 % (green threshold) and 40 % (debris threshold).
 */

const W = 264, H = 48, PAD = 3

export default function Sparkline({ data }) {
  if (data.length < 2) {
    return <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} />
  }

  const points = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2)
    const y = H - PAD - (v / 100) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // y-coordinate for a given % value (SVG y-axis is inverted)
  const yFor = (pct) => (H - PAD - (pct / 100) * (H - PAD * 2)).toFixed(1)

  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {/* 90 % reference — green threshold */}
      <line x1="0" y1={yFor(90)} x2={W} y2={yFor(90)}
            stroke="rgba(34,197,94,.25)" strokeWidth="1" strokeDasharray="3,3" />
      {/* 40 % reference — debris threshold */}
      <line x1="0" y1={yFor(40)} x2={W} y2={yFor(40)}
            stroke="rgba(239,68,68,.25)" strokeWidth="1" strokeDasharray="3,3" />
      <polyline
        points={points}
        fill="none" stroke="#22c55e"
        strokeWidth="1.5" strokeLinejoin="round"
      />
    </svg>
  )
}
