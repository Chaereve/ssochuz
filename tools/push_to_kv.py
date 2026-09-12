# -*- coding: utf-8 -*-
"""Nạp dữ liệu lên Cloudflare KV qua Worker (kênh đăng mới, không cần GitHub/build).

Ví dụ:
  python3 tools/push_to_kv.py --api https://chuseoz-cms.<you>.workers.dev \
      --key "$ADMIN_KEY" --registry data/registry.json --books data/book

  # chỉ đẩy 1 bộ sau khi sửa:
  python3 tools/push_to_kv.py --api ... --key ... --books data/book --only lunar-secret

  # đồng bộ lại số chương/tình trạng từ blogspot:
  python3 tools/push_to_kv.py --api ... --key ... --sync
"""
import argparse, json, os, sys, urllib.request, urllib.error


def call(api, path, method='POST', key=None, payload=None, timeout=120):
    url = api.rstrip('/') + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('content-type', 'application/json')
    if key:
        req.add_header('x-admin-key', key)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {'raw': body[:400]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', required=True, help='URL Worker, ví dụ https://chuseoz-cms.xxx.workers.dev')
    ap.add_argument('--key', default=os.environ.get('ADMIN_KEY', ''), help='ADMIN_KEY (hoặc biến môi trường)')
    ap.add_argument('--registry', default='data/registry.json')
    ap.add_argument('--books', default='data/book')
    ap.add_argument('--only', help='chỉ đẩy 1 slug')
    ap.add_argument('--sync', action='store_true', help='gọi /api/sync để cập nhật từ blogspot')
    ap.add_argument('--health', action='store_true')
    a = ap.parse_args()

    if a.health:
        print(call(a.api, '/api/health', 'GET'))
        return
    if a.sync:
        st, body = call(a.api, '/api/sync', 'POST', a.key, {})
        print(st, json.dumps(body, ensure_ascii=False)[:600]); return
    if not a.key:
        sys.exit('Thiếu --key (ADMIN_KEY của Worker)')

    if a.only:
        slug = a.only
        path = os.path.join(a.books, slug + '.json')
        if not os.path.exists(path):
            sys.exit('không thấy ' + path)
        book = json.load(open(path, encoding='utf-8'))
        st, body = call(a.api, '/api/book/' + slug, 'PUT', a.key, book)
        print('book', slug, st, body)
        return

    registry = json.load(open(a.registry, encoding='utf-8'))
    books, total = {}, 0
    for fn in sorted(os.listdir(a.books)):
        if not fn.endswith('.json'):
            continue
        books[fn[:-5]] = json.load(open(os.path.join(a.books, fn), encoding='utf-8'))
        total += os.path.getsize(os.path.join(a.books, fn))
        if len(books) >= 8:                       # tránh payload quá lớn: đẩy theo lô 8 bộ
            st, body = call(a.api, '/api/seed', 'POST', a.key, {'books': books})
            print('lô 8 bộ ->', st, json.dumps(body, ensure_ascii=False)[:120])
            books = {}
    st, body = call(a.api, '/api/seed', 'POST', a.key, {'registry': registry, 'books': books})
    print('registry + %d bộ cuối ->' % len(books), st, json.dumps(body, ensure_ascii=False)[:200])
    print('tổng dữ liệu đẩy lên: %.1f MB' % (total / 1048576))
    print(call(a.api, '/api/health', 'GET')[1])


if __name__ == '__main__':
    main()
