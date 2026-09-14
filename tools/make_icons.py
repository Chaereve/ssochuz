#!/usr/bin/env python3
"""Bộ icon của ssochuz library (favicon PNG + ICO + favicon.svg).

    python3 tools/make_icons.py                      # vẽ icon mặc định (sách + trái tim)
    python3 tools/make_icons.py duong/dan/icon.png   # DÙNG ẢNH BẠN GỬI (khuyên dùng)

Ảnh nguồn: PNG vuông ≥ 512×512 là đẹp nhất. Ảnh chữ nhật vẫn chạy — script tự
cắt giữa cho vuông. Nhận .png/.jpg/.jpeg/.webp/.gif. Riêng .svg cần cairosvg
hoặc rsvg-convert trên máy; thiếu thì mở SVG bằng trình duyệt, xuất PNG
512×512 rồi chạy lại lệnh này.

Khi bạn truyền ảnh nguồn, script lưu luôn một bản vào assets/icon-source.png
(hoặc .svg nếu nguồn là SVG) để lần sau chỉ cần chạy `python3 tools/make_icons.py`
là ra lại đủ bộ icon — không phải tìm lại file gốc.
"""
import base64
import io
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, 'assets')
os.makedirs(OUT, exist_ok=True)

BG = (166, 58, 82, 255)          # #a63a52 — màu mực của web
WHITE = (255, 255, 255, 255)
WHITE_R = (255, 255, 255, 230)   # trang phải, hơi trầm như fill-opacity .9

SIZES = [(512, 'favicon-512.png'), (192, 'favicon-192.png'), (180, 'apple-touch-icon.png'),
         (64, 'favicon-64.png'), (32, 'favicon-32.png'), (16, 'favicon-16.png')]
SOURCE_NAMES = ['icon-source.png', 'icon-source.jpg', 'icon-source.jpeg',
                'icon-source.webp', 'icon-source.svg']


def need_pillow():
    try:
        from PIL import Image  # noqa: F401
        return True
    except Exception:
        sys.stderr.write(
            'Cần thư viện Pillow:  python3 -m pip install pillow\n'
            '(hoặc dùng ImageMagick:  convert favicon-512.png -resize 192x192 favicon-192.png …)\n')
        return False


# ----------------------------- icon mặc định --------------------------------
def draw(size):
    from PIL import Image, ImageDraw
    S = size
    u = S / 64.0
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=14 * u, fill=BG)              # nền bo góc
    d.rounded_rectangle([11 * u, 15 * u, 32 * u, 46 * u], radius=4 * u, fill=WHITE)   # trang trái
    d.rounded_rectangle([32 * u, 15 * u, 53 * u, 46 * u], radius=4 * u, fill=WHITE_R)  # trang phải
    r = 4.5 * u
    cy = 31.6 * u
    cx = 32 * u
    d.ellipse([cx - 1.9 * r, cy - r, cx + .1 * r, cy + r], fill=BG)                # trái tim ở gáy sách:
    d.ellipse([cx - .1 * r, cy - r, cx + 1.9 * r, cy + r], fill=BG)                # hai vòng chồng nhau
    d.polygon([(cx - 1.75 * r, cy + .2 * r), (cx + 1.75 * r, cy + .2 * r), (cx, cy + 2.9 * r)], fill=BG)
    return img


# ------------------------------- ảnh nguồn ----------------------------------
def svg_to_png(path):
    """SVG → PNG tạm (cairosvg nếu có, không thì rsvg-convert / inkscape)."""
    try:
        import cairosvg
        png = cairosvg.svg2png(url=path, output_width=1024, output_height=1024)
        return io.BytesIO(png)
    except Exception:
        pass
    for tool, args in (('rsvg-convert', ['-w', '1024', '-h', '1024', '-o', '{out}', '{src}']),
                       ('inkscape', ['{src}', '-w', '1024', '-h', '1024', '-o', '{out}']),
                       ('convert', ['-background', 'none', '-density', '384', '{src}', '-resize', '1024x1024', '{out}'])):
        exe = shutil.which(tool)
        if not exe:
            continue
        tmp = os.path.join(tempfile.mkdtemp(), 'icon.png')
        cmd = [exe] + [a.replace('{src}', path).replace('{out}', tmp) for a in args]
        try:
            if subprocess.call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0 and os.path.exists(tmp):
                return tmp
        except Exception:
            pass
    raise SystemExit(
        'Không rasterize được SVG trên máy này.\n'
        'Cách nhanh nhất: mở file SVG bằng Chrome/Edge → chuột phải vào hình → "Save image as…" (PNG 512×512),\n'
        'rồi chạy lại:  python3 tools/make_icons.py duong/dan/icon.png')


