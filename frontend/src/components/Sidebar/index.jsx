/**
 * components/Sidebar/index.jsx
 *
 * Assembles all sidebar sub-components into the panel layout.
 * Also owns the StatusDot and the Start / End / Reset control buttons.
 */

import Gauge       from './Gauge'
import DebrisBars  from './DebrisBars'
import StatGrid    from './StatGrid'
import GPSReadout  from './GPSReadout'
import Sparkline   from './Sparkline'

function StatusDot({ status }) {
  const color =
    status === 'running' ? '#22c55e' :
    status === 'stopped' ? '#f59e0b' : '#6b7a99'

  return (
    <span
      className="status-dot"
      style={{
        background: color,
        animation: status === 'running' ? 'blink 1.6s ease-in-out infinite' : 'none',
      }}
    />
  )
}

export default function Sidebar({
  cvPacket,
  stats,
  sparkHistory,
  status,
  onStart,
  onStop,
  onSkip,
  onReset,
  onClose,
}) {
  const statusLabel =
    status === 'running' ? 'Running — Field A-7'  :
    status === 'stopped' ? 'Complete — Field A-7' :
                           'Idle — press Start'

  return (
    <aside className="sidebar">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="sb-header">
        <div className="sb-header-row">
          <h1 className="sb-title">Harvest Dashboard</h1>
          <button className="sb-close" onClick={onClose} aria-label="Close panel">✕</button>
        </div>
        <p className="sb-sub">
          <StatusDot status={status} />
          {statusLabel}
        </p>
      </div>

      {/* ── Yield gauge ─────────────────────────────────────────── */}
      <section className="sb-section">
        <p className="section-label">Current Yield Quality</p>
        <Gauge pct={cvPacket?.potatoes ?? null} />
      </section>

      {/* ── Debris breakdown ────────────────────────────────────── */}
      <section className="sb-section">
        <p className="section-label">Debris Breakdown</p>
        <DebrisBars rocks={cvPacket?.rocks} sticks={cvPacket?.sticks} />
      </section>

      {/* ── Session statistics ───────────────────────────────────── */}
      <section className="sb-section">
        <p className="section-label">Session Statistics</p>
        <StatGrid stats={stats} />
      </section>

      {/* ── GPS & navigation ─────────────────────────────────────── */}
      <section className="sb-section">
        <p className="section-label">GPS &amp; Navigation</p>
        <GPSReadout cvPacket={cvPacket} />
      </section>

      {/* ── Yield history sparkline ──────────────────────────────── */}
      <section className="sb-section spark-section">
        <p className="section-label">Yield History (last 60 readings)</p>
        <Sparkline data={sparkHistory} />
      </section>

      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="sb-controls">
        <div className="btn-row" style={{ display: 'flex', gap: '7px', marginBottom: '7px' }}>
          <button
            className="btn btn-start"
            onClick={onStart}
            disabled={status === 'running'}
            style={{ flex: 1 }}
          >
            ▶ Start
          </button>
          <button
            className="btn btn-skip"
            onClick={onSkip}
            disabled={status !== 'running'}
            style={{ flex: 1, color: 'var(--accent)', borderColor: '#1a2a3d' }}
          >
            ⏭ Skip
          </button>
        </div>
        <button
          className="btn btn-stop"
          onClick={onStop}
          disabled={status !== 'running'}
          style={{ marginBottom: '7px' }}
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
