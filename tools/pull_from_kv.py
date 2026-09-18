# -*- coding: utf-8 -*-
"""Kéo dữ liệu từ Cloudflare KV về repo — chiều ngược của tools/push_to_kv.py.

KV là bản GỐC (mọi đăng/sửa trong /admin ghi thẳng lên KV), repo chỉ là bản sao
lưu phục vụ deploy/đường dự phòng. Đăng chương xong chạy script này để file
data/book/<slug>.json + data/registry.json theo kịp KV rồi commit.

  export ADMIN_KEY='<Secret ADMIN_KEY của Worker>'
  python3 tools/pull_from_kv.py                       # kéo registry + mọi bộ
  python3 tools/pull_from_kv.py --dry                 # chỉ xem, không ghi
  python3 tools/pull_from_kv.py --only beside-dragon  # chỉ 1 bộ (registry vẫn khớp KV)
  python3 tools/pull_from_kv.py --derived             # kéo xong sinh lại sitemap/robots + thẻ OG

--derived phải chạy SAU khi kéo: sitemap đếm số chương từ file trong repo, nên
chạy trước khi kéo là sinh từ số liệu cũ.

Ba chốt an toàn (đừng bỏ):
  1. Đọc bằng ADMIN_KEY — truyện đang khóa mật mã mà đọc kiểu khách thì Worker
     chỉ trả "vỏ rỗng" (locked:true, chapters:[]), ghi vỏ đó xuống repo là mất
     chương lúc nào không biết. Script kiểm khoá qua /api/whoami TRƯỚC khi kéo.
  2. KHÔNG BAO GIỜ ghi trường `lock` (salt + băm mật mã) vào repo công khai —
     bản đọc/admin có kèm nó, script gỡ ra trước khi ghi file.
  3. Bỏ qua bộ mà KV ÍT chương hơn repo (chiều lệch ngược — chữa bằng
     push_to_kv.py, không phải script này).

Khuôn file giữ đúng y hệt hiện trạng repo nên bộ nào không đổi thì không sinh
diff: data/book/<slug>.json = JSON nén 1 dòng, KHÔNG xuống dòng cuối;
data/registry.json = thụt 2 khoảng, có xuống dòng cuối.
"""
import argparse, json, os, re, subprocess, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def call(api, path, key=None, timeout=120):
    url = api.rstrip('/') + path
    req = urllib.request.Request(url, method='GET')
    req.add_header('User-Agent', 'Mozilla/5.0 (compatible; ssochuz-sync/1.0; +https://github.com/Chaereve/ssochuz)')
    if key:
        req.add_header('x-admin-key', key)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        raw_body = ''
        try:
            raw_body = e.read().decode(errors='replace')
            return e.code, json.loads(raw_body)
        except Exception:
            clean_body = re.sub(r'<[^>]+>', ' ', raw_body).strip()
            return e.code, {'error': ' '.join(clean_body.split())[:300] if clean_body else ('HTTP ' + str(e.code))}
    except (urllib.error.URLError, OSError) as e:
        # Không nối được Worker (DNS, TLS, hết giờ, runner bị chặn ra Internet…).
        # Trước đây văng traceback urllib — đọc trong log Actions không biết lỗi gì,
        # dễ nhầm với "khoá sai". Báo 1 dòng rõ ràng rồi dừng, không ghi gì cả.
        sys.exit('Không nối được Worker %s (%s) — kiểm tra window.CZ_API trong cz-config.js, '
                 'Worker đã deploy chưa, và máy chạy script có ra được Internet không.'
                 % (api, getattr(e, 'reason', e)))


def api_from_config():
    """Lấy URL Worker từ cz-config.js (window.CZ_API) khi không truyền --api."""
    try:
        src = open(os.path.join(ROOT, 'cz-config.js'), encoding='utf-8').read()
    except OSError:
        return ''
    m = re.search(r"window\.CZ_API\s*=\s*'([^']*)'", src)
    host = (m.group(1).strip() if m else '')
    if host and not host.startswith(('http://', 'https://')):
        host = 'https://' + host
    return host.rstrip('/')


def book_text(book):
    """Khuôn file data/book/<slug>.json: JSON nén 1 dòng, không xuống dòng cuối."""
    return json.dumps(book, ensure_ascii=False, separators=(',', ':'))


def registry_text(reg):
    """Khuôn file data/registry.json: thụt 2 khoảng + xuống dòng cuối."""
    return json.dumps(reg, ensure_ascii=False, indent=2) + '\n'


