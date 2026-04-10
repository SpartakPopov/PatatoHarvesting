/**
 * components/Sidebar/DebrisBars.jsx
 *
 * Horizontal bar chart showing the rocks / sticks breakdown
 * of the current CV reading.
 */

function Bar({ label, value, color }) {
  return (
    <div className="bar-row">
      <span className="bar-name">{label}</span>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{ width: `${value ?? 0}%`, background: color }}
        />
      </div>
      <span className="bar-num">
        {value != null ? value.toFixed(1) : '0.0'}%
      </span>
    </div>
  )
}

export default function DebrisBars({ rocks, sticks }) {
  return (
    <>
      <Bar label="Rocks"  value={rocks}  color="var(--red)"    />
      <Bar label="Sticks" value={sticks} color="var(--orange)" />
    </>
  )
}
