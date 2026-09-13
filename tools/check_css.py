#!/usr/bin/env python3
"""Đối chiếu lớp CSS với lớp thật sự dùng trong HTML/JS.

    python3 tools/check_css.py

In ra:
  · lớp dùng trong HTML/JS mà CSS KHÔNG hề định nghĩa  (dễ gây giao diện vỡ)
  · lớp CSS không còn dùng ở đâu (rác, cân nhắc xoá)
Chỉ mang tính nhắc việc — vài lớp do JS ghép chuỗi nên có thể báo nhầm.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = ['index.html', 'truyen.html', 'admin.html', 'cz-home.js', 'cz-story.js', 'cz-app.js', 'admin.js']
SKIP_PREFIX = ('i-', 'h' if False else '__')     # i-s / i l à lớp icon, không cần style


def css_classes(text):
    out = set()
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    for block in re.findall(r'([^{}]+)\{', text):
        for m in re.finditer(r'\.(-?[_a-zA-Z][\w-]*)', block):
            out.add(m.group(1))
    return out


def used_classes(text):
    out = set()
    for m in re.finditer(r'class=\\?["\']([^"\'\\]+)', text):
        for c in m.group(1).split():
            out.add(c)
    for m in re.finditer(r"classList\.(?:add|remove|toggle|contains)\(\s*'([\w-]+)'", text):
        out.add(m.group(1))
    for m in re.finditer(r"(?:^|\s)(?:add|remove|toggle)\(\s*'([\w-]+)'", text):
        out.add(m.group(1))
    return out


def main():
    css = css_classes(open(os.path.join(ROOT, 'cz.css'), encoding='utf-8').read())
    used = set()
    for f in SRC:
        used |= used_classes(open(os.path.join(ROOT, f), encoding='utf-8').read())
    used = {c for c in used if c and not c.startswith('i-') and not c.startswith('"')}

    missing = sorted(c for c in used - css)
    unused = sorted(c for c in css - used)

    print('Lớp dùng trong HTML/JS mà CSS chưa định nghĩa (%d):' % len(missing))
    for c in missing:
        print('  ·', c)
    print('\nLớp CSS không thấy dùng ở đâu (%d):' % len(unused))
    print('  ' + ', '.join(unused))
    return 0


if __name__ == '__main__':
    sys.exit(main())
