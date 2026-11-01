# -*- coding: utf-8 -*-
"""Sinh mockup 3 phương án ký hiệu chương (vòng 85) cho trang danh sách chương."""
import io, html

def e(s): return html.escape(s, quote=False)

CHEV = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'

def vol(t, on=False):
    return f'<div class="cvol{" on" if on else ""}">{CHEV}<span>{e(t)}</span></div>'

def row(token, name, cls="", now=False, col="26"):
    tc = f' k-{cls}' if cls else ''
    nc = ' now' if now else ''
    return (f'<a class="cha{tc}{nc}" href="#"><span class="no">{e(token)}</span>'
            f'<span class="nm">{e(name)}</span></a>')

# ---------------- dữ liệu thật của truyện third-person ----------------
OPEN   = "Lời Mở Đầu"
CH     = [(1,"Học Sinh Mới"), (2,"Hạt Mầm"), (3,"Thịt Viên Và Chuối Chiên"),
          (35,"Sun"), (36,"Happily Ever After")]
UNNUM  = "Khóc Trong Mơ"                      # chương chính nhưng dữ liệu không có số
KET    = "Lời Kết: Always You"
GHICHU = "Trò Chuyện Cùng Tác Giả"
SPEC   = 'Trước Khi Trở Thành "Third Person"'
EXTRA  = "Đêm Qua"

def grid(rows):
    return '<div class="chapgrid">' + ''.join(rows) + '</div>'

# ================= 0 · HIỆN TẠI =================
def panel_now():
    rows = [vol("Mở đầu / lời tác giả", True),
            row("Mở", OPEN, "open"),
            vol("Chương 1–24", True),
            row("1", "Học Sinh Mới", "main", now=True),
            row("2", "Hạt Mầm", "main"),
            row("3", "Thịt Viên Và Chuối Chiên", "main"),
            vol("Chương 25–42", True),
            row("36", "Happily Ever After", "main"),
            row("—", KET, "main"),
            row("—", GHICHU, "main"),
            row("—", SPEC, "main"),
            row("—", UNNUM, "main"),
            vol("Ngoại truyện / đặc biệt", True),
            row("S1", EXTRA, "extra")]
    return grid(rows)

# ================= A · THANG SỐ =================
def panel_a():
    rows = [vol("Mở đầu / lời tác giả", True),
            row("0", OPEN, "a-open"),
            vol("Chương 1–24", True),
            row("1", "Học Sinh Mới", "a-main", now=True),
            row("2", "Hạt Mầm", "a-main"),
            row("3", "Thịt Viên Và Chuối Chiên", "a-main"),
            vol("Chương 25–36", True),
            row("36", "Happily Ever After", "a-main"),
            vol("Ngoại truyện / đặc biệt", True),
            row("S1", EXTRA, "a-extra"),
            row("S2", "Một ngày khác", "a-extra"),
            vol("Kết / ghi chú", True),
            row("", KET, "a-note"),
            row("", GHICHU, "a-note"),
            row("", SPEC, "a-note")]
    return grid(rows)

# ================= B · HAI CHỮ CÁI =================
def panel_b():
    rows = [vol("Mở đầu / lời tác giả", True),
            row("MĐ", OPEN, "b-open"),
            vol("Chương 1–24", True),
            row("1", "Học Sinh Mới", "b-main", now=True),
            row("2", "Hạt Mầm", "b-main"),
            row("3", "Thịt Viên Và Chuối Chiên", "b-main"),
            vol("Chương 25–36", True),
            row("36", "Happily Ever After", "b-main"),
            vol("Ngoại truyện / đặc biệt", True),
            row("NT1", EXTRA, "b-extra"),
            row("NT2", "Một ngày khác", "b-extra"),
            vol("Kết / ghi chú", True),
            row("KT", KET, "b-note"),
            row("GC", GHICHU, "b-note"),
            row("GC", SPEC, "b-note")]
    return grid(rows)

# ================= C · SỐ THEO NHÓM =================
def panel_c():
    rows = [vol("Mở đầu / lời tác giả", True),
            row("1", OPEN, "c-spec"),
            vol("Chương 1–24", True),
            row("1", "Học Sinh Mới", "c-main", now=True),
            row("2", "Hạt Mầm", "c-main"),
            row("3", "Thịt Viên Và Chuối Chiên", "c-main"),
            vol("Chương 25–36", True),
            row("36", "Happily Ever After", "c-main"),
            vol("Ngoại truyện / đặc biệt", True),
            row("1", EXTRA, "c-spec"),
            row("2", "Một ngày khác", "c-spec"),
            vol("Kết / ghi chú", True),
            row("1", KET, "c-spec"),
            row("2", GHICHU, "c-spec"),
            row("3", SPEC, "c-spec")]
    return grid(rows)

