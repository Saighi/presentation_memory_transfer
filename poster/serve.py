"""Serve the poster with caching off: python poster/serve.py  ->  http://localhost:8770/poster/poster.html"""

import sys
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from serve import NoCacheHandler  # noqa: E402

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
with ThreadingHTTPServer(("", port), partial(NoCacheHandler, directory=str(ROOT))) as server:
    print(f"poster: http://localhost:{port}/poster/poster.html")
    server.serve_forever()
