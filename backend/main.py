"""
backend/main.py — Precision Harvest Dashboard API
==================================================

Provides a WebSocket endpoint that streams real-time CV + GPS harvest data.
Currently uses the same simulated field as the frontend mock engine.
When the real Computer Vision algorithm is ready, replace HarvestSession.tick()
with calls to your model inference pipeline — the packet format stays the same.

Run:
    cd backend
    uvicorn main:app --reload --port 8000

Frontend switches to this server by setting DATA_SOURCE = 'backend' in App.jsx.

Packet format (JSON, emitted every 500 ms while session is running):
    {
        "potatoes": float,   # % of intake classified as potato
        "rocks":    float,   # % rocks
        "sticks":   float,   # % sticks
        "lat":      float,   # WGS-84 latitude
        "lon":      float,   # WGS-84 longitude
        "heading":  float,   # bearing in degrees (0=N, 90=E)
        "rowIdx":   int,     # current harvest row (0-based)
        "rowStep":  bool,    # True for the lateral step between rows
        "done":     bool     # True on the final packet
    }
"""

import asyncio
import json
import math
import random
from dataclasses import dataclass, field, asdict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="Potato Harvest API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Field quality map (mirrors frontend mockEngine.js) ────────────────────────
# 9×8 grid; bilinear-interpolated at query time.
QUALITY_GRID = [
    [95, 85, 20, 18, 15, 22, 28, 40],  # row  0
    [88, 72, 22, 18, 20, 38, 52, 68],  # row  5
    [70, 58, 45, 48, 52, 65, 72, 75],  # row 10
    [38, 60, 78, 84, 88, 90, 87, 80],  # row 15
    [30, 68, 85, 93, 91, 88, 82, 76],  # row 20
    [52, 58, 62, 68, 70, 63, 55, 50],  # row 25
    [74, 77, 80, 83, 80, 76, 78, 82],  # row 30
    [82, 85, 88, 86, 87, 85, 88, 90],  # row 35
    [86, 88, 90, 88, 86, 85, 87, 89],  # row 40
]

MAX_ROWS     = 40
ROW_LENGTH   = 220   # metres
ROW_SPACING  = 4     # metres (swath width)
SPEED_MPS    = 3.2   # metres per tick
STEER_NOISE  = 1.5   # max heading drift ± degrees
TICK_S       = 0.5   # seconds between packets

START_LAT    = 43.6210
START_LON    = -116.2050


def grid_quality(row_idx: int, progress_m: float) -> float:
    R = len(QUALITY_GRID) - 1
    C = len(QUALITY_GRID[0]) - 1
    r_norm = min((row_idx / MAX_ROWS) * R, R - 0.001)
    p_norm = min((progress_m / ROW_LENGTH) * C, C - 0.001)
    r0, p0 = int(r_norm), int(p_norm)
    r1, p1 = r0 + 1, p0 + 1
    rf, pf = r_norm - r0, p_norm - p0
    q = (
        QUALITY_GRID[r0][p0] * (1 - rf) * (1 - pf) +
        QUALITY_GRID[r0][p1] * (1 - rf) *      pf  +
        QUALITY_GRID[r1][p0] *      rf  * (1 - pf) +
        QUALITY_GRID[r1][p1] *      rf  *      pf
    )
    return q


def generate_cv(row_idx: int, progress_m: float) -> dict:
    base     = grid_quality(row_idx, progress_m)
    noise    = (random.random() - 0.5) * 18
    potatoes = max(10.0, min(99.0, base + noise))
    debris   = 100.0 - potatoes
    rock_share = 0.35 + random.random() * 0.45
    rocks  = round(debris * rock_share,      1)
    sticks = round(debris * (1 - rock_share), 1)
    return {"potatoes": round(potatoes, 1), "rocks": rocks, "sticks": sticks}


# ── Coordinate helpers ────────────────────────────────────────────────────────

def offset_lat_lon(lat: float, lon: float, heading_deg: float, dist_m: float):
    r      = math.radians(heading_deg)
    d_lat  = math.cos(r) * dist_m / 111_000
    d_lon  = math.sin(r) * dist_m / (111_000 * math.cos(math.radians(lat)))
    return lat + d_lat, lon + d_lon


# ── Session ───────────────────────────────────────────────────────────────────

@dataclass
class HarvestSession:
    lat:          float = START_LAT
    lon:          float = START_LON
    heading:      float = 90.0
    row_dir:      int   = 1        # 1 = East, -1 = West
    row_idx:      int   = 0
    row_progress: float = 0.0
    drift_acc:    float = 0.0
    running:      bool  = False

    def tick(self) -> dict:
        """Advance the simulation by one step, return the data packet."""
        # Steering noise
        nudge          = (random.random() - 0.5) * 0.8
        self.drift_acc = max(-STEER_NOISE, min(STEER_NOISE, self.drift_acc + nudge))
        base_h         = 90.0 if self.row_dir == 1 else 270.0
        self.heading   = base_h + self.drift_acc

        # Move
        self.lat, self.lon = offset_lat_lon(self.lat, self.lon, self.heading, SPEED_MPS)
        self.row_progress += SPEED_MPS

        cv     = generate_cv(self.row_idx, self.row_progress)
        packet = {
            **cv,
            "lat":     round(self.lat, 7),
            "lon":     round(self.lon, 7),
            "heading": round(self.heading, 2),
            "rowIdx":  self.row_idx,
            "rowStep": False,
            "done":    False,
        }

        # Row end?
        if self.row_progress >= ROW_LENGTH:
            self.row_idx      += 1
            self.row_progress  = 0.0
            self.drift_acc     = 0.0

            if self.row_idx >= MAX_ROWS:
                packet["done"]    = True
                self.running      = False
                return packet

            # Step north to next row
            self.lat, self.lon = offset_lat_lon(self.lat, self.lon, 0, ROW_SPACING)
            self.row_dir       = -self.row_dir
            # Emit a row-step packet so the frontend skips drawing a diagonal segment
            return {
                **cv,
                "lat":     round(self.lat, 7),
                "lon":     round(self.lon, 7),
                "heading": round(self.heading, 2),
                "rowIdx":  self.row_idx,
                "rowStep": True,
                "done":    False,
            }

        return packet


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws/harvest")
async def harvest_ws(ws: WebSocket):
    """
    WebSocket protocol:
      Client → server:  { "action": "start" }  |  { "action": "stop" }
      Server → client:  CV data packets (see module docstring)
    """
    await ws.accept()
    session = HarvestSession()

    try:
        while True:
            # Non-blocking check for incoming control messages
            try:
                raw  = await asyncio.wait_for(ws.receive_text(), timeout=0.01)
                msg  = json.loads(raw)
                action = msg.get("action", "")
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
        pass


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "potato-harvest-api"}


# ─────────────────────────────────────────────────────────────────────────────
# HOW TO PLUG IN THE REAL ALGORITHM
# ─────────────────────────────────────────────────────────────────────────────
#
# 1. Replace generate_cv() with your model inference:
#
#    from your_cv_model import classify_frame
#
#    def generate_cv(frame) -> dict:
#        result = classify_frame(frame)
#        return {"potatoes": result.potato_pct,
#                "rocks":    result.rock_pct,
#                "sticks":   result.stick_pct}
#
# 2. Replace the simulated GPS (offset_lat_lon calls in tick()) with reads
#    from your real GPS receiver / NMEA stream.
#
# 3. The packet format stays identical — no frontend changes needed.
# ─────────────────────────────────────────────────────────────────────────────
