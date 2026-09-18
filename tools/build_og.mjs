/* ============================================================================
   build_og.mjs · sinh thẻ chia sẻ (OG meta) tĩnh cho từng truyện
   ----------------------------------------------------------------------------
   VÌ SAO LÀM TĨNH: bot Zalo/Facebook/Telegram không chạy JavaScript — chúng chỉ
   đọc HTML thô. Trang truyện là 1 shell chung (title "Đang tải…") nên bot không
   bao giờ thấy tên/bìa từng bộ. Cách nhẹ nhất mà vẫn chạy được với kiểu deploy
   "upload trực tiếp" (không có Pages Functions): đẻ sẵn 1 file
   /truyen/<slug>/index.html cho mỗi bộ — nội dung Y HỆT truyen.html, chỉ khác
   phần <head> (title, og:*, canonical, JSON-LD Book).

   Chạy:  npm run og        (đọc data/registry.json + truyen.html)
   Xong:  upload lại toàn bộ thư mục truyen/ + file _redirects lên Pages.

   KHI NÀO CHẠY LẠI: sửa tiêu đề/bìa/mô tả trong /admin, thêm/xoá bộ truyện.
   (Thêm/sửa CHƯƠNG thì không cần — người đọc thấy ngay qua KV như cũ, chỉ có
   thẻ OG là ảnh chụp lúc chạy script gần nhất.)

   Script cũng tự viết lại khối luật từng-truyện trong _redirects (giữa hai mốc
   OG-BEGIN / OG-END) và đặt TRƯỚC luật chung /truyen/* — vì Pages ưu tiên luật
   khớp đầu tiên, luật chung mà đứng trước sẽ che mất file tĩnh (xem docs
   "Redirects are always followed, regardless of whether or not an asset
   matches"). Luật chung vẫn giữ lại làm lưới an toàn cho bộ mới chỉ có trên KV.
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://ssochuz.pages.dev';   // domain chính — og:url/canonical luôn trỏ về đây
const WORKER = 'https://chuseoz-cms.kimtong1906.workers.dev';   // gốc feed RSS riêng từng truyện (/feed.xml?slug=)

/* thoát chuỗi cho thuộc tính HTML lẫn nội dung <title> */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
/* cắt mô tả cho gọn thẻ (Zalo/FB chỉ hiện ~2 dòng) — cắt ở ranh giới từ */
function short(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n).replace(/\s+\S*$/, '');
  return (cut || s.slice(0, n)) + '…';
}
function absImg(u) {
  u = String(u || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return SITE + u;
  return SITE + '/ssochuz.png';
}

const reg = JSON.parse(readFileSync(path.join(ROOT, 'data', 'registry.json'), 'utf8'));
const lib = (reg && reg.lib) || [];
if (!lib.length) throw new Error('data/registry.json không có bộ nào');

const shell = readFileSync(path.join(ROOT, 'truyen.html'), 'utf8');
const TITLE_OLD = '<title>Đang tải… · ssochuz library</title>';
const DESC_RE = /<meta name="description" content="[^"]*">/;
if (!shell.includes(TITLE_OLD)) throw new Error('truyen.html đổi dòng <title> — cập nhật TITLE_OLD trong script');
if (!DESC_RE.test(shell)) throw new Error('truyen.html đổi thẻ description — cập nhật DESC_RE trong script');

