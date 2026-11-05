# -*- coding: utf-8 -*-
"""Audit dữ liệu phải hiểu đúng chính sách truyện khóa mật mã.

PLS LOVE (và mọi entry registry có lock:1 / lock:true) KHÔNG được có bản sao
chương tĩnh data/book/<slug>.json: Pages phục vụ /data không có lớp xác thực,
nên sync nội dung khóa về repo là mở đường vòng đọc trộm. Thiếu file của bộ
khóa là đúng, không phải lỗi; còn file cũ là lỗi bảo mật cần báo để xoá.

Chạy: python3 tests/t_data_audit.py  (hoặc npm test)
"""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('cz_audit_data', os.path.join(ROOT, 'tools', 'audit_data.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

bad = []
checks = 0


def ok(cond, msg):
    global checks
    checks += 1
    if not cond:
        bad.append(msg)


def run(root):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = audit.main(str(root))
    return code, buf.getvalue()


def fixture(tmp, lib, books=None):
    os.makedirs(os.path.join(tmp, 'data', 'book'), exist_ok=True)
    with io.open(os.path.join(tmp, 'data', 'registry.json'), 'w', encoding='utf-8') as f:
        json.dump({'rev': 'test', 'lib': lib}, f, ensure_ascii=False)
    for slug, book in (books or {}).items():
        with io.open(os.path.join(tmp, 'data', 'book', slug + '.json'), 'w', encoding='utf-8') as f:
            json.dump(book, f, ensure_ascii=False)


def entry(slug='bo-khoa', **kw):
    n = {'title': 'Bộ Khóa', 'slug': slug, 'author': 'A', 'status': 'Hoàn thành',
         'chapters': 71, 'countLabel': '71/71', 'lock': 1}
    n.update(kw)
    return n


# 1. Dữ liệu thật của repo: PLS LOVE khóa mật mã, thiếu mirror là đúng.
code, out = run(ROOT)
ok(code == 0, 'audit repo thật phải đạt, nhận mã %d: %s' % (code, out[-400:]))
ok('| Bộ khóa mật mã (không sync bản tĩnh) | 1 |' in out, 'audit phải đếm đúng 1 bộ khóa mật mã')
ok('PLS LOVE' in out and 'không cần sync nội dung' in out, 'audit phải giải thích PLS LOVE không cần sync')
ok('Thiếu file chương: data/book/pls-love.json' not in out, 'không được báo thiếu file PLS LOVE là lỗi')
ok(not os.path.exists(os.path.join(ROOT, 'data', 'book', 'pls-love.json')),
   'PLS LOVE không được có bản sao chương tĩnh trong repo')

# 2. Cả hai dạng cờ lock:1 và lock:true đều được miễn đối chiếu chương.
for flag in (1, True):
    with tempfile.TemporaryDirectory() as tmp:
        fixture(tmp, [entry(lock=flag)])
        code, out = run(tmp)
        ok(code == 0, 'lock=%r thiếu mirror phải đạt' % flag)
        ok('Thiếu file chương' not in out, 'lock=%r không được báo thiếu file' % flag)

# 3. Bộ khóa còn file tĩnh cũ → lỗi bảo mật; audit không đọc/không tự xoá file.
with tempfile.TemporaryDirectory() as tmp:
    secret = 'NOI-DUNG-KHONG-DUOC-DOC-TRONG-AUDIT'
    book = {'title': 'Bộ Khóa', 'slug': 'bo-khoa', 'chapters': [{'t': 'Chương 1', 'html': '<p>%s</p>' % secret}]}
    fixture(tmp, [entry()], {'bo-khoa': book})
    path = os.path.join(tmp, 'data', 'book', 'bo-khoa.json')
    before = io.open(path, encoding='utf-8').read()
    code, out = run(tmp)
    ok(code == 1, 'bộ khóa còn mirror tĩnh phải báo lỗi')
    ok('vẫn còn bản sao tĩnh' in out, 'lỗi phải nêu rõ còn bản sao tĩnh của bộ khóa')
    ok(secret not in out, 'audit không được đọc/in nội dung chương của bộ khóa')
    ok(io.open(path, encoding='utf-8').read() == before, 'audit chỉ đọc, không tự sửa/xoá mirror')

# 4. Bộ KHÔNG khóa thiếu file vẫn là lỗi thiếu dữ liệu thật.
with tempfile.TemporaryDirectory() as tmp:
    fixture(tmp, [entry(slug='bo-mo', lock=0)])
    code, out = run(tmp)
    ok(code == 1 and 'Thiếu file chương: data/book/bo-mo.json' in out,
       'bộ không khóa thiếu mirror vẫn phải báo lỗi')

# 5. Số liệu tự đặt vẫn bị cấm kể cả trên entry khóa mật mã.
with tempfile.TemporaryDirectory() as tmp:
    fixture(tmp, [entry(views=999)])
    code, out = run(tmp)
    ok(code == 1 and 'khoá số liệu tự đặt: views' in out,
       'entry khóa mật mã vẫn phải bị cấm số liệu tự đặt')

# 6. Bộ mở khóa có mirror khớp số chương vẫn đạt như cũ.
with tempfile.TemporaryDirectory() as tmp:
    fixture(tmp, [entry(slug='bo-mo', lock=0, chapters=1, countLabel='1/1')],
            {'bo-mo': {'chapters': [{'t': 'Chương 1', 'html': '<p>Nội dung công khai</p>'}]}})
    code, out = run(tmp)
    ok(code == 0, 'bộ mở khóa có mirror hợp lệ phải đạt')
    ok('| Tổng chương trong bản sao công khai | 1 |' in out, 'chỉ đếm chương của bản sao công khai')

print(json.dumps({'data_audit': 'ok' if not bad else 'fail', 'checks': checks, 'errors0': bad},
                 ensure_ascii=False, indent=1))
sys.exit(1 if bad else 0)
