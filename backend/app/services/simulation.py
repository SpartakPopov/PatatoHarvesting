"""
app/services/simulation.py

HarvestSession — simulates a harvester moving through Field A-7.

This module is the Python mirror of frontend/src/services/mockEngine.js.
When the real CV algorithm is ready, replace `_generate_cv()` with calls
to your model and replace the GPS offset math with reads from a real receiver.
The packet schema and WebSocket protocol stay the same — no frontend changes needed.

Packet schema
─────────────
{
    "potatoes": float,   # % intake classified as potato  (0–100)
    "rocks":    float,
    "sticks":   float,
    "lat":      float,
    "lon":      float,
    "heading":  float,   # degrees, 0 = North, 90 = East
    "rowIdx":   int,
    "rowStep":  bool,    # True → lateral row step, skip drawing swath segment
    "done":     bool,
}
"""

import math
import random

from app.core.config import (
    START_LAT, START_LON,
    ROW_LENGTH, ROW_SPACING, MAX_ROWS,
    SPEED_MPS, STEER_NOISE,
)

# ── Field quality grid ────────────────────────────────────────────────────────
# 9 × 8 table of base potato-% values; bilinear-interpolated at query time.
# Mirrors QUALITY_GRID in frontend/src/services/mockEngine.js.
_QUALITY_GRID = [
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


def _grid_quality(row_idx: int, progress_m: float) -> float:
    R = len(_QUALITY_GRID) - 1
    C = len(_QUALITY_GRID[0]) - 1
    rn = min((row_idx / MAX_ROWS) * R, R - 0.001)
    pn = min((progress_m / ROW_LENGTH) * C, C - 0.001)
    r0, p0 = int(rn), int(pn)
    r1, p1 = r0 + 1, p0 + 1
    rf, pf = rn - r0, pn - p0
    return (
        _QUALITY_GRID[r0][p0] * (1 - rf) * (1 - pf)
        + _QUALITY_GRID[r0][p1] * (1 - rf) * pf
        + _QUALITY_GRID[r1][p0] * rf * (1 - pf)
        + _QUALITY_GRID[r1][p1] * rf * pf
    )


def _generate_cv(row_idx: int, progress_m: float) -> dict:
    """
    Build a CV reading at (row_idx, progress_m).

    Replace this function body with real model inference:
        result = your_cv_model.classify(frame)
        potatoes = result.potato_pct
    """
    base     = _grid_quality(row_idx, progress_m)
    potatoes = max(10.0, min(99.0, base + (random.random() - 0.5) * 18))
    debris   = 100.0 - potatoes
    rock_share = 0.35 + random.random() * 0.45
    return {
        "potatoes": round(potatoes, 1),
        "rocks":    round(debris * rock_share, 1),
        "sticks":   round(debris * (1 - rock_share), 1),
    }


# ── Coordinate helpers ────────────────────────────────────────────────────────

def _offset(lat: float, lon: float, heading_deg: float, dist_m: float):
    """Move (lat, lon) by dist_m metres in direction heading_deg."""
    r     = math.radians(heading_deg)
    d_lat = math.cos(r) * dist_m / 111_000
    d_lon = math.sin(r) * dist_m / (111_000 * math.cos(math.radians(lat)))
    return lat + d_lat, lon + d_lon


# ── Session ───────────────────────────────────────────────────────────────────

class HarvestSession:
    """
    Stateful simulation of one field harvest.
    Call tick() every TICK_S seconds while running is True.
    """

    def __init__(self):
        self.lat          = START_LAT
        self.lon          = START_LON
        self.heading      = 90.0   # start heading East
        self.row_dir      = 1      # 1 = East, −1 = West
        self.row_idx      = 0
        self.row_progress = 0.0
        self.drift_acc    = 0.0
        self.running      = False

    def tick(self) -> dict:
        """Advance one step and return the data packet."""
        # Organic steering noise
        nudge          = (random.random() - 0.5) * 0.8
        self.drift_acc = max(-STEER_NOISE, min(STEER_NOISE, self.drift_acc + nudge))
        self.heading   = (90.0 if self.row_dir == 1 else 270.0) + self.drift_acc

        # Move
        self.lat, self.lon = _offset(self.lat, self.lon, self.heading, SPEED_MPS)
        self.row_progress += SPEED_MPS

        cv = _generate_cv(self.row_idx, self.row_progress)
        packet = {
            **cv,
            "lat":     round(self.lat, 7),
            "lon":     round(self.lon, 7),
            "heading": round(self.heading, 2),
            "rowIdx":  self.row_idx,
            "rowStep": False,
            "done":    False,
        }

        # End of row?
        if self.row_progress >= ROW_LENGTH:
            self.row_idx      += 1
            self.row_progress  = 0.0
            self.drift_acc     = 0.0

            if self.row_idx >= MAX_ROWS:
                packet["done"]  = True
                self.running    = False
                return packet

            # Step north, flip direction, emit row-step marker
            self.lat, self.lon = _offset(self.lat, self.lon, 0, ROW_SPACING)
            self.row_dir       = -self.row_dir
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
