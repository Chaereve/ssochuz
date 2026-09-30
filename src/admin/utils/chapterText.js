/* Xử lý văn bản chương THUẦN (không cần Tiptap) — tách khỏi richTextEditor.js để
   admin.js dùng được mà không kéo theo trình soạn thảo (≈ 315 KB). */
import { isChapterHeading, suggestChapterTitle } from '../../shared/chapters.js';

export function htmlStats(html) {
  const text = String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(/\s+/).length : 0;
  return { text, words, chars: text.length };
}

export function fileToChapterHtml(text, name = '') {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';
  if (/\.html?$/i.test(name) || /<\/?(p|div|br|h\d|img|blockquote|ul|ol|li)\b/i.test(raw)) return raw;
  return raw.split(/\n{2,}/).map((part) => '<p>' + part.trim().replace(/\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>').join('\n');
}

/* Tách văn bản thuần (.txt hoặc trích từ .docx) thành nhiều chương:
   dòng "Chương X …" (có/không dấu # ở đầu; nhận cả Hồi/Quyển/Tập, số La Mã,
   số thập phân) đánh dấu chương mới — cùng "Lờí mở đầu", "Giới thiệu nhân
   vật", "Ngoại truyện"… (src/shared/chapters.js). Đoạn thường thành <p>;
   1 khối giữa hai tiêu đề = nội dung chương đó. Phần không có tiêu đề được
   đánh số THEO chương chính kế tiếp (không tính mở đầu là Chương 1). */
export function splitChaptersTxt(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = (body) => body.join('\n').split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean)
    .map((p) => '<p>' + esc(p) + '</p>').join('\n');
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); };
  lines.forEach((line) => {
    if (isChapterHeading(line)) {
      flush();
      cur = { t: line.trim().replace(/^#{1,3}\s*/, ''), html: '' };
    } else {
      if (!cur) cur = { t: '', html: '' };
      cur.html += (cur.html ? '\n' : '') + line.trim();
    }
  });
  flush();
  return out
    .map((c, i) => ({ t: c.t || suggestChapterTitle(out.slice(0, i)), html: paras(c.html.split('\n')) }))
    .filter((c) => c.html);
}
