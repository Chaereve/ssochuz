# -*- coding: utf-8 -*-
"""Mockup mục lục trang đọc — ba cách thể hiện bốn nhóm phụ (vòng 87)."""
import io, html

def e(s): return html.escape(s, quote=False)

# ---- dữ liệu thật: third-person, phần đuôi (ca xấu nhất: 5 nhóm phụ liên tiếp) ----
TAIL = [
    ('chap', '25', 'Mãi Mãi'), ('chap', '26', 'Địa Điểm'),
    ('chap', '27', 'Quá Khứ... Không Nên Khơi Lại'), ('chap', '28', 'Vô Hình Mà Hiện Hữu'),
    ('end',    '',   'Always You'),
    ('extra',  'S1', 'Đêm Qua'),
    ('author', '',   'Trò Chuyện Cùng Tác Giả'),
    ('note',   '',   'Trước Khi Trở Thành "Third Person"'),
    ('note',   '',   'Khóc Trong Mơ'),
]
# ca thường gặp: chain (1 nhóm phụ: ngoại truyện ×15)
CHAIN = [
    ('chap', '50', 'Chương 50'), ('chap', '51', 'Chương 51'), ('chap', '52', 'Chương 52'),
    ('extra', 'S1', 'Ngoại Truyện 1'), ('extra', 'S2', 'Ngoại Truyện 2'),
    ('extra', 'S3', 'Ngoại Truyện 3'), ('extra', 'S4', 'Ngoại Truyện 4'),
]
LABEL = {'prologue': 'Lời mở đầu truyện', 'author': 'Lời tác giả',
         'end': 'Lời kết', 'extra': 'Ngoại truyện', 'note': 'Ghi chú'}

def row(no, name, cls=''):
    return (f'<a class="r{" " + cls if cls else ""}" href="#"><span class="no">{e(no)}</span>'
            f'<span class="nm">{e(name)}</span><span class="ck"></span></a>')

def rows_plain(data):
    return ''.join(row(no, nm, k) for k, no, nm in data)

def rows_label(data):
    """A: chèn nhãn nhóm ngay ranh giới, y như danh sách chương"""
    out, prev = [], None
    for k, no, nm in data:
        if k != 'chap' and k != prev:
            n = sum(1 for x in data if x[0] == k)
            chip = f'<span class="g-n">{n}</span>' if n >= 2 else ''
            out.append(f'<div class="grp">{e(LABEL[k])}{chip}</div>')
        out.append(row(no, nm, k))
        prev = k
    return ''.join(out)

def rows_merged(data):
    """B: gộp cả cụm nhóm phụ đuôi thành một nhãn “Phần phụ”"""
    out, done = [], False
    specials = sum(1 for x in data if x[0] != 'chap')
    for k, no, nm in data:
        if k != 'chap' and not done:
            out.append(f'<div class="grp">Phần phụ<span class="g-n">{specials}</span></div>')
            done = True
        out.append(row(no, nm, k))
    return ''.join(out)

def rows_typed(data):
    """C: không nhãn; ô ký hiệu của mục phụ in tên loại cỡ nhỏ"""
    out = []
    for k, no, nm in data:
        if k == 'chap':
            out.append(row(no, nm, 'r-chap'))
        else:
            short = {'end': 'Lời kết', 'extra': 'Ngoại truyện', 'author': 'Lời tác giả',
                     'note': 'Ghi chú', 'prologue': 'Mở đầu'}[k]
            out.append(f'<a class="r r-spec" href="#"><span class="ty">{e(short)}</span>'
                       f'<span class="nm">{e(nm)}</span><span class="ck"></span></a>')
    return ''.join(out)

