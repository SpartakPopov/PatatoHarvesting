"""
mock_data_generator.py

Generates realistic mock harvester data for the pipeline.
Simulates a tractor harvesting a potato field near Reusel, NL (VDBorne)
using a boustrophedon (back-and-forth) row pattern.

The tractor:
  - Drives in straight rows (east-west), ~3 m/s
  - Steps north by one swath width (4 m) between rows
  - Alternates direction each row (east → west → east → …)
  - Has tiny GPS jitter (±5 cm) to mimic real RTK GPS noise

Detection quality varies across the field using a smooth spatial model
to create realistic quality zones (good areas, rocky strips, debris patches).

Output: mock_model_output.json  (same schema the pipeline.py consumes)
"""

import json
import math
import random
from datetime import datetime, timedelta

# ── Field configuration ──────────────────────────────────────────────────────

# Field boundaries: Tractor bounces back and forth within this box
FIELD_START_LAT = 41.915243
FIELD_START_LON = 25.692696
FIELD_END_LAT   = 41.913027
FIELD_END_LON   = 25.689716

ROTATION_DEG  = 15.0     # degrees to tilt the field clockwise from the top
ROW_SPACING_M = 4        # swath width (metres between rows)
SPEED_MPS     = 3.0      # tractor speed in m/s
TICK_S        = 1.0      # one frame per second

# Detection classes the CV model outputs
CLASSES = ["potato_good", "potato_damaged", "clod", "stone", "stick"]

# Camera / belt parameters
FRAME_WIDTH  = 640
FRAME_HEIGHT = 480

# ── Coordinate helpers ───────────────────────────────────────────────────────

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def bearing_deg(lat1, lon1, lat2, lon2):
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) \
        - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlon)
    return math.degrees(math.atan2(y, x)) % 360

def lat_deg_per_m():
    return 1.0 / 111_000

def lon_deg_per_m(lat):
    return 1.0 / (111_000 * math.cos(math.radians(lat)))


# ── Field quality model ──────────────────────────────────────────────────────
#
# A smooth 2D function that gives the "base quality" (probability of
# potato_good) at every point in the field.  This creates:
#   - A nice central zone with high potato quality
#   - Edges / corners with more debris and damage
#   - A rocky strip in the middle rows
#
# Values range 0.0 (all debris) to 1.0 (all good potatoes).

def field_quality(row_idx, total_rows, progress_fraction):
    """
    Return the base probability of 'potato_good' for a given field position.
    row_idx:            which row the tractor is on (0-based)
    total_rows:         total number of rows in the simulation
    progress_fraction:  how far along the current row (0.0 to 1.0)
    """
    # Normalise row position to 0–1 range
    row_n = row_idx / max(total_rows - 1, 1)

    # Create a smooth "good zone" centred in the field
    # using a 2D gaussian-ish shape
    cx, cy = 0.55, 0.45  # centre of good zone (slightly off-centre)
    dx = progress_fraction - cx
    dy = row_n - cy
    dist = math.sqrt(dx * dx + dy * dy)

    base = 0.80 - 0.5 * dist  # high in centre, drops towards edges

    # Add a rocky strip: rows 2–3 near 30–50% progress
    if 2 <= row_idx <= 3 and 0.25 < progress_fraction < 0.55:
        base -= 0.20  # significantly more debris here

    # Clamp
    return max(0.25, min(0.92, base))


def generate_detections(quality):
    """
    Generate a realistic list of detections for one frame.
    `quality` is the probability of each object being potato_good (0–1).
    """
    num_objects = random.randint(6, 14)

    # Probability weights derived from quality
    p_good    = quality
    p_damaged = (1.0 - quality) * 0.40   # damaged potatoes
    p_clod    = (1.0 - quality) * 0.30   # clods
    p_stone   = (1.0 - quality) * 0.20   # stones
    p_stick   = (1.0 - quality) * 0.10   # sticks
    weights   = [p_good, p_damaged, p_clod, p_stone, p_stick]

    detections = []
    for _ in range(num_objects):
        obj_class = random.choices(CLASSES, weights=weights)[0]

        # Confidence tends to be higher for good potatoes, lower for debris
        if obj_class == "potato_good":
            conf = round(random.uniform(0.75, 0.99), 2)
        elif obj_class == "potato_damaged":
            conf = round(random.uniform(0.60, 0.92), 2)
        else:
            conf = round(random.uniform(0.55, 0.88), 2)

        # Realistic bounding box within a 640×480 camera frame
        w = random.randint(40, 120)
        h = random.randint(40, 120)
        x1 = random.randint(0, FRAME_WIDTH - w)
        y1 = random.randint(0, FRAME_HEIGHT - h)

        detections.append({
            "class": obj_class,
            "confidence": conf,
            "bbox": [x1, y1, x1 + w, y1 + h]
        })

    return detections


