import { useState, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import { useHarvestData } from './hooks/useHarvestData'
import { yieldColor, swathQuad } from './utils/geo'
import { SIM_CFG } from './simulation/mockEngine'

// ─── Toggle this to 'backend' to use the Python FastAPI server ───────────────
const DATA_SOURCE = 'mock'
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_STATS = { area: 0, rows: 0, qualitySum: 0, ticks: 0 }

export default function App() {
  const [segments,     setSegments]     = useState([])
  const [cvPacket,     setCvPacket]     = useState(null)
  const [sparkHistory, setSparkHistory] = useState([])
  const [stats,        setStats]        = useState(EMPTY_STATS)
  const [tractor,      setTractor]      = useState(null)

  // Tracks the previous GPS position so we can compute swath quads
  const prevPosRef = useRef(null)

  const handlePacket = useCallback((pkt) => {
    setCvPacket(pkt)

    setSparkHistory((prev) => {
      const next = [...prev, pkt.potatoes]
      return next.length > 60 ? next.slice(-60) : next
    })

    // Draw a swath segment for every normal forward-movement tick
    if (prevPosRef.current && !pkt.rowStep) {
      const quad = swathQuad(
        prevPosRef.current.lat, prevPosRef.current.lon,
        pkt.lat, pkt.lon,
        SIM_CFG.rowSpacing,
      )
      if (quad) {
        const color = yieldColor(pkt.potatoes)
        setSegments((prev) => [...prev, { quad, color }])
      }

      setStats((prev) => ({
        area:       prev.area + SIM_CFG.speedMPS * SIM_CFG.rowSpacing,
        rows:       pkt.rowIdx,
        qualitySum: prev.qualitySum + pkt.potatoes,
        ticks:      prev.ticks + 1,
      }))
    }

    // On a row-step tick just update position without drawing
    prevPosRef.current = { lat: pkt.lat, lon: pkt.lon }
    setTractor({ lat: pkt.lat, lon: pkt.lon, heading: pkt.heading })

    if (pkt.done) stop()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { status, start, stop } = useHarvestData({ dataSource: DATA_SOURCE, onPacket: handlePacket })

  const handleReset = useCallback(() => {
    stop()
    prevPosRef.current = null
    setSegments([])
    setCvPacket(null)
    setSparkHistory([])
    setStats(EMPTY_STATS)
    setTractor(null)
  }, [stop])

  return (
    <div className="app">
      <Sidebar
        cvPacket={cvPacket}
        stats={stats}
        sparkHistory={sparkHistory}
        status={status}
        onStart={start}
        onStop={stop}
        onReset={handleReset}
      />

      <div className="map-wrapper">
        <MapView segments={segments} tractor={tractor} />

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
