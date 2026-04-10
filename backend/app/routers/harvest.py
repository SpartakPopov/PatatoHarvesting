"""
app/routers/harvest.py

WebSocket endpoint for real-time CV + GPS data streaming,
and a REST health-check endpoint.
"""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import TICK_S
from app.services.simulation import HarvestSession

router = APIRouter()


@router.websocket("/ws/harvest")
async def harvest_stream(ws: WebSocket):
    """
    WebSocket protocol
    ──────────────────
    Client → server:  { "action": "start" }  — begin emitting packets
                      { "action": "stop"  }  — pause emission
    Server → client:  CV data packet every TICK_S seconds (see simulation.py)
    """
    await ws.accept()
    session = HarvestSession()

    try:
        while True:
            # Non-blocking check for control messages from the client
            try:
                raw    = await asyncio.wait_for(ws.receive_text(), timeout=0.01)
                action = json.loads(raw).get("action", "")
                if action == "start":
                    session.running = True
                elif action == "stop":
                    session.running = False
            except asyncio.TimeoutError:
                pass

            if session.running:
                packet = session.tick()
                await ws.send_text(json.dumps(packet))
                if packet["done"]:
                    break

            await asyncio.sleep(TICK_S)

    except WebSocketDisconnect:
        pass  # client disconnected cleanly


@router.get("/api/health")
def health():
    return {"status": "ok", "service": "potato-harvest-api"}
