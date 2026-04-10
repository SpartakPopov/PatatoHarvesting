/**
 * App.jsx
 *
 * Root component. Owns all shared state and coordinates between
 * the data layer (useHarvestData) and the UI (Sidebar, MapView).
 *
 * Data source
 * ───────────
 * 'mock'     — Procedural JS simulation engine (no backend required)
 * 'pipeline' — Playback of pre-generated pipeline/ data files
 * 'backend'  — Python FastAPI WebSocket (cd backend && python run.py)
 *
 * To switch: change the DATA_SOURCE constant below, or set the
 * VITE_DATA_SOURCE environment variable in frontend/.env.
 */

import { useState, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MapView from './components/Map'
import { useHarvestData } from './hooks/useHarvestData'
import { swathQuad, yieldColor } from './utils/geo'
import { SIM_CFG } from './config/simulation'

const DATA_SOURCE = import.meta.env.VITE_DATA_SOURCE ?? 'pipeline'

const EMPTY_STATS = { area: 0, rows: 0, qualitySum: 0, ticks: 0 }

export default function App() {
  const [segments, setSegments] = useState([])
  const [cvPacket, setCvPacket] = useState(null)
  const [sparkHistory, setSparkHistory] = useState([])
  const [stats, setStats] = useState(EMPTY_STATS)
  const [tractor, setTractor] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Tracks the previous GPS position for swath quad computation
  const prevPosRef = useRef(null)

  const handlePacket = useCallback((pkt) => {
    setCvPacket(pkt)

    setSparkHistory((prev) => {
      const next = [...prev, pkt.potatoes]
      return next.length > 60 ? next.slice(-60) : next
    })

    // Draw a swath segment on every normal forward-movement tick
    if (prevPosRef.current && !pkt.rowStep) {
      const quad = swathQuad(
        prevPosRef.current.lat, prevPosRef.current.lon,
        pkt.lat, pkt.lon,
        SIM_CFG.rowSpacing,
      )
      if (quad) {
        setSegments((prev) => [...prev, { quad, color: yieldColor(pkt.potatoes) }])
      }

      setStats((prev) => ({
        area: prev.area + SIM_CFG.speedMPS * SIM_CFG.rowSpacing,
        rows: pkt.rowIdx,
        qualitySum: prev.qualitySum + pkt.potatoes,
        ticks: prev.ticks + 1,
      }))
    }

    prevPosRef.current = { lat: pkt.lat, lon: pkt.lon }
    setTractor({ lat: pkt.lat, lon: pkt.lon, heading: pkt.heading })

    if (pkt.done) stop() // eslint-disable-line react-hooks/exhaustive-deps
  }, []) // stable — uses only refs and functional setState

  const { status, start, stop, skip } = useHarvestData({
    dataSource: DATA_SOURCE,
    onPacket: handlePacket,
  })

  const handleReset = useCallback(() => {
    stop()
    prevPosRef.current = null
    setSegments([])
    setCvPacket(null)
    setSparkHistory([])
    setStats(EMPTY_STATS)
    setTractor(null)
  }, [stop])

  // Colour of the live-yield badge on the floating toggle button
  const pct = cvPacket?.potatoes ?? null
  const badgeColor =
    pct == null ? 'var(--muted)' :
      pct >= 80 ? 'var(--green)' :
        pct >= 60 ? 'var(--yellow)' :
          pct >= 40 ? 'var(--orange)' : 'var(--red)'

  return (
    <div className={`app${sidebarOpen ? ' sidebar-open' : ''}`}>

      {/* Scrim — closes the panel when tapped on tablet */}
      {sidebarOpen && (
        <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        cvPacket={cvPacket}
        stats={stats}
        sparkHistory={sparkHistory}
        status={status}
        onStart={start}
        onStop={stop}
        onSkip={skip}
        onReset={handleReset}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="map-wrapper">
        <MapView segments={segments} tractor={tractor} />

        {/* Floating toggle — always visible, shows live yield % */}
        <button
          className="panel-toggle"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label="Toggle panel"
        >
          <span className="panel-toggle-icon">{sidebarOpen ? '✕' : '☰'}</span>
          {pct != null && (
            <span className="panel-toggle-badge" style={{ color: badgeColor }}>
              {pct.toFixed(0)}%
            </span>
          )}
        </button>

        {/* Yield quality legend */}
        <div className="legend">
          <h4 className="legend-title">Yield Quality</h4>
          <div className="legend-row"><span className="legend-swatch" style={{ background: '#166534' }} />&gt; 90% Potatoes</div>
          <div className="legend-row"><span className="legend-swatch" style={{ background: '#22c55e' }} />80 – 90%</div>
          <div className="legend-row"><span className="legend-swatch" style={{ background: '#eab308' }} />60 – 79%</div>
          <div className="legend-row"><span className="legend-swatch" style={{ background: '#f97316' }} />40 – 59%</div>
          <div className="legend-row"><span className="legend-swatch" style={{ background: '#ef4444' }} />&lt; 40% (Debris)</div>
        </div>

        {status === 'stopped' && (
          <div className="banner">
            ✅ Harvest complete — Field A-7 &nbsp;|&nbsp;
            {stats.ticks > 0 ? `Avg yield ${(stats.qualitySum / stats.ticks).toFixed(1)}%` : ''}
          </div>
        )}
      </div>
    </div>
  )
}
