/**
 * components/Map/CanvasLayer.jsx
 *
 * Renders the persistent swath trail and tractor icon onto an HTML5 Canvas
 * that sits on top of the Leaflet tile layer.
 *
 * Design notes
 * ─────────────
 * • Must be a child of <MapContainer> so useMap() can access the Leaflet instance.
 * • The canvas is created imperatively and appended to the map container element.
 * • Refs (segRef, tractorRef) keep the closure stable across renders, so we only
 *   attach/detach Leaflet event listeners once — not on every data update.
 * • redrawRef.current() is called from a second useEffect whenever props change.
 */

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

// ── Tractor icon ──────────────────────────────────────────────────────────────

function drawTractorIcon(ctx, x, y, headingDeg) {
  ctx.save()
  ctx.translate(x, y)
  // Leaflet: 0° = North, 90° = East. Canvas rotate: 0° = right (+x axis).
  ctx.rotate((headingDeg - 90) * Math.PI / 180)

  ctx.fillStyle = '#f59e0b'                         // body
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(-13, -7, 26, 14, 3)
  else               ctx.rect(-13, -7, 26, 14)
  ctx.fill()

  ctx.fillStyle = '#d97706'                         // cab
  ctx.fillRect(-3, -12, 10, 8)

  ctx.fillStyle = '#fef3c7'                         // headlights
  ctx.fillRect(12, -5, 3, 3)
  ctx.fillRect(12, 2, 3, 3)

  ctx.fillStyle = 'rgba(255,255,255,0.9)'           // direction arrow
  ctx.beginPath()
  ctx.moveTo(18, 0)
  ctx.lineTo(12, -4)
  ctx.lineTo(12, 4)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CanvasLayer({ segments, tractor }) {
  const map       = useMap()
  const segRef    = useRef(segments)
  const tractRef  = useRef(tractor)
  const redrawRef = useRef(null)

  // Keep refs current without re-triggering the setup effect
  segRef.current   = segments
  tractRef.current = tractor

  // One-time setup: create canvas and attach Leaflet listeners
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

      for (const seg of segRef.current) {
        const pts = seg.quad.map(([lat, lon]) => map.latLngToContainerPoint([lat, lon]))
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.closePath()
        ctx.fillStyle = seg.color
        ctx.fill()
      }

      const t = tractRef.current
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

  // Trigger a redraw whenever segments or tractor position updates
  useEffect(() => { redrawRef.current?.() }, [segments, tractor])

  return null
}
