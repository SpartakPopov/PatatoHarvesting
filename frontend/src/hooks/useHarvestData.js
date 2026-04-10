import { useState, useEffect, useRef, useCallback } from 'react'
import { createMockEngine } from '../simulation/mockEngine'

const WS_URL = 'ws://localhost:8000/ws/harvest'

/**
 * useHarvestData
 *
 * Manages the data source (mock engine OR Python backend WebSocket).
 * The rest of the app only sees: { status, start, stop }.
 * Switching data sources is a one-line change in App.jsx.
 *
 * @param {object}   options
 * @param {'mock'|'backend'} options.dataSource
 * @param {function} options.onPacket  — called with each CV data packet
 */
export function useHarvestData({ dataSource, onPacket }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'running' | 'stopped'
  const engineRef = useRef(null)
  // Keep onPacket ref stable so the engine closure always calls the latest version
  const onPacketRef = useRef(onPacket)
  useEffect(() => { onPacketRef.current = onPacket }, [onPacket])

  const start = useCallback(() => {
    if (dataSource === 'mock') {
      const engine = createMockEngine((pkt) => onPacketRef.current(pkt))
      engineRef.current = engine
      engine.start()
    } else {
      // ── Real Python backend via WebSocket ─────────────────────────
      const ws = new WebSocket(WS_URL)
      ws.onopen    = () => ws.send(JSON.stringify({ action: 'start' }))
      ws.onmessage = (e) => onPacketRef.current(JSON.parse(e.data))
      ws.onerror   = (e) => console.error('[WS] error', e)
      engineRef.current = {
        stop() {
          try { ws.send(JSON.stringify({ action: 'stop' })) } catch (_) {}
          ws.close()
        },
      }
    }
    setStatus('running')
  }, [dataSource])

  const stop = useCallback(() => {
    engineRef.current?.stop()
    engineRef.current = null
    setStatus('stopped')
  }, [])

  // Clean up if the component unmounts while running
  useEffect(() => () => engineRef.current?.stop(), [])

  return { status, start, stop }
}
