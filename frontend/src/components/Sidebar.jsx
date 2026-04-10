// Arc length of the gauge semicircle: π × radius (78) ≈ 245
const ARC_LEN = 245

function GaugeNeedle({ pct }) {
  // Semicircle spans 180° → 0° (East). At pct=0: left tip; pct=100: right tip.
  // angle in radians: π × (1 − pct/100)
  const angle = Math.PI * (1 - (pct ?? 0) / 100)
  const nx = (100 + Math.cos(angle) * 60).toFixed(1)
  const ny = (100 - Math.sin(angle) * 60).toFixed(1) // SVG y-axis is inverted
  return (
    <line
      id="gauge-needle"
      x1="100" y1="100"
      x2={nx}  y2={ny}
      stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.85"
    />
  )
}

function Gauge({ pct }) {
  const safeP = pct ?? 0
  const offset = (ARC_LEN * (1 - safeP / 100)).toFixed(1)

  // Colour the arc tip to match the heatmap
  let arcColor = '#22c55e'
  if (safeP < 40)  arcColor = '#ef4444'
  else if (safeP < 60) arcColor = '#f97316'
  else if (safeP < 80) arcColor = '#eab308'

  return (
    <div className="gauge-wrap">
      <svg width="200" height="115" viewBox="0 0 200 115" className="gauge-svg">
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
              strokeDasharray={ARC_LEN}
              strokeDashoffset={offset} />

        <GaugeNeedle pct={safeP} />
        <circle cx="100" cy="100" r="5" fill="white" opacity="0.85" />

        {/* Scale labels */}
        <text x="18"  y="113" fontSize="9" fill="#6b7a99" textAnchor="middle">0</text>
        <text x="100" y="22"  fontSize="9" fill="#6b7a99" textAnchor="middle">50</text>
        <text x="182" y="113" fontSize="9" fill="#6b7a99" textAnchor="middle">100</text>
      </svg>

      <div className="gauge-center">
        <span className="gauge-big" style={{ color: arcColor }}>
          {pct != null ? pct.toFixed(1) : '--'}
        </span>
        <span className="gauge-unit">% potato</span>
      </div>
    </div>
  )
}

function Bar({ label, value, color }) {
  return (
    <div className="bar-row">
      <span className="bar-name">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${value ?? 0}%`, background: color }} />
      </div>
      <span className="bar-num">{value != null ? value.toFixed(1) : '0.0'}%</span>
    </div>
  )
}

function StatCard({ label, value, unit }) {
  return (
    <div className="stat-card">
      <div className="stat-lbl">{label}</div>
      <div className="stat-val">{value}</div>
      <div className="stat-unit">{unit}</div>
    </div>
  )
}

function Sparkline({ data }) {
  if (data.length < 2) return <svg className="sparkline" viewBox="0 0 264 48" />

  const W = 264, H = 48, pad = 3
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2)
    const y = H - pad - (v / 100) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg className="sparkline" viewBox="0 0 264 48" preserveAspectRatio="none">
      {/* 90% reference line (green threshold) */}
      <line x1="0" y1="7.7" x2="264" y2="7.7"
            stroke="rgba(34,197,94,.25)" strokeWidth="1" strokeDasharray="3,3" />
      {/* 40% reference line (debris threshold) */}
      <line x1="0" y1="38.3" x2="264" y2="38.3"
            stroke="rgba(239,68,68,.25)" strokeWidth="1" strokeDasharray="3,3" />
      <polyline points={points} fill="none" stroke="#22c55e"
                strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function StatusDot({ status }) {
  const color = status === 'running' ? '#22c55e' : status === 'stopped' ? '#f59e0b' : '#6b7a99'
  return <span className="status-dot" style={{ background: color,
    animation: status === 'running' ? 'blink 1.6s ease-in-out infinite' : 'none' }} />
}

export default function Sidebar({ cvPacket, stats, sparkHistory, status, onStart, onStop, onReset }) {
  const avg = stats.ticks > 0 ? (stats.qualitySum / stats.ticks).toFixed(1) : '--'

  const statusLabel =
    status === 'running' ? 'Simulation running — Field A-7' :
    status === 'stopped' ? 'Harvest complete — Field A-7'   :
                           'Idle — press Start to begin'

  return (
    <aside className="sidebar">

      {/* Header */}
      <div className="sb-header">
        <h1 className="sb-title">Harvest Dashboard</h1>
        <p className="sb-sub">
          <StatusDot status={status} />
          {statusLabel}
        </p>
      </div>

      {/* Gauge */}
      <section className="sb-section">
        <p className="section-label">Current Yield Quality</p>
        <Gauge pct={cvPacket?.potatoes ?? null} />
      </section>

      {/* Debris bars */}
      <section className="sb-section">
        <p className="section-label">Debris Breakdown</p>
        <Bar label="Rocks"  value={cvPacket?.rocks}  color="var(--red)"    />
        <Bar label="Sticks" value={cvPacket?.sticks} color="var(--orange)" />
      </section>

      {/* Stats grid */}
      <section className="sb-section">
        <p className="section-label">Session Statistics</p>
        <div className="stat-grid">
          <StatCard label="Area Covered" value={Math.round(stats.area).toLocaleString()} unit="m²" />
          <StatCard label="Rows Done"    value={stats.rows}  unit={`/ ${40}`} />
          <StatCard label="Avg Quality"  value={avg}          unit="%"        />
          <StatCard label="Swath Segs"   value={stats.ticks}  unit="total"    />
        </div>
      </section>

      {/* GPS readout */}
      <section className="sb-section">
        <p className="section-label">GPS &amp; Navigation</p>
        <div className="gps-grid">
          <span className="gps-key">Latitude</span>
          <span className="gps-val">{cvPacket ? cvPacket.lat.toFixed(6) : '--'}</span>
          <span className="gps-key">Longitude</span>
          <span className="gps-val">{cvPacket ? cvPacket.lon.toFixed(6) : '--'}</span>
          <span className="gps-key">Heading</span>
          <span className="gps-val">{cvPacket ? cvPacket.heading.toFixed(1) + '°' : '--'}</span>
          <span className="gps-key">Row</span>
          <span className="gps-val">{cvPacket ? `${cvPacket.rowIdx + 1} / 40` : '--'}</span>
        </div>
      </section>

      {/* Sparkline */}
      <section className="sb-section">
        <p className="section-label">Yield History (last 60 readings)</p>
        <Sparkline data={sparkHistory} />
      </section>

      {/* Controls */}
      <div className="sb-controls">
        <button
          className="btn btn-start"
          onClick={onStart}
          disabled={status === 'running'}
        >
          ▶ Start
        </button>
        <button
          className="btn btn-stop"
          onClick={onStop}
          disabled={status !== 'running'}
        >
          ■ End
        </button>
        <button className="btn btn-reset" onClick={onReset}>
          ↺ Reset
        </button>
      </div>

    </aside>
  )
}