CSS = """
:root{--acc:#e0859b;--txt:#f7f1e7;--mut:#a89d8d;--dim:#8a8174;--ok:#74c69b;--warn:#dcae6a;
 --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
 --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
 --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
 --bd:rgba(255,240,220,.13);--surf2:#262019;}
*{box-sizing:border-box}
body{margin:0;background:#14110e;color:#f7f1e7;font:400 13.5px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
.w{max-width:1120px;margin:0 auto;padding:34px 24px 60px}
h1{font:700 26px/1.25 var(--serif);margin:0 0 8px}
.lede{color:rgba(255,255,255,.58);margin:0;max-width:96ch;font-size:13.5px;line-height:1.78}
.lede b{color:#f7f1e7;font-weight:600}
section{margin:40px 0 0}
.hd{display:flex;align-items:baseline;gap:10px;margin:0 0 4px}
.hd .n{color:var(--acc);font-weight:700;font-size:13px}
.hd h2{font:700 15px/1.3 var(--sans);margin:0}
.hd2{font-size:12.5px;color:rgba(255,255,255,.50);margin:0 0 14px;line-height:1.75;max-width:104ch}
.hd2 b{color:rgba(255,255,255,.78);font-weight:600}
.hd2 .bad{color:#e8a3a3}
.frame{width:1032px;max-width:100%;background:var(--surf);border:1px solid var(--bd);border-radius:12px;padding:6px 18px 16px}
.tag{font:500 9.5px/1 var(--mono);letter-spacing:.13em;text-transform:uppercase;color:rgba(255,255,255,.30);margin:0 0 8px}
.note{display:flex;gap:18px;margin:12px 0 0;font-size:12px;line-height:1.7;color:rgba(255,255,255,.46);max-width:104ch}
.note b{color:var(--ok);font-weight:600}
.note i{color:#e8b0b0;font-style:normal;font-weight:600}

/* ==== danh sách chương: chép đúng CSS thật ==== */
.chapgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:2px 24px;padding-top:8px}
.cha{display:grid;grid-template-columns:26px minmax(0,1fr) 16px;gap:10px;align-items:center;height:38px;
 padding:0 8px;border-radius:7px;font-size:13.5px;color:var(--txt);text-decoration:none;
 transition:color .15s,background .15s}
.cha:hover{color:#fff;background:color-mix(in srgb,var(--surf2) 70%,transparent)}
.cha .no{color:var(--dim);font-size:12px;font-variant-numeric:tabular-nums;text-align:right;line-height:1}
.cha .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cha.now .nm{font-weight:700}
.cha.now .no{color:var(--acc);font-weight:800}
.cvol{display:flex;align-items:center;gap:9px;width:100%;padding:14px 2px 9px;
 border-bottom:1px solid var(--bd);font-size:13px;font-weight:600;color:var(--txt);grid-column:1/-1}
.cvol .i{width:13px;height:13px;color:var(--dim);transition:transform .15s}
.cvol.on .i{transform:rotate(90deg)}

/* ==== hiện tại (để đối chiếu) ==== */
.k-open .no{color:var(--acc);font-size:10.5px;letter-spacing:.04em;font-weight:700}
.k-extra .no{color:var(--warn);font-size:10.5px;letter-spacing:.02em;font-weight:700}
.k-extra .nm{color:var(--mut)}

/* ==== A · thang số: mọi ô cùng cỡ, cùng màu, chỉ chương đang đọc đổi màu ==== */
.a-open .no,.a-main .no,.a-extra .no,.a-note .no{font-size:11.5px;font-weight:700;letter-spacing:.01em}
.a-note .no{min-height:1px}
.a-note .nm{color:var(--mut)}

/* ==== B · hai chữ cái: cùng một họ ký hiệu 2 ký tự, cột rộng 30px ==== */
.pb .cha{grid-template-columns:30px minmax(0,1fr) 16px}
.b-open .no,.b-main .no,.b-extra .no,.b-note .no{font-size:11px;font-weight:700;letter-spacing:.05em}
.b-note .nm{color:var(--mut)}

/* ==== C · số theo nhóm: chỉ có số, không chữ, không gạch ==== */
.c-main .no,.c-spec .no{font-size:11.5px;font-weight:700}
.c-spec .nm{color:var(--mut)}
"""

