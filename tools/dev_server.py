#!/usr/bin/env python3
"""
chuseoz · máy chủ xem thử trên máy
================================================================
Cloudflare Pages có 2 thứ mà `python3 -m http.server` không có:
  1. Bỏ phần `.html` trên URL  (/admin  →  admin.html)
  2. Đọc file `_redirects` để viết lại đường dẫn (/truyen/<slug>/ → truyen.html)

Script này mô phỏng đúng 2 điều đó để bạn xem thử y như bản thật:

    python3 tools/dev_server.py                 # mở http://localhost:8080
    python3 tools/dev_server.py --port 9000
    python3 tools/dev_server.py --api           # gọi thẳng Worker thật (cần mạng)
    python3 tools/dev_server.py --api https://chuseoz-cms.xxx.workers.dev

Mặc định server TẮT Worker (window.CZ_API='') để trang chạy hoàn toàn bằng dữ
liệu tĩnh trong /data — đúng tình huống khi bạn chưa nối KV.
"""
import argparse
import json
import os
import posixpath
import re
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
    '.woff2': 'font/woff2', '.csv': 'text/csv; charset=utf-8',
}


def load_redirects():
    """Đọc _redirects của Cloudflare Pages:  <từ>  <đến>  [mã]"""
    rules = []
    path = os.path.join(ROOT, '_redirects')
    if not os.path.exists(path):
        return rules
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.split('#')[0].strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            src, dst = parts[0], parts[1]
            status = parts[2] if len(parts) > 2 else '302'
            rules.append((src, dst, status))
    return rules


class Handler(SimpleHTTPRequestHandler):
    rules = []
    api = None            # None = tắt Worker, '' = tắt, 'URL' = dùng
    quiet = False

    def log_message(self, fmt, *args):
        if not self.quiet:
            sys.stderr.write('  %s\n' % (fmt % args))

    # ---------- tìm file thật trên đĩa ----------
    def find_file(self, url_path):
        p = urllib.parse.unquote(url_path)
        p = posixpath.normpath(p).lstrip('/')
        if p in ('', '.'):
            p = 'index.html'
        full = os.path.join(ROOT, p)
        if os.path.isdir(full):
            for cand in ('index.html', 'index.htm'):
                if os.path.exists(os.path.join(full, cand)):
                    return os.path.join(full, cand), p.rstrip('/') + '/' + cand
            return None, None
        if os.path.isfile(full):
            return full, p
        # Cloudflare Pages: /admin  →  admin.html
        if not os.path.splitext(p)[1] and os.path.isfile(full + '.html'):
            return full + '.html', p + '.html'
        if os.path.isfile(full + '/index.html'):
            return full + '/index.html', p + '/index.html'
        return None, None

    def rewrite(self, url_path):
        """Áp dụng _redirects. Trả về (đường_dẫn_mới, mã) hoặc (None, 0)."""
        for src, dst, status in self.rules:
            if '*' in src:
                head, _, tail = src.partition('*')
                if url_path.startswith(head) and url_path.endswith(tail):
                    mid = url_path[len(head):len(url_path) - len(tail) if tail else None]
                    out = dst.replace(':splat', mid)
                    return out, status
            elif src == url_path:
                return dst, status
        return None, 0

    def send_file(self, full, rel, head_only=False, extra_headers=None):
        try:
            with open(full, 'rb') as f:
                body = f.read()
        except OSError:
            self.send_error(404, 'Not Found')
            return
        ext = os.path.splitext(full)[1].lower()
        ctype = MIME.get(ext, 'application/octet-stream')
        if ext == '.html':
            body = self.inject(body)
            body = body.replace(b'__DEV_LIVE__', b'')
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')      # luôn thấy bản mới khi F5
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def inject(self, body):
        """Bơm cấu hình chạy-thử vào HTML."""
        try:
            html = body.decode('utf-8')
        except UnicodeDecodeError:
            return body
        api = self.api if self.api is not None else ''
        cfg = json.dumps(api)
        patch = ('<script>/* chuseoz dev server */'
                 'window.CZ_API=%s;window.CZ_DEV=true;</script>' % cfg)
        if '/cz-config.js' in html:
            html = html.replace('<script src="/cz-config.js"></script>', patch, 1)
        else:
            html = html.replace('</head>', patch + '</head>', 1)
        # hiện nhãn nhỏ cho biết đang chạy bản xem thử
        html = html.replace('</body>',
                            '<div style="position:fixed;left:10px;bottom:10px;z-index:99;'
                            'font:11px/1.4 system-ui;padding:5px 9px;border-radius:99px;'
                            'background:rgba(20,16,24,.82);color:#ffb3c7;border:1px solid rgba(255,255,255,.14)">'
                            'xem thử trên máy · dữ liệu %s</div></body>' % ('Worker (KV)' if api else 'tĩnh /data'))
        return html.encode('utf-8')

    # ---------- HTTP ----------
    def do_GET(self):
        self.serve(False)

    def do_HEAD(self):
        self.serve(True)

    def serve(self, head_only):
        raw = self.path
        split = urllib.parse.urlsplit(raw)
        url_path = split.path
        # 1) _redirects trước (giống Cloudflare Pages)
        dst, status = self.rewrite(url_path)
        if dst and status in ('200', '301', '302', '303', '307', '308'):
            if dst.startswith('http'):
                self.send_response(302)
                self.send_header('Location', dst)
                self.end_headers()
                return
            if status == '200':
                full, rel = self.find_file(dst)
                if full:
                    # giữ nguyên query để trang tự đọc ?slug=…
                    return self.send_file(full, rel, head_only)
                self.send_error(404, 'rewrite target missing: ' + dst)
                return
            if split.query:                      # Cloudflare giữ nguyên query khi chuyển hướng
                dst += ('&' if '?' in dst else '?') + split.query
            self.send_response(int(status))
            self.send_header('Location', dst)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        # 2) file/href thật
        full, rel = self.find_file(url_path)
        if full:
            return self.send_file(full, rel, head_only)
        self.send_error(404, 'Not Found')


def main():
    ap = argparse.ArgumentParser(description='chuseoz · xem thử trên máy (giống Cloudflare Pages)')
    ap.add_argument('--port', type=int, default=8080)
    ap.add_argument('--host', default='0.0.0.0')
    ap.add_argument('--api', nargs='?', const='__CFG__', default=None,
                    help="dùng Worker thật để lấy dữ liệu KV (mặc định: tắt, dùng /data)")
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()

    api = None
    if args.api == '__CFG__':
        try:
            txt = open(os.path.join(ROOT, 'cz-config.js'), encoding='utf-8').read()
            m = re.search(r"CZ_API\s*=\s*'([^']*)'", txt)
            api = (m.group(1) if m else '').strip()
            if api and not api.startswith('http'):
                api = 'https://' + api
        except OSError:
            api = ''
        print('· Đọc Worker từ cz-config.js:', api or '(trống → dùng /data)')
    elif args.api:
        api = args.api
    else:
        api = ''

    Handler.rules = load_redirects()
    Handler.api = api
    Handler.quiet = args.quiet
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print('chuseoz · xem thử trên máy — http://localhost:%d' % args.port)
    print('  · thư mục gốc:', ROOT)
    print('  · nguồn dữ liệu:', 'Worker KV ' + api if api else 'file tĩnh /data')
    print('  · viết lại đường dẫn:', ', '.join('%s → %s %s' % r for r in Handler.rules) or '(không có)')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\n· dừng')


if __name__ == '__main__':
    main()
