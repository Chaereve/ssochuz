# -*- coding: utf-8 -*-
"""Nạp dữ liệu lên Cloudflare KV qua Worker (kênh đăng mới, không cần GitHub/build).

Ví dụ:
  python3 tools/push_to_kv.py --api https://chuseoz-cms.<you>.workers.dev \
      --key "$ADMIN_KEY" --registry data/registry.json --books data/book

  # chỉ đẩy 1 bộ sau khi sửa:
  python3 tools/push_to_kv.py --api ... --key ... --books data/book --only lunar-secret

  # đồng bộ lại số chương/tình trạng từ blogspot:
  python3 tools/push_to_kv.py --api ... --key ... --sync

  # số liệu xếp hạng (lượt đọc/bình chọn) — giờ nằm trên KV, không cần Firebase:
  python3 tools/push_to_kv.py --api ... --stats                      # xem số đang có
  python3 tools/push_to_kv.py --api ... --key ... --import-firebase  # kéo số CŨ về KV 1 lần
  python3 tools/push_to_kv.py --api ... --key ... --stats-seed so-lieu-cu.json
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
    ap.add_argument('--auth', action='store_true', help='kiểm tra ADMIN_KEY có đúng không')
    ap.add_argument('--verify', action='store_true',
                    help='so sánh dữ liệu trên KV với file trong repo (không ghi gì)')
    ap.add_argument('--import-firebase', action='store_true',
                    help='kéo số lượt đọc/bình chọn CŨ từ Firestore về KV (làm 1 lần)')
    ap.add_argument('--stats-seed',
                    help='nạp số liệu cũ từ file JSON: {slug:{views,votes}} hoặc bản export Firestore')
    ap.add_argument('--stats', action='store_true', help='xem số liệu xếp hạng đang có trên KV')
    a = ap.parse_args()

    if a.health:
        print(call(a.api, '/api/health', 'GET'))
        return
    if a.auth:
        print(call(a.api, '/api/whoami', 'GET', a.key))
        return
    if a.sync:
        st, body = call(a.api, '/api/sync', 'POST', a.key, {})
        print(st, json.dumps(body, ensure_ascii=False)[:600]); return
    if a.stats:
        st, body = call(a.api, '/api/stats', 'GET')
        items = body.get('items', {})
        print('nguồn:', body.get('source'), '| số bộ:', len(items),
              '| tổng lượt đọc:', sum(v.get('views', 0) for v in items.values()),
              '| tổng phiếu:', sum(v.get('votes', 0) for v in items.values()))
        for slug, v in sorted(items.items(), key=lambda kv: -kv[1].get('views', 0))[:15]:
            print('  %-40s đọc %6s  phiếu %5s  (tuần: đọc %s / phiếu %s)' % (
                slug, v.get('views', 0), v.get('votes', 0), v.get('viewsWeek', 0), v.get('votesWeek', 0)))
        return
    if a.import_firebase:
        if not a.key:
            sys.exit('Thiếu --key (ADMIN_KEY của Worker)')
        st, body = call(a.api, '/api/stats/import-firebase', 'POST', a.key, {})
        print(st, json.dumps(body, ensure_ascii=False)[:400]); return
    if a.stats_seed:
        if not a.key:
            sys.exit('Thiếu --key (ADMIN_KEY của Worker)')
        raw = json.load(open(a.stats_seed, encoding='utf-8'))
        items = {}
        if isinstance(raw, dict) and raw.get('documents'):        # bản export Firestore REST
            for doc in raw['documents']:
                slug = doc['name'].rstrip('/').split('/')[-1].replace('.html', '')
                f = doc.get('fields', {})
                num = lambda k: int(float(f.get(k, {}).get('integerValue', f.get(k, {}).get('doubleValue', 0)) or 0))
                items[slug] = {'views': num('views'), 'votes': num('votes')}
        else:                                                     # {slug: {views, votes}}
            for slug, v in raw.items():
                items[slug] = {'views': int(v.get('views', 0) or 0), 'votes': int(v.get('votes', 0) or 0)}
        st, body = call(a.api, '/api/stats/seed', 'POST', a.key, {'items': items})
        print(st, json.dumps(body, ensure_ascii=False)[:300])
        print('đã nạp số cũ của %d bộ — chạy lại bao nhiêu lần cũng không cộng dồn' % len(items))
        return
    if not a.key:
        sys.exit('Thiếu --key (ADMIN_KEY của Worker)')

    if a.verify:                                  # kiểm tra khớp giữa KV và repo
        st, reg_kv = call(a.api, '/api/registry', 'GET')
        reg_loc = json.load(open(a.registry, encoding='utf-8'))
        print('registry: KV %s | repo %s | lib %s vs %s' % (
            reg_kv.get('rev'), reg_loc.get('rev'),
            len(reg_kv.get('lib', [])), len(reg_loc.get('lib', []))))
        diff = 0
        for n in reg_loc.get('lib', []):
            slug = n['slug']
            st, bk = call(a.api, '/api/book/' + slug, 'GET')
            loc = os.path.join(a.books, slug + '.json')
            lc = len(json.load(open(loc, encoding='utf-8')).get('chapters', [])) if os.path.exists(loc) else 0
            kc = len(bk.get('chapters', [])) if st == 200 else -1
            if kc != lc:
                # hai chiều lệch chữa NGƯỢC nhau — nói rõ để không push đè làm mất chương
                if kc > lc:
                    fix = ('KV nhiều hơn repo: chương đăng trong trang quản trị chưa được lưu về file. '
                           'Lấy bản KV về ghi đè data/book/%s.json rồi commit — ĐỪNG chạy --only %s '
                           '(push repo lên KV sẽ xoá %d chương đã đăng).' % (slug, slug, kc - lc))
                else:
                    fix = ('repo nhiều hơn KV: sửa file xong chưa nạp lên KV — '
                           'chạy --only %s (hoặc /admin → Bác sĩ dữ liệu → Nạp chương từ repo lên KV).' % slug)
                print('  LỆCH %-42s KV=%s repo=%s\n        %s' % (slug, kc, lc, fix)); diff += 1
        print('xong — %d bộ lệch' % diff)
        return

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