def block(num, title, desc, body, extra_cls="", notes=""):
    return f"""
<section>
  <div class="hd"><span class="n">{num}</span><h2>{title}</h2></div>
  <p class="hd2">{desc}</p>
  <div class="frame {extra_cls}"><p class="tag">third-person · 42 mục · lưới 2 cột</p>{body}</div>
  {f'<div class="note">{notes}</div>' if notes else ''}
</section>"""

html_out = f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ký hiệu chương — vòng 85</title><style>{CSS}</style></head><body><div class="w">
<h1>Ký hiệu trong danh sách chương — ba phương án</h1>
<p class="lede">Hiện tại cột ký hiệu trộn <b>bốn</b> kiểu khác nhau về cỡ chữ, màu và cách canh: số chương
(<b>1</b>) màu mờ, chữ <b>Mở</b> màu hồng, ký hiệu <b>S1</b> màu vàng, và gạch ngang <b>—</b> cho những mục
không có số. Dấu gạch ngang xuất hiện vì bốn mục (“Lời Kết”, “Trò Chuyện Cùng Tác Giả”, “Trước Khi Trở
Thành…”, “Khóc Trong Mơ”) đang bị xếp vào nhóm <i>Chương 25–42</i> dù chúng không phải chương đánh số —
nên cả ba phương án dưới đây đều xếp chúng vào một nhóm riêng là <b>Kết / ghi chú</b>.</p>
{block("0","Hiện tại — để đối chiếu","Bốn kiểu ký hiệu trong cùng một cột; hàng “Mở · Lời Mở Đầu” lặp ý hai lần; nhóm ghi “Chương 25–42” nhưng chương lớn nhất là 36.", panel_now())}
{block("A","Thang số — mọi ô đều là số, cùng cỡ, cùng màu","Mở đầu là <b>0</b> (đứng ngay trước chương 1), chương chính giữ số thật, ngoại truyện giữ <b>S1, S2</b> đã quen ở trang đọc và bình luận. Nhóm <b>Kết / ghi chú</b> không đánh số nên ô ký hiệu để trống. Chỉ chương đang đọc đổi sang màu nhấn.",
       panel_a(),
       notes="<span><b>Đổi ít nhất:</b> S1 vẫn đúng như trang đọc, không phải sửa chỗ khác. Dấu “—” biến mất.</span><span><i>Đánh đổi:</i> trong nhóm Kết / ghi chú, ô ký hiệu trống nên hàng đó thụt vào 26px so với các hàng khác.</span>")}
{block("B","Hai chữ cái — một họ ký hiệu, đọc được bằng tiếng Việt","<b>MĐ</b> mở đầu · số cho chương chính · <b>NT1</b> ngoại truyện · <b>KT</b> lời kết · <b>GC</b> ghi chú. Cả năm loại cùng một cỡ chữ, cùng canh phải, cùng màu mờ — cột đọc như một bảng chú giải thống nhất, không ô nào trống.",
       panel_b(), "pb",
       notes="<span><b>Rõ nghĩa nhất với người Việt:</b> MĐ/NT/KT đọc ra ngay, không phải suy từ tiếng Anh.</span><span><i>Đánh đổi:</i> phải đổi S1 → NT1 ở cả trang đọc, bình luận và breadcrumb, nếu không sẽ lệch nhau.</span>")}
{block("C","Số theo nhóm — không chữ, không gạch, không ô trống","Mỗi nhóm tự đánh số từ 1, nên ô ký hiệu luôn là một con số gọn. Nhóm “Mở đầu”, “Ngoại truyện”, “Kết / ghi chú” đã nói rõ loại, hàng chỉ cần đếm trong nhóm. Tên mục đặc biệt để màu mờ hơn chương chính.",
       panel_c(),
       notes="<span><b>Sạch nhất về thị giác:</b> không ký tự lạ nào trong cột, không bao giờ có ô trống.</span><span><i>Đánh đổi:</i> số 1 xuất hiện ở ba nhóm khác nhau; ra khỏi trang này (trang đọc, bình luận, breadcrumb) không còn nhóm để dựa vào nên vẫn phải gọi S1/NT1.</span>")}
</div></body></html>"""
io.open('index.html','w',encoding='utf-8').write(html_out)
print('wrote', len(html_out), 'bytes')