CSS = """
:root{--txt:#f2ebe0;--mut:#a89d8d;--dim:#8a8174;--acc:#e0859b;--bd:rgba(255,240,220,.13);
 --surf:#1e1915;--surf2:#262019;
 --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
 --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--serif:"Iowan Old Style",Georgia,serif}
*{box-sizing:border-box}
body{margin:0;background:#efeae2;color:#2b251d;font:400 13px/1.6 var(--sans);padding:26px 28px 30px}
h1{font:600 19px/1.35 var(--serif);margin:0 0 4px}
p.lede{margin:0 0 20px;color:#5f5546;font-size:12.5px;line-height:1.66;max-width:120ch}
p.lede b{color:#2b251d;font-weight:600}
.grid{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap}
.col{flex:1 1 300px;min-width:0}
@media (max-width:900px){ .grid{flex-direction:column} .col{flex:1 1 auto;width:100%} }
.lbl{font:600 9.5px/1.35 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:#8b7f6d;margin:0 0 7px}
.lbl b{color:#2b251d}
.note{margin:9px 0 0;font-size:11.5px;line-height:1.6;color:#6b6152}
.note i{color:#9c4a2a;font-style:normal;font-weight:600}

/* ---- khung sheet mục lục, chép theo .sheet .pan ---- */
.pan{background:var(--surf);border:1px solid var(--bd);border-radius:10px;overflow:hidden;
 box-shadow:0 1px 2px rgba(40,30,10,.14),0 8px 22px -16px rgba(40,30,10,.55)}
.ph{display:flex;align-items:baseline;gap:10px;padding:13px 16px;border-bottom:1px solid var(--bd)}
.ph h4{margin:0;flex:1;font:700 15px/1.3 var(--sans);color:var(--txt)}
.ph .sm{font-size:11px;color:var(--dim)}
.dsearch{display:flex;align-items:center;gap:9px;margin:8px 8px 10px;padding:8px 13px;border:1px solid var(--bd);
 border-radius:99px;color:var(--dim);font-size:12px}
.pb{padding:4px 10px 14px}
.r{display:grid;grid-template-columns:30px 1fr auto;gap:9px;align-items:center;padding:8px 10px;
 border-radius:6px;font-size:13.5px;color:var(--txt);text-decoration:none}
.r:hover{background:var(--surf2)}
.r .no{text-align:right;font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums}
.r.k-end .nm,.r.k-extra .nm,.r.k-author .nm,.r.k-note .nm{color:var(--mut)}
.r.on{background:color-mix(in srgb,var(--acc) 12%,transparent);font-weight:700}
.r.on .no{color:var(--acc);font-weight:800}

/* A/B: nhãn nhóm */
.grp{display:flex;align-items:center;gap:6px;margin:6px 0 2px;padding:9px 10px 5px;
 font:700 10px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mut);
 border-bottom:1px solid var(--bd)}
.g-n{padding:1px 5px;border-radius:99px;background:var(--surf2);font:600 9px/1.5 var(--mono);
 letter-spacing:.02em;color:var(--dim)}

/* C: tên loại nằm ở ô ký hiệu */
.r.r-spec{grid-template-columns:92px 1fr auto}
.r .ty{font:700 8.5px/1.2 var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--dim);
 text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
"""

def panel(kind, body, sub='42 mục'):
    return f"""<div class="pan">
  <div class="ph"><h4>Third Person</h4><span class="sm">{sub} · đang ở ch.{kind}</span></div>
  <div class="dsearch">Tìm chương…</div>
  <div class="pb">{body}</div>
</div>"""

out = f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mục lục trang đọc — vòng 87</title><style>{CSS}</style></head><body>
<h1>Mục lục trong trang đọc — ba cách thể hiện bốn nhóm phụ</h1>
<p class="lede">Vấn đề hiện tại: mục lục không có nhãn nhóm nào, nên <b>S1</b> nằm lẫn giữa các mục phụ và những mục không đánh số hiện ra <b>trống trơn</b> ở cột ký hiệu. Tôi đã kiểm tra toàn bộ 66 bộ: <b>không bộ nào</b> có mục phụ xen giữa chương chính, và 36/37 bộ chỉ có 1–2 nhóm phụ — nghĩa là chèn nhãn nhóm <i>không</i> làm mục lục rối. Riêng <b>third-person</b> là ca xấu nhất: 5 nhóm phụ liên tiếp, 6 hàng. Ba phương án dưới đây vẽ đúng ca đó.</p>

<div class="grid">
  <div class="col">
    <p class="lbl">A · nhãn nhóm — <b>khuyến nghị</b></p>
    {panel(26, rows_label(TAIL))}
    <p class="note">Dùng đúng bốn nhãn của danh sách chương, cùng thứ tự, nên hai nơi khớp nhau. Nhãn chỉ hiện khi cụm có từ 1 hàng.</p>
  </div>
  <div class="col">
    <p class="lbl">B · gộp đuôi thành “Phần phụ”</p>
    {panel(26, rows_merged(TAIL))}
    <p class="note">Ít nhãn nhất: cả cụm phụ chỉ một nhãn. <i>Đánh đổi:</i> mất phân biệt lời kết / ngoại truyện / lời tác giả, và lệch với danh sách chương.</p>
  </div>
  <div class="col">
    <p class="lbl">C · tên loại ở cột ký hiệu</p>
    {panel(26, rows_typed(TAIL))}
    <p class="note">Không thêm hàng nào; mỗi hàng phụ tự nói loại. <i>Đánh đổi:</i> cột trái phình 30→92px (phải đủ chỗ cho “Ngoại truyện”), tên chương ngắn lại, và mục lục thành nơi thứ hai có từ vựng riêng.</p>
  </div>
</div>

<div class="grid" style="margin-top:26px">
  <div class="col">
    <p class="lbl">A · ca thường gặp (chain: 1 nhóm phụ)</p>
    {panel('52', rows_label(CHAIN), '52 mục')}
  </div>
  <div class="col">
    <p class="lbl">hiện tại · third-person (để đối chiếu)</p>
    {panel(26, rows_plain(TAIL))}
  </div>
  <div class="col">
    <p class="lbl">hiện tại · chain</p>
    {panel('52', rows_plain(CHAIN), '52 mục')}
  </div>
</div>
</body></html>"""
io.open('index.html','w',encoding='utf-8').write(out)
print('ok', len(out))
