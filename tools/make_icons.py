#!/usr/bin/env python3
"""Vẽ bộ icon ssochuz (PNG + ICO) khớp với assets/favicon.svg.
Chạy khi muốn đổi icon:  python3 tools/make_icons.py"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, 'assets')
os.makedirs(OUT, exist_ok=True)

BG = (166, 58, 82, 255)          # #a63a52
WHITE = (255, 255, 255, 255)
WHITE_R = (255, 255, 255, 230)   # trang phải, hơi trầm như fill-opacity .9

def draw(size):
    S = size
    u = S / 64.0
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # nền bo góc
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=14 * u, fill=BG)
    # hai trang sách gặp nhau ở giữa
    d.rounded_rectangle([11 * u, 15 * u, 32 * u, 46 * u], radius=4 * u, fill=WHITE)
    d.rounded_rectangle([32 * u, 15 * u, 53 * u, 46 * u], radius=4 * u, fill=WHITE_R)
    # trái tim giữa gáy sách: hai vòng tròn CHỒNG LÊN NHAU + tam giác (không hở kẽ)
    r = 4.5 * u
    cy = 31.6 * u
    cx = 32 * u
    d.ellipse([cx - 1.9 * r, cy - r, cx + .1 * r, cy + r], fill=BG)
    d.ellipse([cx - .1 * r, cy - r, cx + 1.9 * r, cy + r], fill=BG)
    d.polygon([(cx - 1.75 * r, cy + .2 * r), (cx + 1.75 * r, cy + .2 * r), (cx, cy + 2.9 * r)], fill=BG)
    return img

big = draw(512)
big.save(os.path.join(OUT, 'favicon-512.png'))
big.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, 'favicon-192.png'))
big.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, 'apple-touch-icon.png'))
big.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, 'favicon-64.png'))
big.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, 'favicon-32.png'))
big.resize((16, 16), Image.LANCZOS).save(os.path.join(OUT, 'favicon-16.png'))
img48 = big.resize((48, 48), Image.LANCZOS)
img48.save(os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
print('icons written to', OUT)
