/**
 * components/Sidebar/StatGrid.jsx
 *
 * 2×2 grid of summary stat cards for the current harvest session.
 */

function StatCard({ label, value, unit }) {
  return (
    <div className="stat-card">
      <div className="stat-lbl">{label}</div>
      <div className="stat-val">{value}</div>
      <div className="stat-unit">{unit}</div>
    </div>
  )
}

export default function StatGrid({ stats }) {
  const avg = stats.ticks > 0
    ? (stats.qualitySum / stats.ticks).toFixed(1)
    : '--'

  return (
    <div className="stat-grid">
      <StatCard
        label="Area Covered"
        value={Math.round(stats.area).toLocaleString()}
        unit="m²"
      />
      <StatCard
        label="Avg Quality"
        value={avg}
        unit="%"
      />
      <StatCard
        label="Swath Segs"
        value={stats.ticks}
        unit="total"
      />
    </div>
  )
}
