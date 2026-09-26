"""Sert les prototypes sans cache, pour que chaque modification se voie au simple rechargement.

    python prototypes/vue-sous-agents/serveur.py [port]
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class SansCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    gestionnaire = partial(SansCache, directory=str(Path(__file__).parent))
    print(f"http://localhost:{port}")
    ThreadingHTTPServer(("", port), gestionnaire).serve_forever()
