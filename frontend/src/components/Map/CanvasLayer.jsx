/**
 * components/Map/CanvasLayer.jsx
 *
 * Renders the persistent swath trail and tractor icon onto an HTML5 Canvas
 * that sits on top of the Leaflet tile layer.
 *
 * Tractor images
 * ──────────────
 * Four top-down PNGs are preloaded at module level (no flickering mid-session):
 *   tractor-right.png — base image, facing East  (heading ~90°)
 *   tractor-left.png  — facing West  (heading ~270°)
 *   tractor-up.png    — facing North (heading ~0°/360°)
 *   tractor-down.png  — facing South (heading ~180°)
 *
 * The image closest to the current heading is selected, then a small canvas
 * rotation is applied for the angular difference, so the tractor visually
 * steers with the path in any direction.
 *
 * Display size: adapts to each image's source aspect ratio.
 * Centred on the GPS coordinate so it sits squarely on the trail.
 */

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

import tractorRightSrc from '../../assets/tractor-right.png'
import tractorLeftSrc  from '../../assets/tractor-left.png'
import tractorUpSrc    from '../../assets/tractor-up.png'
import tractorDownSrc  from '../../assets/tractor-down.png'

// ── Preload images at module level (once per app lifetime) ────────────────────
const IMG_RIGHT = new Image()
const IMG_LEFT  = new Image()
const IMG_UP    = new Image()
const IMG_DOWN  = new Image()
IMG_RIGHT.src = tractorRightSrc
IMG_LEFT.src  = tractorLeftSrc
IMG_UP.src    = tractorUpSrc
IMG_DOWN.src  = tractorDownSrc

// Display dimensions for horizontal images (right / left)
// Maintain ~2.08:1 aspect ratio from 721 × 346 source
const H_W = 80
const H_H = Math.round(H_W / (721 / 346)) // ≈ 38 px

// Display dimensions for vertical images (up / down)
// Maintain ~1:2.08 aspect ratio (inverted)
const V_W = 38
const V_H = 80

// ── Direction quadrants ───────────────────────────────────────────────────────
//
// heading 0°/360° = North, 90° = East, 180° = South, 270° = West
//
// We pick the image whose cardinal direction is closest to the heading,
// then apply a small canvas rotation for the remaining angular difference.
//
//   North (Up)   :  315° – 45°     → base angle  0°
//   East  (Right):   45° – 135°    → base angle 90°
//   South (Down) :  135° – 225°    → base angle 180°
//   West  (Left) :  225° – 315°    → base angle 270°

function selectTractor(headingDeg) {
  const h = ((headingDeg % 360) + 360) % 360

  if (h >= 315 || h < 45)   return { img: IMG_UP,    w: V_W, h: V_H, base: 0   }
  if (h >= 45  && h < 135)  return { img: IMG_RIGHT, w: H_W, h: H_H, base: 90  }
  if (h >= 135 && h < 225)  return { img: IMG_DOWN,  w: V_W, h: V_H, base: 180 }
  /*                  */     return { img: IMG_LEFT,  w: H_W, h: H_H, base: 270 }
}

// ── Tractor draw helper ───────────────────────────────────────────────────────

function drawTractor(ctx, x, y, headingDeg) {
  const { img, w, h, base } = selectTractor(headingDeg)

  // Skip if the image hasn't loaded yet (first few ms of app)
  if (!img.complete || img.naturalWidth === 0) return

  // Small drift rotation: difference between actual heading and base cardinal
  let drift = headingDeg - base
  // Normalise to [-180, 180]
  if (drift > 180)  drift -= 360
  if (drift < -180) drift += 360
  const driftRad = drift * Math.PI / 180

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(driftRad) // apply only the small drift (≤ ±45°)
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
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
    IMG_UP.onload    = redraw
    IMG_DOWN.onload  = redraw

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
