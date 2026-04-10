/**
 * config/simulation.js
 *
 * Single source of truth for all simulation constants.
 * Imported by the mock engine, the backend WebSocket client,
 * and App.jsx for swath geometry calculations.
 *
 * When switching to real hardware, these values should match
 * the physical harvester specs (swath width, GPS update rate, etc.).
 */
export const SIM_CFG = {
  // ── Field origin (SW corner) ──────────────────────────────────
  startLat:   43.6210,    // WGS-84 latitude  (Idaho potato belt)
  startLon:  -116.2050,   // WGS-84 longitude

  // ── Field geometry ────────────────────────────────────────────
  rowLength:  220,         // metres along each harvest pass
  rowSpacing:   4,         // metres between passes (= swath width)
  maxRows:     40,         // total passes in Field A-7

  // ── Harvester kinematics ──────────────────────────────────────
  speedMPS:    3.2,        // metres per 500 ms tick  (~23 km/h)
  steerNoise:  1.5,        // max heading drift ± degrees

  // ── Timing ───────────────────────────────────────────────────
  tickMs:     500,         // milliseconds between CV data packets
}
