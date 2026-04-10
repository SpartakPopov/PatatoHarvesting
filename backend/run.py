"""
run.py

Entry point for the backend server.

Usage:
    python run.py
    python run.py --reload      # auto-reload on file change (development)
"""

import uvicorn
from app.core.config import HOST, PORT

if __name__ == "__main__":
    import sys
    reload = "--reload" in sys.argv
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=reload)
