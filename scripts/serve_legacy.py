"""Serve the legacy frontend build on loopback, with SPA route fallback."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "btrest" / "front" / "build"


class SPAHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(self.translate_path(self.path)).is_file() and "." not in self.path.rsplit("/", 1)[-1]:
            self.path = "/index.html"
        return super().do_GET()


if __name__ == "__main__":
    print("Legacy frontend: http://127.0.0.1:3000 (local only)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 3000), partial(SPAHandler, directory=str(ROOT))).serve_forever()
