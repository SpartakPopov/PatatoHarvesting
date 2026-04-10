/**
 * hooks/useHarvestData.js
 *
 * Manages the active data source and exposes a clean { status, start, stop }
 * interface to the rest of the app.
 *
 * The data source is selected by the DATA_SOURCE constant in App.jsx:
 *   'mock'    → services/mockEngine.js  (no backend required)
 *   'backend' → services/api.js         (Python FastAPI WebSocket)
 *
 * Switching sources does not change any other file.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createMockEngine }         from '../services/mockEngine'
import { createBackendConnection }  from '../services/api'

export function useHarvestData({ dataSource, onPacket }) {
  const [status,    setStatus]    = useState('idle') // 'idle' | 'running' | 'stopped'
  const connectionRef = useRef(null)

  // Keep onPacket in a ref so the engine closure always calls the latest version
  // without needing to be re-created when the callback identity changes.
  const onPacketRef = useRef(onPacket)
  useEffect(() => { onPacketRef.current = onPacket }, [onPacket])

  const start = useCallback(() => {
    const handler = (pkt) => onPacketRef.current(pkt)

    connectionRef.current =
      dataSource === 'mock'
        ? createMockEngine(handler)
        : createBackendConnection(handler)

    connectionRef.current.start?.() // mock engine needs .start(); backend auto-starts
    setStatus('running')
  }, [dataSource])

  const stop = useCallback(() => {
    connectionRef.current?.stop()
    connectionRef.current = null
    setStatus('stopped')
  }, [])

  // Clean up if the component unmounts while a session is running
  useEffect(() => () => connectionRef.current?.stop(), [])

  return { status, start, stop }
}
