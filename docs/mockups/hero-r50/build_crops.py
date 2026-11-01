#!/usr/bin/env python3
"""Cắt ảnh chụp hai bản thành từng cặp TRƯỚC / SAU cho trang mockup.

Cách dùng (ảnh gốc là PNG chụp khung #shero ở bội số 2×):
    python3 build_crops.py /tmp/png
Mỗi cặp được cắt CÙNG BỀ NGANG (tính bằng CSS px) để hai bên cùng tỉ lệ phóng.
"""
import os
import sys
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'img')
SCALE = 2

# (tên file xuất, nguồn, hộp cắt tính bằng CSS px trong khung #shero)
CROPS = [
    # hàng "bìa": cắt cùng bề ngang 480 để hai bên cùng tỉ lệ phóng,
    # nhờ vậy thấy được bìa 172 → 260 là to ra thật
    ('old-cover.webp',   'old-d.png', (0, 0, 480, 334)),
    ('new-cover.webp',   'new-d.png', (0, 0, 480, 450)),
    ('old-head.webp',    'old-d.png', (216, 36, 916, 122)),   # 700 rộng
    ('new-head.webp',    'new-d.png', (300, 34, 1000, 152)),  # 700 rộng
    ('old-rating.webp',  'old-d.png', (216, 114, 700, 172)),  # 484 rộng
    ('new-rating.webp',  'new-d.png', (300, 316, 784, 396)),  # 484 rộng, bắt đầu dưới nút
    ('old-buttons.webp', 'old-d.png', (216, 250, 916, 322)),  # 700 rộng
    ('new-buttons.webp', 'new-d.png', (300, 252, 1000, 318)), # 700 rộng
    # nhãn tình trạng: cắt hẹp và hiển thị đúng cỡ (không kéo giãn) để đọc được chữ
    ('old-status.webp',  'old-d.png', (10, 266, 210, 310)),   # 200×44, chỉ trong bìa
    ('new-status.webp',  'new-d.png', (0, 398, 200, 442)),    # 200×44
]

# ảnh toàn cảnh (thu nhỏ cho nhẹ)
FULL = [('old-d.png', 'old-d.webp', 1200), ('new-d.png', 'new-d.webp', 1200),
        ('old-m.png', 'old-m.webp', 480), ('new-m.png', 'new-m.webp', 480)]


def main(src_dir):
    os.makedirs(OUT, exist_ok=True)
    for out, src, box in CROPS:
        im = Image.open(os.path.join(src_dir, src)).convert('RGB')
        x0, y0, x1, y1 = [int(v * SCALE) for v in box]
        im.crop((max(0, x0), max(0, y0), min(im.width, x1), min(im.height, y1))) \
          .save(os.path.join(OUT, out), 'WEBP', quality=88, method=6)
        print('cắt', out)
    for src, out, width in FULL:
        im = Image.open(os.path.join(src_dir, src)).convert('RGB')
        im.thumbnail((width, 10000), Image.LANCZOS)
        im.save(os.path.join(OUT, out), 'WEBP', quality=88, method=6)
        print('thu', out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/png')
