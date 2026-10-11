"""Serve the deck with caching off, so a reload always picks up edited files.

    python tools/serve.py            # http://localhost:8765
    python tools/serve.py 8000

Plain `python -m http.server` sends no cache headers, so browsers keep old copies of
css/ and js/ files for a while (up to ~10 % of their age since last modified) even after F5:
an edit to deck.js or a player can look like it "did not work".
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SLIDES = Path(__file__).resolve().parents[1] / "slides"


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = partial(NoCacheHandler, directory=str(SLIDES))
    with ThreadingHTTPServer(("", port), handler) as server:
        print(f"deck: http://localhost:{port}  (Ctrl+C to stop)")
        server.serve_forever()


if __name__ == "__main__":
    main()
