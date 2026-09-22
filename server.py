#!/usr/bin/env python3
import http.server, os, urllib.parse
from pathlib import Path

ROOT = Path(__file__).parent

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path
        # Decode for routing checks
        dec_path = urllib.parse.unquote(path)

        # Normalize
        if path == "/" or dec_path == "/":
            return self.serve_file("index.html")
        # /truyen/<slug>/ -> truyen.html (handle encoded too)
        if dec_path.startswith("/truyen/") or path.startswith("/truyen/"):
            return self.serve_file("truyen.html")
        # /truyen without slash or /truyen.html
        if dec_path in ("/truyen", "/truyen.html") or path in ("/truyen", "/truyen.html"):
            # If query has slug, still serve truyen.html, else serve truyen.html as fallback for SPA
            # Actually /truyen alone without slug should still show story page with error handling in JS,
            # but we serve truyen.html for SPA routing
            return self.serve_file("truyen.html")
        if dec_path.startswith("/reader/") or path.startswith("/reader/") or dec_path in ("/reader", "/reader.html") or path in ("/reader", "/reader.html"):
            return self.serve_file("truyen.html")
        if dec_path == "/guide" or dec_path == "/guide/" or path == "/guide" or path == "/guide/":
            return self.serve_file("guide.html")
        if dec_path.startswith("/guide/"):
            return self.serve_file("guide.html")
        if dec_path == "/admin" or dec_path == "/admin/" or path == "/admin" or path == "/admin/":
            return self.serve_file("admin.html")
        if dec_path in ("/admin-v2", "/admin-v2/") or path in ("/admin-v2", "/admin-v2/"):
            return self.serve_file("admin-v2.html")
        if dec_path.rstrip('/') in ('/my-space', '/profile'):
            return self.serve_file(dec_path.strip('/') + '.html')
        # For /data, /css, /js etc, serve as static
        # Remove leading /
        rel = path.lstrip("/")
        # Decode rel for file existence but keep encoded for super
        rel_dec = urllib.parse.unquote(rel)
        fpath = ROOT / rel_dec
        fpath_enc = ROOT / rel
        if fpath.is_file() or fpath_enc.is_file():
            return super().do_GET()
        # If directory and has index.html
        if fpath.is_dir() and (fpath / "index.html").is_file():
            self.path = path.rstrip("/") + "/index.html"
            return super().do_GET()
        # Fallback SPA routes
        if dec_path.startswith("/truyen") or path.startswith("/truyen"):
            return self.serve_file("truyen.html")
        return super().do_GET()

    def serve_file(self, filename):
        self.path = "/" + filename
        return super().do_GET()

    def end_headers(self):
        # No cache for html/css/js so preview shows latest UI
        if self.path.endswith((".html", ".css", ".js")) or self.path.endswith("/"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

if __name__ == "__main__":
    os.chdir(ROOT)
    addr = ("0.0.0.0", 8000)
    httpd = http.server.HTTPServer(addr, Handler)
    print(f"Serving {ROOT} on http://{addr[0]}:{addr[1]}")
    httpd.serve_forever()
