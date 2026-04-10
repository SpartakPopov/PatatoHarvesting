"""
app/main.py

FastAPI application factory.
Registers middleware and mounts all routers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import harvest

app = FastAPI(
    title="Potato Harvest API",
    description="Real-time CV + GPS data stream for the Precision Harvest Dashboard",
    version="1.0.0",
)

# Allow the Vite dev server (and any tablet browser on the LAN) to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(harvest.router)
