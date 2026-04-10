/**
 * services/api.js
 *
 * WebSocket connection to the Python backend.
 * Only used when DATA_SOURCE = 'backend' in App.jsx.
 *
 * Protocol
 * ────────
 * Client → server:  { "action": "start" }  |  { "action": "stop" }
 * Server → client:  CV data packets (same schema as mockEngine.js)
 */

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws/harvest'

/**
 * createBackendConnection(onPacket)
 *
 * Opens a WebSocket, sends "start", and forwards every inbound
 * packet to onPacket. Returns { stop() } for teardown.
 */
export function createBackendConnection(onPacket) {
  const ws = new WebSocket(WS_URL)

  ws.onopen    = () => ws.send(JSON.stringify({ action: 'start' }))
  ws.onmessage = (e) => onPacket(JSON.parse(e.data))
  ws.onerror   = (err) => console.error('[api] WebSocket error:', err)

  return {
    stop() {
      try { ws.send(JSON.stringify({ action: 'stop' })) } catch (_) { /* ws may already be closing */ }
      ws.close()
    },
  }
}
