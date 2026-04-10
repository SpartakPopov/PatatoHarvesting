/**
 * services/mockEngine.js
 *
 * Simulated GPS + Computer Vision data stream.
 * Produces the exact same JSON packet format as the Python backend,
 * so swapping mock → real is a one-line config change in App.jsx.
 *
 * Packet schema
 * ─────────────
 * {
 *   potatoes : number   — % of intake classified as potato   (0–100)
 *   rocks    : number   — % rocks
 *   sticks   : number   — % sticks
 *   lat      : number   — WGS-84 latitude
 *   lon      : number   — WGS-84 longitude
 *   heading  : number   — bearing in degrees (0 = North, 90 = East)
 *   rowIdx   : number   — current harvest row, 0-based
 *   rowStep  : boolean  — true for the lateral step between rows;
 *                         App skips drawing a swath segment for this tick
 *   done     : boolean  — true on the very last packet
 * }
 */

import { SIM_CFG } from '../config/simulation'

// ── Field quality grid ────────────────────────────────────────────────────────
//
// 9 × 8 table of base potato-% values that covers the field.
// Rows 0–8 map to harvest rows 0–40; columns 0–7 map to progress 0–220 m.
// Bilinear interpolation gives smooth colour gradients between cells.
//
// Cell values deliberately span the full colour range:
//   ~15–25 %  → deep red    (rocky strips)
//   ~35–55 %  → orange/red  (debris zones)
//   ~60–75 %  → yellow      (mixed quality)
//   ~80–93 %  → green       (good yield)
//
const QUALITY_GRID = [
//  0m   31m  63m  94m 125m 157m 188m 220m
  [ 95,  85,  20,  18,  15,  22,  28,  40 ], // row  0
  [ 88,  72,  22,  18,  20,  38,  52,  68 ], // row  5
  [ 70,  58,  45,  48,  52,  65,  72,  75 ], // row 10
  [ 38,  60,  78,  84,  88,  90,  87,  80 ], // row 15
  [ 30,  68,  85,  93,  91,  88,  82,  76 ], // row 20
  [ 52,  58,  62,  68,  70,  63,  55,  50 ], // row 25
  [ 74,  77,  80,  83,  80,  76,  78,  82 ], // row 30
  [ 82,  85,  88,  86,  87,  85,  88,  90 ], // row 35
  [ 86,  88,  90,  88,  86,  85,  87,  89 ], // row 40
]

/** Bilinear interpolation over QUALITY_GRID → base potato % */
function gridQuality(rowIdx, progressM) {
  const R = QUALITY_GRID.length - 1
  const C = QUALITY_GRID[0].length - 1
  const rn = Math.min((rowIdx / SIM_CFG.maxRows) * R, R - 0.001)
  const pn = Math.min((progressM / SIM_CFG.rowLength) * C, C - 0.001)
  const r0 = Math.floor(rn), r1 = r0 + 1
  const p0 = Math.floor(pn), p1 = p0 + 1
  const rf = rn - r0, pf = pn - p0
  return (
    QUALITY_GRID[r0][p0] * (1 - rf) * (1 - pf) +
    QUALITY_GRID[r0][p1] * (1 - rf) *      pf  +
    QUALITY_GRID[r1][p0] *      rf  * (1 - pf) +
    QUALITY_GRID[r1][p1] *      rf  *      pf
  )
}

/** Build a CV data reading at the current field position */
function generateCV(rowIdx, progressM) {
  const base     = gridQuality(rowIdx, progressM)
  const potatoes = Math.max(10, Math.min(99, base + (Math.random() - 0.5) * 18))
  const debris   = 100 - potatoes
  const rockShare = 0.35 + Math.random() * 0.45
  return {
    potatoes: parseFloat(potatoes.toFixed(1)),
    rocks:    parseFloat((debris * rockShare).toFixed(1)),
    sticks:   parseFloat((debris * (1 - rockShare)).toFixed(1)),
  }
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

function latDegPerMetre()    { return 1 / 111_000 }
function lonDegPerMetre(lat) { return 1 / (111_000 * Math.cos(lat * Math.PI / 180)) }

function offsetLatLon(lat, lon, headingDeg, distM) {
  const r = headingDeg * Math.PI / 180
  return [
    lat + Math.cos(r) * latDegPerMetre() * distM,
    lon + Math.sin(r) * lonDegPerMetre(lat) * distM,
  ]
}

// ── Engine factory ────────────────────────────────────────────────────────────

/**
 * createMockEngine(onPacket)
 *
 * Returns { start(), stop() }.
 * Calls onPacket with a fresh CV + GPS packet every SIM_CFG.tickMs ms.
 */
export function createMockEngine(onPacket) {
  let lat         = SIM_CFG.startLat
  let lon         = SIM_CFG.startLon
  let heading     = 90              // start heading East
  let rowDir      = 1               // 1 = East, −1 = West
  let rowIdx      = 0
  let rowProgress = 0               // metres into current row
  let driftAcc    = 0               // cumulative steering drift (degrees)
  let timer       = null

  function tick() {
    // Organic steering: bounded random walk
    driftAcc = Math.max(
      -SIM_CFG.steerNoise,
      Math.min(SIM_CFG.steerNoise, driftAcc + (Math.random() - 0.5) * 0.8),
    )
    heading = (rowDir === 1 ? 90 : 270) + driftAcc

    // Move
    ;[lat, lon]   = offsetLatLon(lat, lon, heading, SIM_CFG.speedMPS)
    rowProgress  += SIM_CFG.speedMPS

    const cv = generateCV(rowIdx, rowProgress)
    onPacket({ ...cv, lat, lon, heading: parseFloat(heading.toFixed(2)), rowIdx, rowStep: false, done: false })

    // End of row?
    if (rowProgress >= SIM_CFG.rowLength) {
      rowIdx++
      rowProgress = 0
      driftAcc    = 0

      if (rowIdx >= SIM_CFG.maxRows) {
        onPacket({ ...cv, lat, lon, heading, rowIdx, rowStep: false, done: true })
        clearInterval(timer)
        return
      }

      // Step north to the next row
      ;[lat, lon] = offsetLatLon(lat, lon, 0, SIM_CFG.rowSpacing)
      rowDir      = -rowDir
      onPacket({ ...cv, lat, lon, heading, rowIdx, rowStep: true, done: false })
    }
  }

  return {
    start() { timer = setInterval(tick, SIM_CFG.tickMs) },
    stop()  { clearInterval(timer) },
  }
}