# ── Main generator ───────────────────────────────────────────────────────────

def generate_mock_stream():
    """
    Generate a mock stream filling the bounding box between START and END points.
    """
    stream = []
    current_time = datetime.now()
    frame_id = 0

    lat = FIELD_START_LAT
    lon = FIELD_START_LON

    # Compute distances 
    row_length_m = haversine(FIELD_START_LAT, FIELD_START_LON, FIELD_END_LAT, FIELD_START_LON)
    field_width_m = haversine(FIELD_START_LAT, FIELD_START_LON, FIELD_START_LAT, FIELD_END_LON)
    
    num_rows = max(1, int(round(field_width_m / ROW_SPACING_M)))
    
    # If the number of rows is even, the boustrophedon pattern will end on the same side it started (FIELD_START_LAT).
    # Since we want it to end at the endpoint (FIELD_END_LAT, FIELD_END_LON), we force num_rows to be odd.
    if num_rows % 2 == 0:
        num_rows += 1
    
    # We enforce at least 1 tick per row to avoid zero division
    ticks_per_row = max(1, int(row_length_m / (SPEED_MPS * TICK_S)))

    dLat_total = FIELD_END_LAT - FIELD_START_LAT
    dLon_total = FIELD_END_LON - FIELD_START_LON

    lon_step_deg = dLon_total / max(1, num_rows - 1) if num_rows > 1 else 0

    for row in range(num_rows):
        # Direction alternates each row: Forwards (Start to End), Backwards (End to Start)
        direction = 1 if row % 2 == 0 else -1  
        lat_step_deg = (dLat_total / ticks_per_row) * direction

        for tick in range(ticks_per_row):
            current_time += timedelta(seconds=TICK_S)

            lat += lat_step_deg

            # Convert unrotated local progress into metres from start
            dx_m = (lon - FIELD_START_LON) / lon_deg_per_m(FIELD_START_LAT)
            dy_m = (lat - FIELD_START_LAT) / lat_deg_per_m()

            # Rotate clockwise by ROTATION_DEG around FIELD_START
            theta = math.radians(ROTATION_DEG)
            dx_rot = dx_m * math.cos(theta) + dy_m * math.sin(theta)
            dy_rot = -dx_m * math.sin(theta) + dy_m * math.cos(theta)

            # Convert back to WGS-84 coordinates
            base_lat = FIELD_START_LAT + dy_rot * lat_deg_per_m()
            base_lon = FIELD_START_LON + dx_rot * lon_deg_per_m(base_lat)

            # Tiny GPS jitter to simulate real RTK noise (±5 cm)
            jitter_lat = random.gauss(0, 0.05) * lat_deg_per_m()
            jitter_lon = random.gauss(0, 0.05) * lon_deg_per_m(base_lat)

            gps_lat = base_lat + jitter_lat
            gps_lon = base_lon + jitter_lon

            # Field quality at this position
            progress = tick / max(ticks_per_row - 1, 1)
            quality = field_quality(row, num_rows, progress)
            quality_noisy = max(0.15, min(0.95, quality + random.gauss(0, 0.06)))

            detections = generate_detections(quality_noisy)

            stream.append({
                "frame_id": frame_id,
                "timestamp": current_time.isoformat(),
                "gps": {"lat": round(gps_lat, 10), "lon": round(gps_lon, 10)},
                "detections": detections
            })
            frame_id += 1

        # Step longitudinally to the next row
        lon += lon_step_deg

    return stream

if __name__ == "__main__":
    stream = generate_mock_stream()
    with open("mock_model_output.json", "w") as f:
        json.dump(stream, f, indent=4)
    print(f"Generated {len(stream)} mock frames in 'mock_model_output.json'")
    print(f"  Field path: from ({FIELD_START_LAT},{FIELD_START_LON}) to ({FIELD_END_LAT},{FIELD_END_LON})")