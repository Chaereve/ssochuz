#!/usr/bin/env python3
import http.server, os, urllib.parse
from pathlib import Path

ROOT = Path(__file__).parent

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path

        # Normalize
        if path == "/":
            return self.serve_file("index.html")
        if path.startswith("/truyen/"):
            # /truyen/<slug>/ -> truyen.html
            return self.serve_file("truyen.html")
        if path == "/guide" or path == "/guide/":
            return self.serve_file("guide.html")
        if path == "/admin" or path == "/admin/":
            return self.serve_file("admin.html")
        # For /data, /css, /js etc, serve as static
        # Remove leading /
        rel = path.lstrip("/")
        # If file exists, serve it
        fpath = ROOT / rel
        if fpath.is_file():
            return super().do_GET()
        # If directory and has index.html
        if fpath.is_dir() and (fpath / "index.html").is_file():
            self.path = path.rstrip("/") + "/index.html"
            return super().do_GET()
        # Fallback: try to serve as is, if not found, return 404 but for SPA routes
        # For /truyen without trailing slash
        if path.startswith("/truyen"):
            return self.serve_file("truyen.html")
        return super().do_GET()

    def serve_file(self, filename):
        self.path = "/" + filename
        return super().do_GET()

    def end_headers(self):
        # No cache for html to avoid stale footer
        if self.path.endswith(".html") or self.path.endswith("/"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

if __name__ == "__main__":
    os.chdir(ROOT)
    addr = ("0.0.0.0", 8000)
    httpd = http.server.HTTPServer(addr, Handler)
    print(f"Serving {ROOT} on http://{addr[0]}:{addr[1]}")
    httpd.serve_forever()
