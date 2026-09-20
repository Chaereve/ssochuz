/* ============================================================================
   src/admin/lib/chapter.js · quy tắc CHUNG về một chương truyện
   ----------------------------------------------------------------------------
   Module THUẦN: không chạm DOM, chạy được trên Node → bài kiểm thử gọi thẳng.

   Quan trọng nhất là isPublic(): đây là MỘT nguồn sự thật duy nhất trả lời câu
   hỏi "chương này người đọc có được thấy không?". Worker phải dùng đúng logic
   này cho trang đọc, đếm số chương, registry, feed, push, sitemap, OG và bản
   đồng bộ repo — nếu mỗi nơi tự nghĩ một kiểu thì sẽ có chỗ rò chương nháp.
   ========================================================================== */

/* Chương công khai khi: KHÔNG phải nháp VÀ (không hẹn giờ HOẶC đã tới giờ).
   Chương cũ `{t, html}` không có hai trường này ⇒ mặc định công khai (tương
   thích ngược tuyệt đối — đây là điều kiện bắt buộc của bản nâng cấp). */
function isPublic(ch, now) {
  if (!ch || typeof ch !== 'object') return false;
  if (ch.draft) return false;
  if (!ch.publishAt) return true;
  const at = Date.parse(ch.publishAt);
  if (isNaN(at)) return true;            /* giờ hẹn hỏng ⇒ coi như không hẹn */
  return at <= (now == null ? Date.now() : now);
}

/* Trạng thái để hiển thị huy hiệu trong danh sách chương. */
function chapterState(ch, now) {
  if (!ch || typeof ch !== 'object') return 'published';
  if (ch.draft) return 'draft';
  if (ch.publishAt && !isPublic(ch, now)) return 'scheduled';
  return 'published';
}

/* Lọc danh sách chương công khai (dùng cho feed, đếm số, đồng bộ repo…). */
function publicChapters(chapters, now) {
  return (Array.isArray(chapters) ? chapters : []).filter((c) => isPublic(c, now));
}

/* Đếm số chương công khai — thay cho `chapters.length` ở mọi chỗ công khai. */
function publicCount(chapters, now) {
  return publicChapters(chapters, now).length;
}

/* Bóc chữ khỏi HTML mà KHÔNG cần DOM: bỏ thẻ, trả lại thực thể hay gặp.
   Dùng cho đếm từ và cho bài kiểm thử "không mất chữ". */
function htmlToText(html) {
  return String(html == null ? '' : html)
    .replace(/<!--[\s\S]*?-->/g, ' ')            /* chú thích HTML không phải chữ */
    .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|figure|figcaption|aside|hr)\s*>/gi, ' ')
    /* CHỈ bỏ thứ thật sự là thẻ: `</?chữ…>`. Truyện có emoticon kiểu `<3` và
       dấu so sánh `a < b` — nếu dùng /<[^>]*>/ thì những chỗ đó bị nuốt mất cả
       đoạn chữ phía sau. Đây từng là nguyên nhân báo "mất chữ" giả. */
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/* Đếm từ theo cách hợp lý với tiếng Việt: tách theo khoảng trắng. */
function countWords(html) {
  const t = htmlToText(html);
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/* Thời gian đọc ước lượng. Người Việt đọc ~200 từ/phút. Tối thiểu 1 phút. */
function readingMinutes(html, wpm) {
  const n = countWords(html);
  if (!n) return 0;
  return Math.max(1, Math.round(n / (wpm || 200)));
}

export { isPublic, chapterState, publicChapters, publicCount, htmlToText, countWords, readingMinutes };
