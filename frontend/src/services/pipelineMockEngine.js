/**
 * services/pipelineMockEngine.js
 *
 * Plays back pre-generated pipeline data files instead of the
 * procedural JS mock engine.
 *
 * Data comes from pipeline/mock_model_output.json and
 * pipeline/dashboard_stats.csv, copied into public/pipeline/
 * so Vite can serve them as static assets.
 *
 * Each "tick" emits a packet matching the schema the rest of the
 * frontend already expects:
 *
 * {
 *   potatoes : number   — % of intake classified as potato     (0–100)
 *   rocks    : number   — % rocks  (clods + stones in pipeline terms)
 *   sticks   : number   — % sticks (re-mapped from "damaged" class)
 *   lat      : number   — WGS-84 latitude
 *   lon      : number   — WGS-84 longitude
 *   heading  : number   — bearing in degrees (computed from GPS delta)
 *   rowIdx   : number   — current harvest row, 0-based
 *   rowStep  : boolean  — true for the lateral step between rows
 *   done     : boolean  — true on the very last packet
 *
 *   // Extra fields from the pipeline (available but optional):
 *   damageRatio        : number
 *   rollingDamagePct   : number
 *   alertTriggered     : boolean
 * }
 */

import { SIM_CFG } from '../config/simulation'

// ── CSV parser (lightweight, no dependency) ──────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  const headers = lines[0].split(',')
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',')
    const obj = {}
    headers.forEach((h, i) => {
      obj[h.trim()] = vals[i]?.trim() ?? ''
    })
    return obj
  })
}

// ── Bearing computation ──────────────────────────────────────────────────────

function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180)
  const x =
    Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

// ── Merge CSV stats row with model-output frame into a unified packet ────────

function buildPacket(csvRow, modelFrame, prevPos, frameIdx, totalFrames) {
  // Counts from the model-output detections
  const dets = modelFrame?.detections ?? []
  const total = dets.length || 1
  const potatoGood    = dets.filter(d => d.class === 'potato_good').length
  const potatoDamaged = dets.filter(d => d.class === 'potato_damaged').length
  const clod          = dets.filter(d => d.class === 'clod').length
  const stone         = dets.filter(d => d.class === 'stone').length
  const stick         = dets.filter(d => d.class === 'stick').length

  // The "potatoes" percentage includes all potatoes (good + damaged)
  const potatoPct     = ((potatoGood + potatoDamaged) / total) * 100
  const rocksPct      = ((clod + stone) / total) * 100
  const sticksPct     = (stick / total) * 100

  const lat = parseFloat(csvRow.lat)
  const lon = parseFloat(csvRow.lon)

  // Heading: compute from previous position, or default East
  let heading = 90
  if (prevPos) {
    heading = bearing(prevPos.lat, prevPos.lon, lat, lon)
  }

  // Estimate a "rowIdx" using total 2D distance from start instead of just lat diff
  const startLat = SIM_CFG.startLat;
  const startLon = SIM_CFG.startLon;
  const dLat = (lat - startLat) * 111_000;
  const dLon = (lon - startLon) * 111_000 * Math.cos(startLat * Math.PI / 180);
  const dist = Math.sqrt(dLat * dLat + dLon * dLon);
  const rowIdx = Math.max(0, Math.floor(dist / SIM_CFG.rowSpacing));

  return {
    potatoes:           parseFloat(potatoPct.toFixed(1)),
    rocks:              parseFloat(rocksPct.toFixed(1)),
    sticks:             parseFloat(Math.max(0, sticksPct).toFixed(1)),
    lat,
    lon,
    heading:            parseFloat(heading.toFixed(2)),
    rowIdx,
    rowStep:            false,
    done:               frameIdx === totalFrames - 1,
    // Extra pipeline fields
    damageRatio:        parseFloat(csvRow.damage_ratio),
    rollingDamagePct:   parseFloat(csvRow.rolling_damage_pct),
    alertTriggered:     csvRow.alert_triggered === 'True',
  }
}

// ── Engine factory ───────────────────────────────────────────────────────────

/**
 * createPipelineMockEngine(onPacket)
 *
 * Returns { start(), stop() }.
 * Fetches the pipeline data files, then calls onPacket for each row
 * at SIM_CFG.tickMs intervals to simulate real-time playback.
 */
export function createPipelineMockEngine(onPacket) {
  let timer = null
  let stopped = false
  let skipFn = null

  async function run() {
    // Fetch both data sources in parallel, using a timestamp to bypass Vite caching
    const ts = Date.now();
    const [csvText, modelJson] = await Promise.all([
      fetch(`/pipeline/dashboard_stats.csv?t=${ts}`).then(r => r.text()),
      fetch(`/pipeline/mock_model_output.json?t=${ts}`).then(r => r.json()),
    ])

    const csvRows = parseCSV(csvText)

    // Use the shorter of the two as our frame count
    const frameCount = Math.min(csvRows.length, modelJson.length)

    if (stopped) return

    let i = 0
    let prevPos = null

    skipFn = () => {
      if (stopped || !timer) return
      clearInterval(timer)
      timer = null

      const safetyLimit = 100_000
      let iter = 0

      while (i < frameCount && iter < safetyLimit) {
        iter++
        const pkt = buildPacket(csvRows[i], modelJson[i], prevPos, i, frameCount)
        prevPos = { lat: pkt.lat, lon: pkt.lon }
        onPacket(pkt)
        i++
      }
      stopped = true
    }

    timer = setInterval(() => {
      if (i >= frameCount) {
        clearInterval(timer)
        return
      }

      const pkt = buildPacket(csvRows[i], modelJson[i], prevPos, i, frameCount)
      prevPos = { lat: pkt.lat, lon: pkt.lon }
      onPacket(pkt)

      i++
    }, SIM_CFG.tickMs)
  }

  return {
    start() {
      stopped = false
      run().catch(err => console.error('[pipelineMock] Failed to load data:', err))
    },
    stop() {
      if (!timer) return
      clearInterval(timer)
      timer = null
      stopped = true
    },
    skip() {
      skipFn?.()
    }
  }
}