def write_if_changed(path, text, dry):
    """Chỉ ghi khi nội dung khác — trả về True nếu file (sẽ) đổi."""
    try:
        with open(path, encoding='utf-8') as f:
            if f.read() == text:
                return False
    except OSError:
        pass                                            # chưa có file → chắc chắn ghi
    if not dry:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', default=api_from_config(),
                    help='URL Worker (mặc định: đọc window.CZ_API trong cz-config.js)')
    ap.add_argument('--key', default=os.environ.get('ADMIN_KEY', ''), help='ADMIN_KEY (hoặc biến môi trường)')
    ap.add_argument('--registry', default=os.path.join(ROOT, 'data', 'registry.json'))
    ap.add_argument('--books', default=os.path.join(ROOT, 'data', 'book'))
    ap.add_argument('--only', help='chỉ kéo 1 slug (registry vẫn được khớp theo KV)')
    ap.add_argument('--dry', action='store_true', help='chỉ in ra, không ghi file')
    ap.add_argument('--derived', action='store_true',
                    help='kéo xong sinh lại sitemap.xml/robots.txt + thẻ OG (truyen/*/, _redirects)')
    a = ap.parse_args()
    if not a.api:
        sys.exit('Thiếu --api (và không đọc được window.CZ_API trong cz-config.js)')
    if not a.key:
        sys.exit('Thiếu --key (ADMIN_KEY của Worker) — BẮT BUỘC, xem chốt an toàn 1 trong ghi chú đầu file.')

    # Chuẩn hoá khoá: gỡ khoảng trắng đầu/cuối, nháy bao quanh, ký tự zero-width
    # (tránh lỗi 401/403 khi copy-paste secret trên GitHub Actions hoặc terminal)
    a.key = re.sub(r'[\u200B-\u200D\uFEFF]', '', a.key).strip().strip('\'"')
    if not a.key:
        sys.exit('ADMIN_KEY bị rỗng sau khi chuẩn hoá (chỉ toàn khoảng trắng hoặc nháy rỗng).')

    # Chốt 1: xác nhận khoá đúng TRƯỚC khi kéo. Khoá sai thì Worker trả bản khách
    # — bộ đang khóa mật mã sẽ về "vỏ rỗng" và ghi đè xuống repo là mất chương.
    st, me = call(a.api, '/api/whoami', a.key)
    if st != 200 or not me.get('ok'):
        err = me.get('error') or me.get('message') or ''
        hint = (' (%s)' % err) if err else ''
        sys.exit('ADMIN_KEY không đúng (HTTP %s%s) — dừng, không kéo/ ghi gì cả.' % (st, hint))

    st, reg = call(a.api, '/api/registry', a.key)
    if st != 200 or not isinstance(reg.get('lib'), list):
        sys.exit('Không đọc được /api/registry (HTTP %s).' % st)
    lib = [n for n in reg['lib'] if n and n.get('slug')]
    if a.only:
        lib = [n for n in lib if n['slug'] == a.only]
        if not lib:
            sys.exit('registry trên KV không có slug ' + a.only)

    reg_changed = write_if_changed(a.registry, registry_text(reg), a.dry)
    print('registry: %s (rev %s, %d bộ)' % ('ĐỔI — ghi lại' if reg_changed else 'không đổi', reg.get('rev'), len(reg['lib'])))

    n_write = n_same = n_skip = n_err = 0
    skips = []
    for i, n in enumerate(lib, 1):
        slug = n['slug']
        st, book = call(a.api, '/api/book/' + urllib.request.quote(slug, safe=''), a.key)
        path = os.path.join(a.books, slug + '.json')
        if st != 200 or not isinstance(book.get('chapters'), list):
            print('  ✗ %-40s HTTP %s — bỏ qua, file repo giữ nguyên' % (slug, st)); n_err += 1; continue
        if book.get('locked') and not book['chapters']:
            # Vỏ rỗng của bộ khóa — khoá đã qua whoami nên gần như không thể gặp;
            # gặp thì tuyệt đối không ghi đè.
            print('  ✗ %-40s KV trả vỏ RỖNG kiểu khách (locked) — bỏ qua, KHÔNG ghi' % slug); n_err += 1; continue
        kv_ch = len(book['chapters'])
        try:
            with open(path, encoding='utf-8') as f:
                repo_ch = len(json.load(f).get('chapters', []))
        except (OSError, ValueError):
            repo_ch = 0
        # Chốt 3: KV ít chương hơn repo → chiều lệch NGƯỢC, kéo về là xoá chương
        # thật trong bản sao lưu. Báo tên để chữa bằng push_to_kv.py.
        if kv_ch < repo_ch:
            skips.append('%s (KV %d < repo %d)' % (slug, kv_ch, repo_ch)); n_skip += 1; continue
        # Chốt 2: gỡ bí mật khóa mật mã trước khi ghi vào repo CÔNG KHAI. Trạng
        # khóa trên KV không đổi — web vẫn hỏi mật mã y hệt, lần nạp ngược sau
        # này (PUT thiếu `lock`) Worker cũng tự giữ khóa cũ.
        for secret_key in ('lock', 'lockUntil'):
            book.pop(secret_key, None)
        if write_if_changed(path, book_text(book), a.dry):
            print('  ✓ %-40s %s chương — ghi data/book/%s.json' % (slug, kv_ch, slug)); n_write += 1
        else:
            n_same += 1
        if i % 20 == 0:
            print('  … %d/%d bộ' % (i, len(lib)))

    print('xong: %s%d ghi · %d không đổi · %d bỏ qua · %d lỗi' %
          ('(NHÁP) ' if a.dry else '', n_write, n_same, n_skip, n_err))
    if skips:
        print('bỏ qua vì KV ÍT chương hơn repo (chữa bằng: python3 tools/push_to_kv.py --api %s --key … --only <slug>):' % a.api)
        for s in skips:
            print('  - ' + s)
    if n_err:
        sys.exit(1)

    if a.derived and (reg_changed or n_write):
        if a.dry:
            print('--dry: bỏ qua --derived (sitemap/OG sẽ sinh từ dữ liệu chưa ghi).')
        else:
            print('sinh lại sitemap.xml/robots.txt (đếm chương từ file repo vừa kéo)…')
            subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'build_sitemap.py')], check=True, cwd=ROOT)
            print('sinh lại thẻ OG tĩnh cho từng truyện (truyen/*/index.html + _redirects)…')
            subprocess.run(['node', os.path.join(ROOT, 'tools', 'build_og.mjs')], check=True, cwd=ROOT)
    elif a.derived:
        print('--derived: dữ liệu không đổi nên không cần sinh lại sitemap/OG.')
    if reg_changed or n_write:
        print('giờ commit: git add data sitemap.xml robots.txt _redirects truyen && git commit -m "đồng bộ KV → repo" && git push')


if __name__ == '__main__':
    main()
