// ─────────────────────────────────────────────────────────────────────────────
// mockEngine.js  —  Simulated GPS + Computer Vision data stream
//
// PURPOSE
//   Replaces the real Python backend during development / demo.
//   Produces the exact same JSON packet format that the Python API emits,
//   so swapping from mock → real is a one-line config change (see useHarvestData.js).
//
// PACKET FORMAT  (emitted every CFG.tickMs milliseconds)
//   {
//     potatoes : number   — % of intake that is potato (0–100)
//     rocks    : number   — % of intake that is rocks
//     sticks   : number   — % of intake that is sticks
//     lat      : number   — WGS-84 latitude  (decimal degrees)
//     lon      : number   — WGS-84 longitude (decimal degrees)
//     heading  : number   — bearing in degrees (0 = North, 90 = East)
//     rowIdx   : number   — current harvest row (0-based)
//     rowStep  : boolean  — true for the single tick where the tractor
//                           steps sideways to the next row; the frontend
//                           skips drawing a swath segment for this tick
//                           so you don't get a diagonal artifact
//     done     : boolean  — true on the final packet (field complete)
//   }
// ─────────────────────────────────────────────────────────────────────────────

/** Simulation parameters. Mirror these in backend/main.py for consistency. */
export const SIM_CFG = {
  startLat:    43.6210,   // Idaho potato country — used as field SW corner
  startLon:   -116.2050,
  rowLength:   220,       // metres along each harvest row
  rowSpacing:    4,       // metres between rows  (= swath width)
  maxRows:      40,       // total rows in this field
  speedMPS:      3.2,     // metres moved per tick  (tick = 500 ms → ~23 km/h)
  steerNoise:    1.5,     // max heading drift from true bearing (degrees, ±)
  tickMs:      500,       // milliseconds between packets
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD QUALITY MAP
//
// The field is modelled as a 9×8 quality grid (rows × progress-columns).
// Values are the BASE potato percentage (before noise) at that grid cell.
// Bilinear interpolation between cells gives smooth gradients.
//
// Column 0 = start of row (0 m), Column 7 = end of row (220 m)
// Row    0 = first harvest row,  Row    8 = last  harvest row (index 40)
//
// Reading the map left→right, top→bottom:
//   Bright-red zones  : bottom-left of cells 0–2 in early rows
//   Orange zones      : mid-left in rows 10–15
//   Yellow zones      : transitions
//   Green zones       : lower rows and right side of mid rows
//   Deep-green zones  : row-0 left corner, rows 32–40 everywhere
//
const QUALITY_GRID = [
//  0m   31m  63m  94m  125m 157m 188m 220m
  [ 95,   85,  20,  18,  15,  22,  28,  40 ], // row  0
  [ 88,   72,  22,  18,  20,  38,  52,  68 ], // row  5
  [ 70,   58,  45,  48,  52,  65,  72,  75 ], // row 10
  [ 38,   60,  78,  84,  88,  90,  87,  80 ], // row 15
  [ 30,   68,  85,  93,  91,  88,  82,  76 ], // row 20
  [ 52,   58,  62,  68,  70,  63,  55,  50 ], // row 25
  [ 74,   77,  80,  83,  80,  76,  78,  82 ], // row 30
  [ 82,   85,  88,  86,  87,  85,  88,  90 ], // row 35
  [ 86,   88,  90,  88,  86,  85,  87,  89 ], // row 40
]

/** Bilinear interpolation over QUALITY_GRID → base quality at (rowIdx, progressM) */
function gridQuality(rowIdx, progressM) {
  const R = QUALITY_GRID.length - 1   // 8 row intervals
  const C = QUALITY_GRID[0].length - 1 // 7 column intervals

  const rNorm = Math.min((rowIdx / SIM_CFG.maxRows) * R, R - 0.001)
  const pNorm = Math.min((progressM / SIM_CFG.rowLength) * C, C - 0.001)

  const r0 = Math.floor(rNorm), r1 = r0 + 1
  const p0 = Math.floor(pNorm), p1 = p0 + 1
  const rf = rNorm - r0, pf = pNorm - p0

  const q =
    QUALITY_GRID[r0][p0] * (1 - rf) * (1 - pf) +
    QUALITY_GRID[r0][p1] * (1 - rf) *      pf  +
    QUALITY_GRID[r1][p0] *      rf  * (1 - pf) +
    QUALITY_GRID[r1][p1] *      rf  *      pf

  return q
}

/** Generate a realistic CV data packet for the current field position */
function generateCV(rowIdx, progressM) {
  const base  = gridQuality(rowIdx, progressM)
  const noise = (Math.random() - 0.5) * 18   // ±9 % noise
  const potatoes = Math.max(10, Math.min(99, base + noise))

  const debris     = 100 - potatoes
  const rockShare  = 0.35 + Math.random() * 0.45  // rocks get 35–80 % of debris
  const rocks      = parseFloat((debris * rockShare).toFixed(1))
  const sticks     = parseFloat((debris * (1 - rockShare)).toFixed(1))

  return { potatoes: parseFloat(potatoes.toFixed(1)), rocks, sticks }
}

// ─────────────────────────────────────────────────────────────────────────────
// COORDINATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function latDegPerMetre()      { return 1 / 111_000 }
function lonDegPerMetre(lat)   { return 1 / (111_000 * Math.cos(lat * Math.PI / 180)) }

function offsetLatLon(lat, lon, headingDeg, distM) {
  const r   = headingDeg * Math.PI / 180
  return [
    lat + Math.cos(r) * latDegPerMetre() * distM,
    lon + Math.sin(r) * lonDegPerMetre(lat) * distM,
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createMockEngine(onPacket)
 *
 * Returns an engine object with .start() and .stop() methods.
 * Every SIM_CFG.tickMs milliseconds, onPacket is called with a fresh packet.
 *
 * onPacket  — function(packet: object) — receives each CV data packet
 */
export function createMockEngine(onPacket) {
  // ── mutable simulation state ──────────────────────────────────
  let lat         = SIM_CFG.startLat
  let lon         = SIM_CFG.startLon
  let heading     = 90              // start heading East
  let rowDir      = 1               // 1 = East, −1 = West
  let rowIdx      = 0
  let rowProgress = 0               // metres traveled in current row
  let driftAcc    = 0               // cumulative steering drift (degrees)
  let timer       = null

  function tick() {
    // ── Organic steering noise: bounded random walk ──────────────
    // Each tick, drift shifts by up to ±0.6°; clamped to ±steerNoise
    const nudge = (Math.random() - 0.5) * 0.8
    driftAcc    = Math.max(-SIM_CFG.steerNoise, Math.min(SIM_CFG.steerNoise, driftAcc + nudge))
    const baseH = rowDir === 1 ? 90 : 270
    heading     = baseH + driftAcc

    // ── Move the tractor ────────────────────────────────────────
    ;[lat, lon]   = offsetLatLon(lat, lon, heading, SIM_CFG.speedMPS)
    rowProgress  += SIM_CFG.speedMPS

    // ── Generate CV reading ─────────────────────────────────────
    const cv = generateCV(rowIdx, rowProgress)

    onPacket({
      ...cv,
      lat, lon,
      heading: parseFloat(heading.toFixed(2)),
      rowIdx,
      rowStep: false,
      done:    false,
    })

    // ── Row end: step North, flip direction ─────────────────────
    if (rowProgress >= SIM_CFG.rowLength) {
      rowIdx++
      rowProgress = 0
      driftAcc    = 0

      if (rowIdx >= SIM_CFG.maxRows) {
        // Field complete — send final packet then stop
        onPacket({ ...cv, lat, lon, heading, rowIdx, rowStep: false, done: true })
        clearInterval(timer)
        return
      }

      // Step North by rowSpacing (perpendicular to row direction)
      ;[lat, lon] = offsetLatLon(lat, lon, 0, SIM_CFG.rowSpacing)
      rowDir      = -rowDir

      // Emit a row-step packet so the frontend knows not to draw a swath segment
      onPacket({ ...cv, lat, lon, heading, rowIdx, rowStep: true, done: false })
    }
  }

  return {
    start() { timer = setInterval(tick, SIM_CFG.tickMs) },
    stop()  { clearInterval(timer) },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HOW THE MOCK DATA WORKS  —  quick reference
// ─────────────────────────────────────────────────────────────────────────────
//
//  1. LAWNMOWER PATTERN
//     The tractor starts at (startLat, startLon) heading East (90°).
//     After travelling rowLength metres it shifts North by rowSpacing metres,
//     then heads West (270°). It alternates East/West for maxRows rows.
//
//  2. STEERING NOISE
//     `driftAcc` is a running random walk clamped to ±steerNoise degrees.
//     Each tick adds a random nudge of ±0.4°, so the path meanders gently
//     instead of being a perfectly straight line.
//
//  3. FIELD QUALITY (QUALITY_GRID)
//     The 9×8 grid maps normalised (row, progress) → base potato %.
//     Bilinear interpolation gives smooth gradients between grid cells.
//     ±9% Gaussian noise is added each tick so adjacent readings vary.
//     This creates the colour patchwork visible on the heatmap:
//       • Deep-red cells  : rows 0–5, mid-field  (rocks & debris, ~15–25%)
//       • Orange cells    : rows 12–16, left side  (~30–40%)
//       • Yellow cells    : transition zones        (~50–65%)
//       • Green cells     : lower rows, right side  (~80–93%)
//       • Deep-green cells: row-0 left corner, rows 35–40 (~88–95%)
//
//  4. CV PACKET
//     potatoes + rocks + sticks always sum to 100 %.
//     The debris split (rocks vs sticks) is random each tick.
//
//  5. SWAPPING IN THE REAL BACKEND
//     - Set  DATA_SOURCE = 'backend'  in src/App.jsx
//     - Start the Python FastAPI server  (cd backend && uvicorn main:app)
//     - The frontend will open a WebSocket to ws://localhost:8000/ws/harvest
//       and send { action: 'start' } / { action: 'stop' } control messages.
//     - The Python server emits the exact same packet format defined above.
//     - No other frontend code needs to change.
// ─────────────────────────────────────────────────────────────────────────────
