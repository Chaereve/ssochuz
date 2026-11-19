# -*- coding: utf-8 -*-
"""XÓA couple bị ghi nhầm thành link (worker Cloudflare / URL) trên KV.

Lỗi: vài bộ bị ghi nhầm mục `couple` thành link Worker
(https://<x>.workers.dev) hoặc URL ảnh. Repo (data/registry.json) thường đã
sạch, nhưng KV — bản GỐC — vẫn giữ giá trị sai, nên trang chủ hiện couple là
link. Script này KHÔNG đẩy toàn bộ repo lên KV (dễ regression): nó ĐỌC registry
hiện tại từ KV, chỉ clear `couple` của các entry mà couple trông là URL
(http(s)://, //, /api/, hoặc chứa workers.dev), rồi ghi LẠI toàn bộ registry
đã sửa — mọi dữ liệu khác trên KV được giữ nguyên.

  export ADMIN_KEY='<Secret ADMIN_KEY của Worker>'
  python3 tools/fix_couple_url.py --dry          # chỉ in entry sẽ clear, không ghi
  python3 tools/fix_couple_url.py                # ghi lại registry lên KV
  python3 tools/fix_couple_url.py --key KEY      # hoặc truyền key trực tiếp

 couple là trườngdanh sách couple; nếu couple bị ghi nhầm thành URL thì clear
 về ''. Trường `couples` (danh sách nhiều couple) KHÔNG bị động đến — chỉ clear
 `couple` khi chính nó là URL.
"""
import argparse, json, os, re, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL_COUPLE_RE = re.compile(r'^(https?://|//|/api/|[^ ]*workers\.dev)', re.I)


def api_from_config():
    try:
        src = open(os.path.join(ROOT, 'cz-config.js'), encoding='utf-8').read()
    except OSError:
        return ''
    m = re.search(r"window\.CZ_API\s*=\s*'([^']*)'", src)
    host = (m.group(1).strip() if m else '')
    if host and not host.startswith(('http://', 'https://')):
        host = 'https://' + host
    return host.rstrip('/')


def http(method, url, key=None, body=None, timeout=60):
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; ssochuz-sync/1.0)'}
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    if key:
        headers['x-admin-key'] = key
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode() or '{}'
            return r.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors='replace')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'error': ' '.join(raw.split())[:300]}
    except (urllib.error.URLError, OSError) as e:
        sys.exit('Không nối được Worker (%s) — kiểm tra CZ_API trong cz-config.js '
                 'và máy có ra Internet.' % getattr(e, 'reason', e))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', default=api_from_config(), help='URL Worker (mặc định: CZ_API)')
    ap.add_argument('--key', default=os.environ.get('ADMIN_KEY', ''), help='ADMIN_KEY')
    ap.add_argument('--dry', action='store_true', help='chỉ in, không ghi')
    args = ap.parse_args()
    api = args.api.rstrip('/')
    if not api:
        sys.exit('Không xác định URL Worker — truyền --api hoặc đặt CZ_API trong cz-config.js.')

    # Đọc registry HIỆN TẠI từ KV (công khai, không cần key).
    st, reg = http('GET', api + '/api/registry')
    if st != 200 or not isinstance(reg, dict):
        sys.exit('Không đọc được registry từ KV: HTTP %s %s' % (st, reg))
    lib = reg.get('lib') or []

    fixed = []
    for n in lib:
        c = n.get('couple')
        if isinstance(c, str) and c.strip() and URL_COUPLE_RE.search(c.strip()):
            fixed.append((n.get('slug'), n.get('title'), c))
            n['couple'] = ''

    if not fixed:
        print('Không có entry nào bị couple ghi nhầm thành link — KV đã sạch.')
        return

    print('Found %d entry(s) with couple wrongly set to a URL/link:' % len(fixed))
    for s, t, c in fixed:
        print('  - %s | %s | couple = %s → clear' % (s, t, c))

    if args.dry:
        print('\n[dry] Chưa ghi. Chạy WITHOUT --dry (với ADMIN_KEY) để ghi lại registry lên KV.')
        return

    if not args.key:
        sys.exit('Thiếu ADMIN_KEY — không ghi được KV. Đặt ADMIN_KEY trong env hoặc --key, '
                 'HOẶC chạy --dry rồi clear couple trong /admin (Sửa bộ → Couple → Lưu).')

    # Ghi LẠI toàn bộ registry (đã clear couple) — giữ nguyên mọi field khác trên KV.
    st, r = http('PUT', api + '/api/registry', key=args.key, body=reg)
    if st != 200 or not (r or {}).get('ok', True):
        sys.exit('Ghi KV thất bại: HTTP %s %s' % (st, r))
    print('\nĐã ghi lại registry lên KV, clear couple của %d entry.' % len(fixed))


if __name__ == '__main__':
    main()
