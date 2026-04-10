/**
 * hooks/useHarvestData.js
 *
 * Manages the active data source and exposes a clean { status, start, stop }
 * interface to the rest of the app.
 *
 * The data source is selected by the DATA_SOURCE constant in App.jsx:
 *   'mock'     → services/mockEngine.js          (procedural JS simulation)
 *   'pipeline' → services/pipelineMockEngine.js   (playback of pipeline/ files)
 *   'backend'  → services/api.js                  (Python FastAPI WebSocket)
 *
 * Switching sources does not change any other file.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createMockEngine } from '../services/mockEngine'
import { createPipelineMockEngine } from '../services/pipelineMockEngine'
import { createBackendConnection } from '../services/api'

export function useHarvestData({ dataSource, onPacket }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'running' | 'stopped'
  const connectionRef = useRef(null)

  // Keep onPacket in a ref so the engine closure always calls the latest version
  // without needing to be re-created when the callback identity changes.
  const onPacketRef = useRef(onPacket)
  useEffect(() => { onPacketRef.current = onPacket }, [onPacket])

  const start = useCallback(() => {
    const handler = (pkt) => onPacketRef.current(pkt)

    if (dataSource === 'mock') {
      connectionRef.current = createMockEngine(handler)
    } else if (dataSource === 'pipeline') {
      connectionRef.current = createPipelineMockEngine(handler)
    } else {
      connectionRef.current = createBackendConnection(handler)
    }

    connectionRef.current.start?.() // mock engines need .start(); backend auto-starts
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