def load_source(path):
    """Đọc ảnh nguồn → PIL Image RGBA."""
    if not os.path.exists(path):
        raise SystemExit('Không thấy tệp: ' + path)
    if path.lower().endswith('.svg'):
        path = svg_to_png(path)
    from PIL import Image
    img = Image.open(path)
    if getattr(img, 'is_animated', False):
        img.seek(0)
    return img.convert('RGBA')


def square(img, size, pad=0.0):
    """Cắt giữa cho vuông (giữ trong suốt) rồi thu về `size`px."""
    from PIL import Image
    w, h = img.size
    side = min(w, h)
    img = img.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))
    if pad:
        inner = max(1, int(side * (1 - pad * 2)))
        small = img.resize((inner, inner), Image.LANCZOS)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        off = (side - inner) // 2
        canvas.paste(small, (off, off), small)
        img = canvas
    if img.size != (size, size):
        img = img.resize((size, size), Image.LANCZOS)
    return img


def write_svg_wrapper(big, path):
    """favicon.svg nhúng ảnh 128px dạng base64 — để icon SVG và icon PNG luôn giống nhau."""
    buf = io.BytesIO()
    big.resize((128, 128)).save(buf, format='PNG', optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">\n'
                '  <image width="64" height="64" href="data:image/png;base64,' + b64 + '"/>\n'
                '</svg>\n')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    if not need_pillow():
        return 1
    from PIL import Image  # noqa: F401

    src = args[0] if args else None
    if not src:
        for name in SOURCE_NAMES:                       # nhớ ảnh nguồn lần trước
            p = os.path.join(OUT, name)
            if os.path.exists(p):
                src = p
                break

    if src:
        img = load_source(src)
        big = square(img, 512)
        print('Nguồn icon:', src, '→ %dx%d px' % img.size)
        write_svg_wrapper(big, os.path.join(OUT, 'favicon.svg'))
        # nhớ nguồn để lần sau chạy không cần tham số (bỏ qua nếu đã là icon-source.*)
        keep = os.path.join(OUT, 'icon-source' + ('.svg' if src.lower().endswith('.svg') else '.png'))
        if os.path.abspath(src) != os.path.abspath(keep):
            try:
                if src.lower().endswith('.svg'):
                    shutil.copyfile(src, keep)
                else:
                    img.save(keep, format='PNG')
            except Exception as e:
                print('(!) không lưu được ảnh nguồn:', e)
    else:
        big = draw(512)
        # icon vẽ tay: giữ favicon.svg "vẽ bằng vector" như bản gốc cho nét ở mọi cỡ
        with open(os.path.join(OUT, 'favicon.svg'), 'w', encoding='utf-8') as f:
            f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n'
                    '  <rect width="64" height="64" rx="14" fill="#a63a52"/>\n'
                    '  <rect x="11" y="15" width="21" height="31" rx="4" fill="#ffffff"/>\n'
                    '  <rect x="32" y="15" width="21" height="31" rx="4" fill="#ffffff" fill-opacity=".9"/>\n'
                    '  <path d="M32 41.5c-4.6-2.9-7.6-5.5-7.6-8.6 0-2.3 1.8-4 4-4 1.5 0 2.8.8 3.6 2 '
                    '.8-1.2 2.1-2 3.6-2 2.2 0 4 1.7 4 4 0 3.1-3 5.7-7.6 8.6z" fill="#a63a52"/>\n'
                    '</svg>\n')

    for size, name in SIZES:
        big.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
    ico = big.resize((48, 48), Image.LANCZOS)
    ico.save(os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    print('đã ghi', len(SIZES) + 2, 'tệp vào', OUT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
