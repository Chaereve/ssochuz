#!/usr/bin/env python3
"""make_stickers.py · tải sticker Fluent Emoji (bản 3D) → WebP tối ưu

VÌ SAO: hàng reaction cuối chương cần sticker THẬT (không phải emoji Unicode),
có cảm giác "sticker dán" — viền trắng, dày, bóng nhẹ. Bộ asset dùng ở đây là
Microsoft Fluent Emoji (MIT), bản 3D: vẽ đẹp, dễ thương, đồng bộ một phong cách.

CHẠY TAY, KHÔNG chạy trong build (npm run build / CI đều không cần mạng):
    python3 tools/make_stickers.py               # 128px, quality 82
    python3 tools/make_stickers.py --size 160 --quality 88
Sản phẩm đã commit sẵn trong assets/stickers/*.webp — chỉ chạy lại khi muốn
đổi/thêm sticker. Cần: Python 3 + Pillow (có libwebp).

Muốn đổi sticker của một reaction: sửa STICKERS dưới đây rồi chạy lại, sau đó
khai `asset`/`asset_dark` mới trong src/cz-react.js (khối REACTIONS).
"""
import argparse
import base64
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'stickers')

# id sticker → đường dẫn trong microsoft/fluentui-emoji (kết thúc bằng thư mục
# chứa PNG). Emoji có biến thể màu da nằm thêm một tầng Default/3D.
STICKERS = {
    'mu-bao-hiem':  'Military helmet/3D',      # Đội mũ bảo hiểm gấp
    'ngot-lim':     'Cupcake/3D',              # Tiểu đường rồi
    'gach-da':      'Brick/3D',                # Gửi gạch đá cho tác giả
    'cham-kem':     'Loudly crying face/3D',   # Chầm kẽm
    'cay-nhu-trau': 'Ox/3D',                   # Cày như trâu
    'xin-chuong':   'Folded hands/Default/3D', # Cho xin chương nữa
}

API = 'https://api.github.com/repos/microsoft/fluentui-emoji/contents/assets/'

CREDITS = """Sticker trong thư mục này lấy từ Microsoft Fluent Emoji (bản 3D):
  https://github.com/microsoft/fluentui-emoji
Giấy phép MIT — Copyright (c) Microsoft Corporation.
Nguồn từng tệp (đã thu nhỏ về {size}px, xuất WebP quality {quality}):
{rows}
Tạo lại bằng: python3 tools/make_stickers.py --size {size} --quality {quality}
Xem đầy đủ nội dung giấy phép ở THIRD-PARTY-NOTICES.md (mục "Microsoft Fluent Emoji").
"""


def api_json(url):
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={'User-Agent': 'ssochuz-sticker-tool'})
    with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
        return json.loads(r.read().decode('utf8'))


def fetch_png(path):
    """Lấy tệp PNG bản 3D của một emoji (Contents API trả base64)."""
    items = api_json(API + '/'.join(urllib.parse.quote(p) for p in path.split('/')))
    if not isinstance(items, list):
        raise SystemExit('đường dẫn lạ trong repo Fluent Emoji: ' + path)
    png = [x for x in items if x.get('name', '').endswith('.png')]
    if not png:
        raise SystemExit('không thấy PNG cho: ' + path)
    item = api_json(API + '/'.join(urllib.parse.quote(p) for p in (path + '/' + png[0]['name']).split('/')))
    return base64.b64decode(item['content']), png[0]['name'], png[0].get('size', 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=128, help='cạnh dài nhất sau khi thu nhỏ (mặc định 128)')
    ap.add_argument('--quality', type=int, default=82, help='chất lượng WebP (mặc định 82)')
    args = ap.parse_args()

    try:
        from PIL import Image
        if not __import__('PIL.features', fromlist=['features']).check('webp'):
            raise SystemExit('Pillow thiếu libwebp — cài: pip install --upgrade pillow')
    except ImportError:
        raise SystemExit('Thiếu Pillow — cài: pip install pillow')

    os.makedirs(OUT_DIR, exist_ok=True)
    rows, total = [], 0
    for slug, path in STICKERS.items():
        raw, name, bytes_in = fetch_png(path)
        tmp = os.path.join(OUT_DIR, '.tmp-' + slug)
        with open(tmp, 'wb') as f:
            f.write(raw)
        out = os.path.join(OUT_DIR, slug + '.webp')
        with Image.open(tmp) as im:
            im = im.convert('RGBA')
            im.thumbnail((args.size, args.size), Image.LANCZOS)
            im.save(out, 'WEBP', quality=args.quality, method=6)
        os.remove(tmp)
        size = os.path.getsize(out)
        total += size
        rows.append('  · {:<14} {:<40} → {:<16} {:>6} B (nguồn {:>6} B)'.format(
            slug, path + '/' + name, slug + '.webp', size, bytes_in))
        print(rows[-1])

    with open(os.path.join(OUT_DIR, 'CREDITS.txt'), 'w') as f:
        f.write(CREDITS.format(size=args.size, quality=args.quality, rows='\n'.join(rows)))
    print('Tổng: {:.1f} kB/{:d} sticker → {}'.format(total / 1024.0, len(rows), OUT_DIR))
    return 0


if __name__ == '__main__':
    sys.exit(main())
