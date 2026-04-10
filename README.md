# Precision Agriculture Harvest Dashboard

Real-time visualisation of a potato harvester's GPS track and Computer Vision yield data across a field.

---

## Project structure

```
PatatoHarvesting/
├── frontend/                   React + Vite + Leaflet.js
│   ├── src/
│   │   ├── config/
│   │   │   └── simulation.js   Shared constants (speed, field size, swath width)
│   │   ├── services/
│   │   │   ├── mockEngine.js   Simulated GPS + CV data stream
│   │   │   └── api.js          WebSocket connection to Python backend
│   │   ├── hooks/
│   │   │   └── useHarvestData.js  Selects mock vs backend, manages lifecycle
│   │   ├── utils/
│   │   │   └── geo.js          Swath quad geometry + colour mapping
│   │   ├── components/
│   │   │   ├── Map/
│   │   │   │   ├── index.jsx        Leaflet MapContainer + tile layer
│   │   │   │   └── CanvasLayer.jsx  Canvas trail + tractor icon
│   │   │   └── Sidebar/
│   │   │       ├── index.jsx        Panel layout + controls
│   │   │       ├── Gauge.jsx
│   │   │       ├── DebrisBars.jsx
│   │   │       ├── StatGrid.jsx
│   │   │       ├── GPSReadout.jsx
│   │   │       └── Sparkline.jsx
│   │   └── styles/
│   │       └── dashboard.css
│   ├── .env.example
│   └── vite.config.js
│
└── backend/                    Python FastAPI + WebSocket
    ├── run.py                  Entry point  →  python run.py
    ├── requirements.txt
    ├── .env.example
    └── app/
        ├── main.py             FastAPI app factory + CORS
        ├── core/
        │   └── config.py       Field constants + server config
        ├── services/
        │   └── simulation.py   HarvestSession (swap in real CV here)
        └── routers/
            └── harvest.py      WebSocket endpoint + health check
```

---

## Quick start

### Frontend (mock data — no backend needed)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Backend (real CV algorithm)

```bash
cd backend
pip install -r requirements.txt
python run.py
# → ws://localhost:8000/ws/harvest
```

Then set `VITE_DATA_SOURCE=backend` in `frontend/.env` and restart Vite.

---

## Switching from mock to real backend

1. Copy the env file:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
2. Set `VITE_DATA_SOURCE=backend` in `frontend/.env`.
3. Start the Python server: `cd backend && python run.py`
4. Restart Vite: `cd frontend && npm run dev`

To plug in the real CV model, open `backend/app/services/simulation.py`
and replace the body of `_generate_cv()` with your model inference.
The packet schema and WebSocket protocol are unchanged — no frontend edits needed.

---

## Data packet format

Emitted every 500 ms by both the mock engine and the Python backend:

```json
{
  "potatoes": 87.3,
  "rocks":     7.2,
  "sticks":    5.5,
  "lat":      43.621034,
  "lon":    -116.205123,
  "heading":  91.2,
  "rowIdx":    3,
  "rowStep": false,
  "done":    false
}
```

| Field | Description |
|---|---|
| `potatoes` | % of intake classified as potato |
| `rocks` / `sticks` | % debris (sum with potatoes = 100) |
| `lat` / `lon` | WGS-84 decimal degrees |
| `heading` | Bearing in degrees (0 = North, 90 = East) |
| `rowIdx` | Current harvest row, 0-based |
| `rowStep` | `true` on the lateral step between rows — frontend skips drawing a swath segment |
| `done` | `true` on the final packet |