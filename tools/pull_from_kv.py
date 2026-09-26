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
  4. (F-001/F-002) KHÔNG xuất bản sao tĩnh cho bộ ĐANG KHÓA mật mã hoặc riêng
     tư/bản nháp — nếu file tĩnh cũ còn thì XOÁ đi: Pages phục vụ /data không
     có lớp xác thực, bản sao là đường vòng đọc nội dung khóa/riêng tư.

Khuôn file giữ đúng y hệt hiện trạng repo nên bộ nào không đổi thì không sinh
diff: data/book/<slug>.json = JSON nén 1 dòng, KHÔNG xuống dòng cuối;
data/registry.json = thụt 2 khoảng, có xuống dòng cuối.
"""
import argparse, datetime, json, os, re, subprocess, sys, urllib.request, urllib.error

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


def publicly_listed(n):
    """Đúng luật isPubliclyListed của Worker (worker/cms.js): riêng tư / bản
    nháp / chưa tới giờ ra KHÔNG được xuất ra bản sao tĩnh (F-002)."""
    if not isinstance(n, dict):
        return False
    vis = str(n.get('visibility') or 'public').lower()
    if vis == 'private':
        return False
    pub = str(n.get('pubStatus') or 'published').lower()
    if pub in ('draft', 'pending_review', 'pending', 'rejected', 'archived'):
        return False
    if pub == 'scheduled':
        at = str(n.get('publishedAt') or n.get('published_at') or '')
        if not at or at > datetime.date.today().isoformat():
            return False
    return True


def drop_stale_book(path, dry, why):
    """Xoá bản sao tĩnh không còn được phép công khai (bộ khóa / riêng tư).
    Trả True nếu có file bị (sẽ bị) xoá — đường vòng đọc nội dung bị đóng."""
    if not os.path.exists(path):
        return False
    if dry:
        print('  (nháp) sẽ xoá %s — %s' % (os.path.basename(path), why))
        return True
    os.remove(path)
    print('  ✗ xoá bản sao cũ %s — %s' % (os.path.basename(path), why))
    return True


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


def fetch_bytes(api, path, key=None, timeout=120):
    """Tải NHỊ PHÂN (ảnh) — theo redirect 302 nên ảnh đang nằm trên Supabase
    Storage cũng tải được y như ảnh còn trong KV."""
    req = urllib.request.Request(api.rstrip('/') + path, method='GET')
    req.add_header('User-Agent', 'Mozilla/5.0 (compatible; ssochuz-sync/1.0)')
    if key:
        req.add_header('x-admin-key', key)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), (r.headers.get('Content-Type') or '')
    except urllib.error.HTTPError as e:
        return e.code, b'', ''
    except (urllib.error.URLError, OSError) as e:
        return 0, b'', str(getattr(e, 'reason', e))


def sniff_ext(data, ctype=''):
    """Đuôi tệp theo magic bytes — không tin Content-Type (vài CDN trả
    application/octet-stream). Trả '' nếu không phải ảnh ta giữ."""
    if data[:3] == b'\xff\xd8\xff':
        return 'jpg'
    if data[:4] == b'\x89PNG':
        return 'png'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'webp'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'gif'
    ct = (ctype or '').lower()
    for k, v in (('jpeg', 'jpg'), ('png', 'png'), ('webp', 'webp'), ('gif', 'gif')):
        if k in ct:
            return v
    return ''


IMG_REF_RE = re.compile(r'/api/img/([A-Za-z0-9_-]{8,64})')


def collect_img_ids(reg, books):
    """Mọi /api/img/<id> mà web thật đang dùng: bìa trong registry (thumb/slide/
    cover) + ảnh trong HTML chương. Sao lưu đúng tập này là đủ — ảnh không ai
    trỏ tới thì không tốn chỗ trong bản sao lưu."""
    ids = []

    def add(u):
        m = IMG_REF_RE.search(str(u or ''))
        if m and m.group(1) not in ids:
            ids.append(m.group(1))

    for n in (reg.get('lib') or []):
        if not n:
            continue
        for f in ('thumb', 'slide', 'cover'):
            add(n.get(f))
    for b in books:
        for c in (b.get('chapters') or []):
            for m in IMG_REF_RE.finditer(str((c or {}).get('html') or '')):
                if m.group(1) not in ids:
                    ids.append(m.group(1))
    return ids


def backup_images(api, key, ids, out_dir, dry):
    """Tải từng ảnh về máy (mặc định _backup/img/). Có sẵn và ĐÚNG BẰNG byte thì
    bỏ qua — chạy lại mỗi ngày không ghi lại cả kho."""
    if not ids:
        print('ảnh: không thấy /api/img/<id> nào trong registry/HTML chương — không có gì để sao lưu.')
        return 0, 0, 0
    if not dry:
        os.makedirs(out_dir, exist_ok=True)
    n_new = n_same = n_err = 0
    for i, img_id in enumerate(ids, 1):
        st, data, ctype = fetch_bytes(api, '/api/img/' + img_id, key)
        if st != 200 or not data:
            print('  ✗ %s HTTP %s %s' % (img_id, st, ctype[:60])); n_err += 1; continue
        ext = sniff_ext(data, ctype)
        if not ext:
            print('  ✗ %s không phải JPEG/PNG/WebP/GIF — bỏ qua' % img_id); n_err += 1; continue
        path = os.path.join(out_dir, img_id + '.' + ext)
        try:
            with open(path, 'rb') as f:
                if f.read() == data:
                    n_same += 1; continue
        except OSError:
            pass
        if not dry:
            with open(path, 'wb') as f:
                f.write(data)
        n_new += 1
        print('  ✓ %s.%s  %.1f KB' % (img_id, ext, len(data) / 1024))
        if i % 25 == 0:
            print('  … %d/%d ảnh' % (i, len(ids)))
    print('ảnh: %s%d mới/đổi · %d không đổi · %d lỗi  → %s' %
          ('(NHÁP) ' if dry else '', n_new, n_same, n_err, out_dir))
    return n_new, n_same, n_err


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', default=api_from_config(),
                    help='URL Worker (mặc định: đọc window.CZ_API trong cz-config.js)')
    ap.add_argument('--key', default=os.environ.get('ADMIN_KEY', ''), help='ADMIN_KEY (hoặc biến môi trường)')
    ap.add_argument('--registry', default=os.path.join(ROOT, 'data', 'registry.json'))
    ap.add_argument('--books', default=os.path.join(ROOT, 'data', 'book'))
    ap.add_argument('--only', help='chỉ kéo 1 slug (registry vẫn được khớp theo KV)')
    ap.add_argument('--dry', action='store_true', help='chỉ in ra, không ghi file')
    ap.add_argument('--images', action='store_true',
                    help='sao lưu MỌI ảnh /api/img/<id> mà web đang dùng về máy (mặc định _backup/img/)')
    ap.add_argument('--images-into', default=os.path.join(ROOT, '_backup', 'img'),
                    help='thư mục chứa bản sao lưu ảnh (mặc định _backup/img — không commit)')
    ap.add_argument('--images-only', action='store_true',
                    help='chỉ sao lưu ảnh, không kéo registry/book (nhanh, chạy hằng ngày)')
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

    # (F-002) bản static KHÔNG được mang entry riêng tư/bản nháp — đúng như
    # /api/registry công khai đã lọc; entry quản trị vẫn còn nguyên trên KV.
    lib_all = reg.get('lib') if isinstance(reg.get('lib'), list) else []
    reg_pub = dict(reg)
    reg_pub['lib'] = [n for n in lib_all if n and n.get('slug') and publicly_listed(n)]
    hidden_n = len(lib_all) - len(reg_pub['lib'])
    reg_changed = write_if_changed(a.registry, registry_text(reg_pub), a.dry)
    print('registry: %s (rev %s, %d bộ%s)' % ('ĐỔI — ghi lại' if reg_changed else 'không đổi', reg.get('rev'), len(reg_pub['lib']),
          ', ẩn %d entry riêng tư/bản nháp' % hidden_n if hidden_n else ''))

    n_write = n_same = n_skip = n_err = 0
    skips = []
    # --images-only: bỏ qua bước kéo book (chỉ muốn sao lưu ảnh cho nhanh) —
    # danh sách ảnh sẽ lấy từ data/book/*.json đang có sẵn trên đĩa.
    for i, n in enumerate([] if a.images_only else lib, 1):
        slug = n['slug']
        path = os.path.join(a.books, slug + '.json')
        # (F-002) riêng tư/bản nháp: không kéo nội dung, xoá bản sao tĩnh cũ nếu có
        if not publicly_listed(n):
            if drop_stale_book(path, a.dry, 'bộ riêng tư/bản nháp — không xuất bản sao tĩnh'):
                n_skip += 1
            continue
        st, book = call(a.api, '/api/book/' + urllib.request.quote(slug, safe=''), a.key)
        if st != 200 or not isinstance(book.get('chapters'), list):
            print('  ✗ %-40s HTTP %s — bỏ qua, file repo giữ nguyên' % (slug, st)); n_err += 1; continue
        if book.get('locked') and not book['chapters']:
            # Vỏ rỗng của bộ khóa — khoá đã qua whoami nên gần như không thể gặp;
            # gặp thì tuyệt đối không ghi đè.
            print('  ✗ %-40s KV trả vỏ RỖNG kiểu khách (locked) — bỏ qua, KHÔNG ghi' % slug); n_err += 1; continue
        # (F-001) bộ ĐANG khóa mật mã: không ghi chương ra repo — và xoá file tĩnh
        # cũ nếu có, kẻo Pages vẫn phục vụ bản sao qua /data (đường vòng khóa).
        if book.get('lock') or n.get('lock'):
            if drop_stale_book(path, a.dry, 'đang khóa mật mã — không xuất chương ra repo'):
                n_skip += 1
            continue
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

    if a.images_only:
        print('--images-only: bỏ qua kéo book, dùng data/book/*.json đang có trên đĩa.')
    else:
        print('xong: %s%d ghi · %d không đổi · %d bỏ qua · %d lỗi' %
              ('(NHÁP) ' if a.dry else '', n_write, n_same, n_skip, n_err))
    if skips and not a.images_only:
        print('bỏ qua vì KV ÍT chương hơn repo (chữa bằng: python3 tools/push_to_kv.py --api %s --key … --only <slug>):' % a.api)
        for s in skips:
            print('  - ' + s)
    if n_err and not a.images_only:
        sys.exit(1)

    if a.images:
        # Đọc lại book TỪ FILE VỪA KÉO (không gọi Worker lần nữa) để gom danh
        # sách ảnh; --images-only thì đọc bản đang có sẵn trên đĩa.
        books_for_imgs = []
        for n in lib:
            try:
                with open(os.path.join(a.books, n['slug'] + '.json'), encoding='utf-8') as f:
                    books_for_imgs.append(json.load(f))
            except (OSError, ValueError):
                pass
        ids = collect_img_ids(reg, books_for_imgs)
        print('sao lưu ảnh: thấy %d ảnh /api/img/<id> đang được dùng' % len(ids))
        backup_images(a.api, a.key, ids, a.images_into, a.dry)

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
