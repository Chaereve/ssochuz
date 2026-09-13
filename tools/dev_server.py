#!/usr/bin/env python3
"""
chuseoz · máy chủ xem thử trên máy
================================================================
Cloudflare Pages có 3 thứ mà `python3 -m http.server` không có:
  1. Phục vụ URL sạch, không cần đuôi `.html`   (/admin  →  admin.html)
  2. TỰ BỎ đuôi `.html` bằng chuyển hướng 308    (/admin.html  →  /admin)
     ← chính điều này, ghép với `_redirects` trỏ về tệp `.html`, tạo ra vòng lặp
       ERR_TOO_MANY_REDIRECTS từng làm chết trang truyện
  3. Đọc file `_redirects` để viết lại đường dẫn (/truyen/<slug>/ → trang truyện)

Script này mô phỏng đúng 3 điều đó để bạn xem thử y như bản thật, và tự đếm số
lần nhảy: nếu `_redirects` tạo vòng lặp thì server trả 508 kèm đường đi, thay vì
để trình duyệt treo "redirected you too many times" như bản deploy.

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


def audit_redirects(rules):
    """Soi `_redirects` NGAY KHI KHỞI ĐỘNG: luật nào sẽ thành vòng lặp trên Pages.

    Cloudflare Pages tự bỏ đuôi `.html` bằng 308, nên đích của luật 200 mà là tệp
    `.html` thì URL sạch của nó rất dễ khớp ngược lại một luật khác → lặp vô hạn
    (trình duyệt báo ERR_TOO_MANY_REDIRECTS). Đây chính là lỗi từng làm chết
    trang truyện:  /truyen/* → /truyen.html → 308 → /truyen → /truyen.html → …
    """
    def matches(src, path):
        if '*' in src:
            head, _, tail = src.partition('*')
            return path.startswith(head) and path.endswith(tail)
        return src == path

    bad = []
    for src, dst, status in rules:
        d = urllib.parse.urlsplit(dst).path
        if status == '200' and re.search(r'\.html?$', d, re.I):
            clean = re.sub(r'\.html?$', '', d, flags=re.I)
            again = next((s for s, _, _ in rules if matches(s, clean)), None)
            bad.append('%s → %s %s: đích là tệp .html nên Pages sẽ 308 về %s%s'
                       % (src, dst, status, clean,
                          (' — mà %s lại khớp luật "%s" ⇒ VÒNG LẶP' % (clean, again)) if again else '')
                       + '  |  sửa thành: %s %s %s' % (src, clean, status))
    return bad


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

    def html_clean(self, url_path):
        """Cloudflare Pages (html_handling = auto-trailing-slash) TỰ đổi đường dẫn:

             /foo.html        → /foo      (308, bỏ đuôi .html)
             /foo/index.html  → /foo/     (308)
             /foo/            → /foo      (307, nếu foo là TỆP chứ không phải thư mục)

        Đây chính là mấu chốt của lỗi ERR_TOO_MANY_REDIRECTS từng làm chết trang
        truyện: _redirects proxy về "/truyen.html" thì Pages 308 sang "/truyen",
        mà "/truyen" lại proxy về "/truyen.html" — cứ thế lặp vô hạn.
        Trả về đường dẫn chuẩn, hoặc None nếu đường dẫn đã chuẩn rồi.
        """
        if url_path in ('', '/'):
            return None
        if re.search(r'/index\.html?$', url_path, re.I):
            return re.sub(r'/index\.html?$', '/', url_path, flags=re.I)
        if re.search(r'\.html?$', url_path, re.I):
            return re.sub(r'\.html?$', '', url_path, flags=re.I)
        if url_path.endswith('/') and len(url_path) > 1:
            bare = url_path.rstrip('/')
            if not os.path.isdir(os.path.join(ROOT, bare.lstrip('/'))):
                return bare
        return None

    def route(self, url_path, query):
        """Chạy đúng trình tự của Cloudflare Pages: _redirects → xử lý HTML → tệp thật.

        Quan trọng: đích của luật 200 cũng bị xử lý HTML như một yêu cầu mới
        (Pages làm vậy thật, nên mới sinh ra vòng lặp). Mình đếm số lần nhảy và
        bắt vòng lặp ngay trong server — thay vì để trình duyệt treo như bản thật.
        """
        seen = []
        pending = None      # bước 308 "bỏ đuôi .html" mà Pages sẽ gửi cho trình duyệt
        p = url_path
        for _ in range(12):
            if p in seen:
                return ('loop', seen + [p])
            seen.append(p)
            dst, status = self.rewrite(p)
            if dst:
                d = urllib.parse.urlsplit(dst)
                if status == '200':                       # proxy: viết lại rồi đi tiếp
                    query = d.query or query
                    p = d.path
                    continue
                if status in ('301', '302', '303', '307', '308'):
                    loc = dst if d.query or not query else dst + '?' + query
                    return ('redirect', int(status), loc)
            clean = self.html_clean(p)                    # Pages tự bỏ .html / dấu / thừa
            if clean and clean != p:
                if pending is None:
                    pending = ('redirect', 308, clean + (('?' + query) if query else ''))
                p = clean                                 # đi tiếp để xem có quay lại không
                continue
            full, rel = self.find_file(p)
            if full:
                return pending or ('file', full, rel)
            return pending or ('miss', None)
        return ('loop', seen)

    def send_loop(self, chain):
        """Vòng lặp redirect: trả 508 kèm đường đi để biết sửa chỗ nào."""
        body = ('<h1>508 · Vòng lặp chuyển hướng trong _redirects</h1>'
                '<p>Đường đi: <code>' + ' → '.join(chain) + ' → …</code></p>'
                '<p>Đích của luật 200 KHÔNG ĐƯỢC là tệp <code>.html</code>: Cloudflare Pages '
                'tự bỏ đuôi <code>.html</code> (308) nên sẽ quay lại đúng luật vừa khớp.</p>'
                '<p>Ví dụ sai: <code>/truyen/*  /truyen.html  200</code><br>'
                'Viết đúng: <code>/truyen/*  /truyen  200</code></p>').encode('utf-8')
        self.send_response(508)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

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
        split = urllib.parse.urlsplit(self.path)
        res = self.route(split.path, split.query)
        kind = res[0]
        if kind == 'file':
            return self.send_file(res[1], res[2], head_only)
        if kind == 'redirect':
            self.send_response(res[1])
            self.send_header('Location', res[2])
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if kind == 'loop':
            return self.send_loop(res[1])
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
    for w in audit_redirects(Handler.rules):
        print('  ⚠ _redirects SAI:', w)
    if not audit_redirects(Handler.rules):
        print('  · _redirects: không có luật nào dễ thành vòng lặp ✓')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\n· dừng')


if __name__ == '__main__':
    main()
