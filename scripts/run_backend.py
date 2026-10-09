"""Run the local HTTP/WebSocket API from the repository root."""
import os
from pathlib import Path
import sys

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import uvicorn
    uvicorn.run("config.asgi:application", host="127.0.0.1", port=8000, access_log=False)
