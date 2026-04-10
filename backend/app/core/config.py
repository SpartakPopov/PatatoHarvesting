"""
app/core/config.py

All configuration constants for the backend.
Field simulation values mirror frontend/src/config/simulation.js —
keep them in sync when changing harvester specs.
"""

import os

# ── Server ────────────────────────────────────────────────────────────────────
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# ── Field geometry (mirror of frontend/src/config/simulation.js) ──────────────
START_LAT   = 43.6210    # WGS-84 latitude  — field SW corner (Idaho)
START_LON   = -116.2050  # WGS-84 longitude

ROW_LENGTH  = 220        # metres per harvest pass
ROW_SPACING = 4          # metres between passes (= swath width)
MAX_ROWS    = 40         # total passes in Field A-7

# ── Harvester kinematics ──────────────────────────────────────────────────────
SPEED_MPS   = 3.2        # metres moved per tick
STEER_NOISE = 1.5        # max heading drift ± degrees
TICK_S      = 0.5        # seconds between CV packets
