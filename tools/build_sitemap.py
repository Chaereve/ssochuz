#!/usr/bin/env python3
"""Sinh `sitemap.xml` + `robots.txt` từ data/registry.json + data/book/*.json.

    python3 tools/build_sitemap.py                          # dùng https://ssochuz.pages.dev
    python3 tools/build_sitemap.py --base https://ten-mien-cua-ban
    python3 tools/build_sitemap.py --base https://abc.pages.dev --dry   # chỉ in, không ghi

Gồm trang chủ + từng truyện + từng chương (/truyen/<slug>/chuong-<n>/).
Chạy lại mỗi khi thêm bộ/chương mới (hoặc sau khi đổi tên miền).
"""
import argparse
import json
import os
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_BASE = 'https://ssochuz.pages.dev'


def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;').replace("'", '&apos;'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default=DEFAULT_BASE, help='tên miền gốc, không có dấu / ở cuối')
    ap.add_argument('--dry', action='store_true', help='chỉ in ra màn hình')
    args = ap.parse_args()
    base = args.base.rstrip('/')

    reg_path = os.path.join(ROOT, 'data', 'registry.json')
    with open(reg_path, encoding='utf-8') as f:
        reg = json.load(f)
    lib = reg.get('lib', [])
    today = date.today().isoformat()

    def book_chapters(slug):
        """Đếm số chương đọc được của một bộ (thiếu file thì coi như 0)."""
        try:
            with open(os.path.join(ROOT, 'data', 'book', slug + '.json'), encoding='utf-8') as f:
                return len(json.load(f).get('chapters', []))
        except (OSError, ValueError):
            return 0

    urls = [(base + '/', today, '1.0', 'daily')]
    for b in lib:
        slug = b.get('slug')
        if not slug:
            continue
        updated = b.get('updated') or today
        urls.append((base + '/truyen/' + slug + '/', updated, '0.8', 'weekly'))
        # URL từng chương (NV6): /truyen/<slug>/chuong-<n>/ — chương cũ ít đổi
        # nên monthly; dữ liệu không có ngày từng chương nên lấy ngày của truyện.
        for i in range(1, book_chapters(slug) + 1):
            urls.append((base + '/truyen/' + slug + '/chuong-' + str(i) + '/', updated, '0.6', 'monthly'))

    body = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, last, pri, freq in urls:
        body.append('  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>'
                    % (esc(loc), esc(last), freq, pri))
    body.append('</urlset>\n')
    xml = '\n'.join(body)
    robots = 'User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: %s/sitemap.xml\n' % base

    if args.dry:
        print(xml)
        print(robots)
        return 0
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write(xml)
    with open(os.path.join(ROOT, 'robots.txt'), 'w', encoding='utf-8') as f:
        f.write(robots)
    print('Đã ghi sitemap.xml (%d đường dẫn) và robots.txt — gốc: %s' % (len(urls), base))
    return 0


if __name__ == '__main__':
    sys.exit(main())
