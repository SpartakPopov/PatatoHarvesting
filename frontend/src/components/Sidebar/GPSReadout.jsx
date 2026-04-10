/**
 * components/Sidebar/GPSReadout.jsx
 *
 * Live GPS coordinates, heading, and row progress.
 */

function Row({ label, value }) {
  return (
    <>
      <span className="gps-key">{label}</span>
      <span className="gps-val">{value}</span>
    </>
  )
}

export default function GPSReadout({ cvPacket }) {
  const p = cvPacket

  return (
    <div className="gps-grid">
      <Row label="Latitude"  value={p ? p.lat.toFixed(6)     : '--'} />
      <Row label="Longitude" value={p ? p.lon.toFixed(6)     : '--'} />
      <Row label="Heading"   value={p ? p.heading.toFixed(1) + '°' : '--'} />
      <Row label="Row"       value={p ? `${p.rowIdx + 1} / 40`     : '--'} />
    </div>
  )
}
