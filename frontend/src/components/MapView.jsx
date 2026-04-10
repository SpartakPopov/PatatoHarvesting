import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { SIM_CFG } from '../simulation/mockEngine'

// ── Tractor icon drawn on canvas ──────────────────────────────────────────────
function drawTractorIcon(ctx, x, y, headingDeg) {
  ctx.save()
  ctx.translate(x, y)
  // Leaflet heading: 0°=N, 90°=E. Canvas rotate: 0°=right (+x).
  ctx.rotate((headingDeg - 90) * Math.PI / 180)

  // Body
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(-13, -7, 26, 14, 3)
  else               ctx.rect(-13, -7, 26, 14)
  ctx.fill()

  // Cab
  ctx.fillStyle = '#d97706'
  ctx.fillRect(-3, -12, 10, 8)

  // Headlights
  ctx.fillStyle = '#fef3c7'
  ctx.fillRect(12, -5, 3, 3)
  ctx.fillRect(12, 2, 3, 3)

  // Direction arrow
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.moveTo(18, 0)
  ctx.lineTo(12, -4)
  ctx.lineTo(12, 4)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

// ── Canvas overlay — lives inside MapContainer so useMap() works ──────────────
function CanvasLayer({ segments, tractor }) {
  const map        = useMap()
  const segRef     = useRef(segments)
  const tractorRef = useRef(tractor)
  const redrawRef  = useRef(null)

  // Keep refs current without re-running the setup effect
  segRef.current     = segments
  tractorRef.current = tractor

  // Set up canvas once when the map is ready
  useEffect(() => {
    const container = map.getContainer()
    const canvas    = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:401;'
    container.appendChild(canvas)
    const ctx = canvas.getContext('2d')

    function redraw() {
      canvas.width  = container.clientWidth
      canvas.height = container.clientHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw all swath segments
      for (const seg of segRef.current) {
        const pts = seg.quad.map(([lat, lon]) => map.latLngToContainerPoint([lat, lon]))
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.closePath()
        ctx.fillStyle = seg.color
        ctx.fill()
      }

      // Draw tractor on top
      const t = tractorRef.current
      if (t) {
        const p = map.latLngToContainerPoint([t.lat, t.lon])
        drawTractorIcon(ctx, p.x, p.y, t.heading)
      }
    }

    redrawRef.current = redraw
    map.on('move zoom viewreset resize', redraw)
    window.addEventListener('resize', redraw)

    return () => {
      map.off('move zoom viewreset resize', redraw)
      window.removeEventListener('resize', redraw)
      canvas.remove()
    }
  }, [map])

  // Trigger a redraw whenever data changes
  useEffect(() => {
    redrawRef.current?.()
  }, [segments, tractor])

  return null
}

// ── Public component ──────────────────────────────────────────────────────────
export default function MapView({ segments, tractor }) {
  return (
    <MapContainer
      center={[SIM_CFG.startLat, SIM_CFG.startLon]}
      zoom={18}
      className="map"
      zoomControl
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Imagery © Esri"
        maxZoom={20}
      />
      <CanvasLayer segments={segments} tractor={tractor} />
    </MapContainer>
  )
}
