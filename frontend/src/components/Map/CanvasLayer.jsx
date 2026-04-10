/**
 * components/Map/CanvasLayer.jsx
 *
 * Renders the persistent swath trail and tractor icon onto an HTML5 Canvas
 * that sits on top of the Leaflet tile layer.
 *
 * Tractor images
 * ──────────────
 * Two top-down PNGs are preloaded at module level (no flickering mid-session):
 *   tractor-right.png  — used when heading is roughly East  (315° – 135°)
 *   tractor-left.png   — used when heading is roughly West  (135° – 315°)
 *
 * A small canvas rotation equal to the heading drift (±1.5°) is applied on
 * top of the base image so the tractor visually steers with the path.
 *
 * Display size: 80 × 38 px  (maintains the 721:346 source aspect ratio).
 * Centred on the GPS coordinate so it sits squarely on the trail.
 */

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

import tractorRightSrc from '../../assets/tractor-right.png'
import tractorLeftSrc  from '../../assets/tractor-left.png'

// ── Preload images at module level (once per app lifetime) ────────────────────
const IMG_RIGHT = new Image()
const IMG_LEFT  = new Image()
IMG_RIGHT.src = tractorRightSrc
IMG_LEFT.src  = tractorLeftSrc

// Display dimensions — keep 721:346 ≈ 2.08:1 aspect ratio
const TRACTOR_W = 80
const TRACTOR_H = Math.round(TRACTOR_W / (721 / 346)) // ≈ 38 px

// ── Tractor draw helper ───────────────────────────────────────────────────────

function drawTractor(ctx, x, y, headingDeg) {
  // Pick image: right-facing for East (0°–180°), left-facing for West (180°–360°)
  const goingEast = headingDeg >= 0 && headingDeg < 180
  const img       = goingEast ? IMG_RIGHT : IMG_LEFT

  // Skip if the image hasn't loaded yet (first few ms of app)
  if (!img.complete || img.naturalWidth === 0) return

  // Drift offset from the base cardinal heading (East = 90°, West = 270°)
  const baseHeading = goingEast ? 90 : 270
  const driftRad    = (headingDeg - baseHeading) * Math.PI / 180

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(driftRad)                              // apply only the ±1.5° drift
  ctx.drawImage(img, -TRACTOR_W / 2, -TRACTOR_H / 2, TRACTOR_W, TRACTOR_H)
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

  // One-time setup: create canvas and attach Leaflet event listeners
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

      // Draw tractor on top of the trail
      const t = tractRef.current
      if (t) {
        const p = map.latLngToContainerPoint([t.lat, t.lon])
        drawTractor(ctx, p.x, p.y, t.heading)
      }
    }

    // Re-draw when images finish loading (in case they weren't ready on first tick)
    IMG_RIGHT.onload = redraw
    IMG_LEFT.onload  = redraw

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
