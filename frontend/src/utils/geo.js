// ── Coordinate helpers ────────────────────────────────────────────────────────

function latDegPerMetre()    { return 1 / 111_000 }
function lonDegPerMetre(lat) { return 1 / (111_000 * Math.cos(lat * Math.PI / 180)) }

/**
 * Given two GPS positions (A → B) and a swath width in metres,
 * return the four corners of the 4 m-wide bounding quad.
 * Corner order: [AL, AR, BR, BL]  (left/right relative to travel direction)
 */
export function swathQuad(latA, lonA, latB, lonB, widthM) {
  const dLat = latB - latA
  const dLon = lonB - lonA
  const len  = Math.hypot(dLat, dLon)
  if (len < 1e-12) return null

  // Perpendicular unit vector in degree-space (works for small distances)
  const pLat = -dLon / len
  const pLon =  dLat / len

  const half   = widthM / 2
  const midLat = (latA + latB) / 2
  const hLat   = pLat * latDegPerMetre()    * half
  const hLon   = pLon * lonDegPerMetre(midLat) * half

  return [
    [latA - hLat, lonA - hLon], // AL
    [latA + hLat, lonA + hLon], // AR
    [latB + hLat, lonB + hLon], // BR
    [latB - hLat, lonB - hLon], // BL
  ]
}

// ── Colour mapping ────────────────────────────────────────────────────────────

function lerp(a, b, t) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)))
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function lerpColor(hexA, hexB, t) {
  const [ar, ag, ab] = hexToRgb(hexA)
  const [br, bg, bb] = hexToRgb(hexB)
  return `rgba(${lerp(ar,br,t)},${lerp(ag,bg,t)},${lerp(ab,bb,t)},0.85)`
}

/**
 * Map potato percentage (0–100) to a fill colour.
 *   ≥ 90  →  dark green → bright green
 *   60–90 →  yellow     → bright green
 *   40–60 →  orange     → yellow
 *   < 40  →  deep red   → orange
 */
export function yieldColor(pct) {
  if (pct >= 90) return lerpColor('#166534', '#22c55e', (pct - 90) / 10)
  if (pct >= 60) return lerpColor('#ca8a04', '#22c55e', (pct - 60) / 30)
  if (pct >= 40) return lerpColor('#f97316', '#ca8a04', (pct - 40) / 20)
  return lerpColor('#991b1b', '#f97316', pct / 40)
}