let made = 0;
const slugs = [];
for (const n of lib) {
  const slug = String((n && n.slug) || '').trim();
  if (!slug || /[./\\]/.test(slug)) { console.log('  bỏ qua slug lạ: ' + JSON.stringify(slug)); continue; }
  const title = String(n.title || slug).trim();
  const desc = short(n.syn || '', 200) || ('Đọc truyện ' + title + ' trên ssochuz library.');
  const img = absImg(n.thumb || n.slide);
  const url = SITE + '/truyen/' + slug + '/';
  const author = String(n.author || '').trim();
  const ld = { '@context': 'https://schema.org', '@type': 'Book', name: title, inLanguage: 'vi', url, image: img, description: desc };
  if (author) ld.author = { '@type': 'Person', name: author };
  /* JSON-LD nằm trong <script>: thoát < để mô tả có "</script>" cũng không phá trang */
  const ldJson = JSON.stringify(ld).replace(/</g, '\\u003c');

  const head =
    '<title>' + esc(title) + ' · ssochuz library</title>\n' +
    '<meta name="description" content="' + esc(desc) + '">\n' +
    '<link rel="canonical" href="' + esc(url) + '">\n' +
    '<link rel="alternate" type="application/rss+xml" title="RSS: ' + esc(title) + ' — ssochuz library" href="' + WORKER + '/feed.xml?slug=' + slug + '">\n' +
    '<meta property="og:type" content="book">\n' +
    '<meta property="og:site_name" content="ssochuz library">\n' +
    '<meta property="og:locale" content="vi_VN">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n' +
    '<meta property="og:description" content="' + esc(desc) + '">\n' +
    '<meta property="og:image" content="' + esc(img) + '">\n' +
    '<meta property="og:url" content="' + esc(url) + '">\n' +
    (author ? '<meta property="book:author" content="' + esc(author) + '">\n' : '') +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + esc(title) + '">\n' +
    '<meta name="twitter:description" content="' + esc(desc) + '">\n' +
    '<meta name="twitter:image" content="' + esc(img) + '">\n' +
    '<script type="application/ld+json">' + ldJson + '</' + 'script>';

  const out = shell.replace(TITLE_OLD, '<title>' + esc(title) + ' · ssochuz library</title>')
    .replace(DESC_RE, () => head.replace('<title>' + esc(title) + ' · ssochuz library</title>\n', ''));
  const dir = path.join(ROOT, 'truyen', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), out);
  made++;
  slugs.push(slug);
}

/* --- viết lại khối luật từng-truyện trong _redirects (giữa 2 mốc) ---
   CHỈ 2 luật TĨNH cho mỗi bộ (/truyen/<slug> và /truyen/<slug>/). KHÔNG sinh
   luật splat (/truyen/<slug>/*) nữa: Pages chỉ áp đúng một số luật động đầu
   tệp (có dấu *) — tệp cũ có 71 luật động nên từ khoảng luật 20–30 trở đi bị
   BỎ IM LẶNG, khiến link chương /truyen/<slug>/chuong-N/ của phần lớn bộ
   truyện rơi vào 404 ("một số bộ truyện bị lỗi link", 17/09/2026). Chapter
   URL nay do MỘT luật splat chung duy nhất ở CUỐI tệp hứng hết:
   /truyen/* → trang truyện. Hai luật tĩnh dưới đây có nhiệm vụ giữ trang
   từng bộ (trả index.html có thẻ OG) đứng TRƯỚC luật chung đó. */
const BEG = '# -- OG-BEGIN: luật từng truyện do tools/build_og.mjs tự sinh (đừng sửa tay) --';
const END = '# -- OG-END --';
const rules = slugs.map((s) =>
  '/truyen/' + s + '   /truyen/' + s + '/   200\n' +
  '/truyen/' + s + '/  /truyen/' + s + '/   200').join('\n');
const block = BEG + '\n' + rules + '\n' + END;
const rdPath = path.join(ROOT, '_redirects');
let rd = readFileSync(rdPath, 'utf8');
if (rd.includes(BEG) && rd.includes(END)) {
  rd = rd.replace(new RegExp(BEG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => block);
} else {
  const anchor = '/truyen/*      /truyen   200';
  if (!rd.includes(anchor)) throw new Error('_redirects thiếu luật chung /truyen/* — không biết chèn khối OG vào đâu');
  rd = rd.replace(anchor, () => block + '\n' + anchor);
}
writeFileSync(rdPath, rd);

console.log('OG tĩnh: đã sinh ' + made + ' file truyen/<slug>/index.html + ' + (slugs.length * 2) + ' luật tĩnh trong _redirects.');
console.log('Luật chương (splat) KHÔNG sinh theo từng bộ nữa — xem luật chung /truyen/* ở cuối _redirects.');
console.log('Nhớ upload lại thư mục truyen/ và file _redirects lên Pages.');
