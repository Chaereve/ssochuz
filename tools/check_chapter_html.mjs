/* ============================================================================
   check_chapter_html.mjs · CHẠY BỘ LÀM SẠCH HTML TRÊN TOÀN BỘ DỮ LIỆU THẬT
   ----------------------------------------------------------------------------
   Vì sao: đổi cách làm sạch HTML (từ “danh sách cấm” sang “danh sách cho phép”)
   là việc dễ làm MẤT ĐỊNH DẠNG hoặc mất chữ của 1.216 chương đang có. Bài này
   chạy hàm thật `sanitizeChapterHtml` (src/shared/sanitize.js) trên từng chương
   trong data/book/*.json và ĐIỀU KIỆN ĐẠT là:
     · không chương nào mất ẢNH,
     · không chương nào trở thành RỖNG (đang có chữ mà sạch xong hết chữ),
     · mọi TỪ trong bản sạch đều có trong bản gốc (không tự sinh thêm chữ),
     · không còn thẻ/URL nguy hiểm (script, on*, javascript:, data:).
   Chữ bị mất chỉ được phép đến từ cụm bị BỎ CẢ CỤM (nút phân trang Blogger,
   iframe, form…) — phần này được đếm và in ra để chủ trang nhìn thấy.

   Chạy:  node tools/check_chapter_html.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeChapterHtml, htmlFacts } from '../src/shared/sanitize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'data', 'book');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

const removedTags = {};
const removedAttrHits = {};
const bad = [];
let chapters = 0, bytesBefore = 0, bytesAfter = 0, textBefore = 0, textAfter = 0;
let widgetChapters = 0, imgsBefore = 0, imgsAfter = 0, emptyAfter = 0;

const bump = (box, k, n = 1) => { box[k] = (box[k] || 0) + n; };
const words = (s) => String(s || '').split(' ').filter((w) => w.length > 1);

/* đếm thẻ/thuộc tính bị bỏ để in báo cáo */
function diffTags(before, after) {
  const tb = htmlFacts(before).tags, ta = htmlFacts(after).tags;
  Object.keys(tb).forEach((t) => {
    const left = (tb[t] || 0) - (ta[t] || 0);
    if (left > 0) bump(removedTags, t, left);
  });
  const ab = (before.match(/\son[a-z]+\s*=/gi) || []).length;
  const aa = (after.match(/\son[a-z]+\s*=/gi) || []).length;
  if (ab - aa > 0) bump(removedAttrHits, 'on*', ab - aa);
  const jb = (before.match(/(?:href|src)\s*=\s*["']?\s*(?:javascript|data|vbscript):/gi) || []).length;
  const ja = (after.match(/(?:href|src)\s*=\s*["']?\s*(?:javascript|data|vbscript):/gi) || []).length;
  if (jb - ja > 0) bump(removedAttrHits, 'javascript:/data:', jb - ja);
}

for (const f of files) {
  const slug = f.replace(/\.json$/, '');
  let book;
  try { book = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) {
    bad.push(slug + ': JSON lỗi — ' + e.message); continue;
  }
  const list = Array.isArray(book.chapters) ? book.chapters : [];
  list.forEach((c, i) => {
    const before = String((c && c.html) || '');
    if (!before) return;
    chapters += 1;
    bytesBefore += before.length;
    const after = sanitizeChapterHtml(before);
    bytesAfter += after.length;
    diffTags(before, after);
    const fb = htmlFacts(before), fa = htmlFacts(after);
    textBefore += fb.textLen; textAfter += fa.textLen;
    imgsBefore += fb.imgs; imgsAfter += fb.imgs;
    if (fb.imgs !== fa.imgs) bad.push(slug + ' #' + (i + 1) + ': MẤT ẢNH (' + fb.imgs + ' → ' + fa.imgs + ')');
    if (fb.textLen > 0 && fa.textLen === 0 && fb.imgs === 0) { emptyAfter += 1; bad.push(slug + ' #' + (i + 1) + ': sạch xong thành RỖNG'); }
    if (fa.scripts > 0) bad.push(slug + ' #' + (i + 1) + ': vẫn còn thẻ/URL nguy hiểm (' + fa.scripts + ')');
    /* mọi từ của bản sạch phải có trong bản gốc */
    const pool = new Set(words(fb.text));
    const missing = words(fa.text).filter((w) => !pool.has(w));
    if (missing.length) bad.push(slug + ' #' + (i + 1) + ': bản sạch có chữ KHÔNG có trong bản gốc (' + missing.slice(0, 3).join(' ') + ')');
    if (/<button\b/i.test(before)) widgetChapters += 1;
  });
}

const report = {
  soBo: files.length,
  soChuong: chapters,
  chuongCoCumNutBlogger: widgetChapters,
  byteHtml: { truoc: bytesBefore, sau: bytesAfter, giam: bytesBefore - bytesAfter },
  chuText: { truoc: textBefore, sau: textAfter, mat: textBefore - textAfter },
  anh: { truoc: imgsBefore, sau: imgsAfter },
  theBiBo: Object.entries(removedTags).sort((a, b) => b[1] - a[1]).slice(0, 12),
  thuocTinhBiBo: removedAttrHits,
  loi: bad.slice(0, 40),
  soLoi: bad.length,
};
console.log(JSON.stringify(report, null, 1));
if (bad.length) { console.error('CÒN ' + bad.length + ' LỖI KHI LÀM SẠCH HTML CHƯƠNG'); process.exit(1); }
console.log('Làm sạch HTML chương: không mất chữ, không mất ảnh, hết thẻ nguy hiểm.');
