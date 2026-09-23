/* ============================================================================
   ssochuz · BÓC TÊN CHƯƠNG — bản DÙNG CHUNG duy nhất cho 3 nơi:
     · src/cz-app.js   → window.CZ.chapInfo  (web ngưới đọc: chủ / truyện / đọc)
     · src/admin/…     → import trực tiếp   (trang quản trị, bundle esbuild)
     · worker/cms.js   → import trực tiếp   (Cloudflare Worker nhập chương)
   Vì sao phải là một file: ba nơi từng có 3 bộ regex khác nhau nên truyện có
   “Lời mở đầu”, “Giới thiệu nhân vật” hay “Chương 0” bị mỗi nơi hiểu một kiểu
   (nơi thì gọi là Chương 1, nơi gộp sai nhóm, Worker thì đánh số mới trật).
   ============================================================================ */

/* La Mã hỗ trợ tới 499 (I..CDXCIX) — đủ cho mọi bộ truyện thực tế. */
const ROMAN_DIGIT = { m: 1000, d: 500, c: 100, l: 50, x: 10, v: 5, i: 1 };
export function romanToInt(s) {
  const t = String(s || '').toLowerCase().trim();
  if (!/^[ivxlcdm]{1,8}$/.test(t)) return 0;
  let sum = 0;
  for (let i = 0; i < t.length; i++) {
    const cur = ROMAN_DIGIT[t[i]] || 0;
    const nxt = ROMAN_DIGIT[t[i + 1]] || 0;
    sum += cur < nxt ? -cur : cur;
  }
  return sum >= 1 && sum <= 499 ? sum : 0;
}

/* Nhận dạng số chương: "12" / "12.5" / "12,5" / La Mã "iv" — trả 0 khi hỏng. */
function numOf(raw) {
  const t = String(raw || '').trim().replace(',', '.');
  if (!t) return 0;
  if (/^\d+(?:\.\d+)?$/.test(t)) return parseFloat(t) || 0;
  return romanToInt(t);
}

/* “Chương 12”, “Chap 3.5”, “Chapter iv”, “Hồi 2”, “Quyển 1”, “Tập 7”, “EP 9”… */
const CHAP_NUM_RE = /^(?:chương|chuong|chap|chapter|quyển|quyen|khổ|kho|hồi|hoi|tập|tap|ep(?:isode)?)\b\s*[-–—.]?\s*(\d+(?:[.,]\d+)?|[ivxlcdm]+)\s*[:.\-–—]?\s*(.*)$/i;

/* Ngoại truyện/phụ chương — có thể kèm số: “Ngoại truyện 2”, “Side story: …” */
const EXTRA_RE = /^(ngoại\s*truyện|ngoai\s*truyen|phụ\s*chương|phu\s*chuong|phiên\s*ngoại|phien\s*ngoai|side\s*story|extra|hậu\s*truyện|hau\s*truyen|epilogue|lời\s*bạt|loi\s*bat|bạt\s*truyện|bat\s*truyen|đặc\s*biệt|dac\s*biet)\s*(\d+(?:[.,]\d+)?|[ivxlcdm]+)?\s*[:.\-–—]?\s*(.*)$/i;

/* Phần mở đầu — “Lời mở đầu”, “Prologue”, “Giới thiệu nhân vật”, “Thông báo”… */
const OPEN_RE = /^(lời\s*mở\s*đầu|loi\s*mo\s*dau|mở\s*đầu|mo\s*dau|prologue|đôi\s*lời|doi\s*loi|lời\s*tác\s*giả|loi\s*tac\s*gia|lời\s*ngõ|loi\s*ngo|author'?s?\s*note|giới\s*thiệu|gioi\s*thieu(\s*\S+)?|nhân\s*vật|nhan\s*vat|thông\s*báo|thong\s*bao|notice|announcement|credits?)\s*(\d+(?:[.,]\d+)?)?\s*[:.\-–—]?\s*(.*)$/i;

/* Test nguyên câu (khi tên chương đã kèm số nhưng nội dung vẫn là mở đầu/ngoại
   truyện, vd “Chương 15: Ngoại truyện Tết”) — bước chẩn lỏng, từ khoá chắc. */
const OPEN_ANY_RE = /(lời\s*mở\s*đầu|loi\s*mo\s*dau|mở\s*đầu|mo\s*dau|prologue|đôi\s*lời|doi\s*loi|lời\s*tác\s*giả|loi\s*tac\s*gia|lời\s*ngõ|loi\s*ngo|author'?s?\s*note|giới\s*thiệu\s*nhân\s*vật|gioi\s*thieu\s*nhan\s*vat)/i;
const EXTRA_ANY_RE = /(ngoại\s*truyện|ngoai\s*truyen|phụ\s*chương|phu\s*chuong|phiên\s*ngoại|phien\s*ngoai|side\s*story|\bextra\b|hậu\s*truyện|hau\s*truyen|\bepilogue\b|lời\s*bạt|loi\s*bat|đặc\s*biệt|dac\s*biet)/i;

export function chapterKind(t) {
  const s = String(t || '').toLowerCase();
  if (EXTRA_ANY_RE.test(s)) return 'extra';
  if (OPEN_ANY_RE.test(s) || OPEN_RE.test(String(t || '').trim())) return 'open';
  return 'main';
}

/* Phân tích tiêu đề chương →
   { no, has, kind, name, full }
   · no   : số chương bóc được (0 khi không có / không đọc được; “Chương 0” →
            no = 0 nhưng has = true — hai chuyện khác nhau, đừng gộp)
   · has  : tiêu đề CÓ ghi số tường minh hay không
   · kind : 'open' (lời mở đầu / giới thiệu nhân vật / chương 0 …)
          | 'extra' (ngoại truyện / phụ chương / epilogue …)
          | 'main'  (chương chính; số nguyên hoặc thập phân như 12.5)
   · name : phần tên riêng còn lại sau số chương (hoặc toàn bộ tiêu đề)
   · full : tiêu đề nguyên gốc (đã chuẩn hoá khoảng trắng) */
export function parseChapterTitle(title) {
  const full = String(title || '').replace(/\s+/g, ' ').trim();
  if (!full) return { no: 0, has: false, kind: 'main', name: '', full: '' };
  /* Ngoại truyện/bạt thử TRƯỚC chương-số: “Epilogue: …” có thể bị regex
     chương-số tóm nhầm (“ep” + số La Mã “il”). */
  let m = EXTRA_RE.exec(full);
  if (m) {
    const no = numOf(m[2]);
    const name = String(m[3] || '').trim() || full;
    return { no, has: no > 0, kind: 'extra', name, full };
  }
  m = CHAP_NUM_RE.exec(full);
  if (m) {
    const no = numOf(m[1]);
    /* “Chương 0” tính là phần mở đầu, KHÔNG được đếm là Chương 1 */
    const kind = no === 0 ? 'open' : chapterKind(full);
    const name = String(m[2] || '').trim() || full;
    return { no, has: true, kind, name, full };
  }
  m = OPEN_RE.exec(full);
  if (m) {
    const name = String(m[m.length - 1] || '').trim() || full;
    return { no: 0, has: false, kind: 'open', name, full };
  }
  const kind = chapterKind(full);
  return { no: 0, has: false, kind, name: full, full };
}

/* Số chương CHÍNH tiếp theo để gợi ý khi thêm chương:
   · Bộ có “Lời mở đầu”/giới thiệu rồi mới tới chương số → lấy số chính lơn
     nhất + 1 (không tính phần mở đầu, không tính ngoại truyện).
   · Bộ chỉ có mở đầu/ngoại truyện (chưa có chương chính nào) → bắt đầu từ 1.
   · Bộ không đánh số chương nào → đếm số chương chính + 1 (giống hành vi cũ). */
export function nextMainChapterNo(chapters) {
  const arr = Array.isArray(chapters) ? chapters : [];
  let maxMain = 0, mainCount = 0;
  arr.forEach((c) => {
    const t = (c && (c.t != null ? c.t : (c.title != null ? c.title : c.name))) || '';
    const p = parseChapterTitle(String(t));
    if (p.kind !== 'main') return;
    mainCount++;
    if (p.has && p.no > maxMain) maxMain = p.no;
  });
  if (maxMain > 0) return Math.floor(maxMain) + 1;
  return mainCount + 1;
}

export function suggestChapterTitle(chapters) {
  return 'Chương ' + nextMainChapterNo(chapters);
}

/* Dòng tiêu đề khi tách file .txt: “Chương X …” (kể cả “Hồi”, “Quyển”, số La
   Mã, số thập phân) + phần mở đầu/ngoại truyện; hoặc tiêu đề markdown (# …).
   Chỉ đếm tiêu đề MARKDOWN khi ngắn gọn, không phải mọi dòng ngắn. */
export function isChapterHeading(line) {
  const t = String(line || '').trim();
  if (!t || t.length > 90) return false;
  const bare = t.replace(/^#{1,3}\s+/, '');
  if (CHAP_NUM_RE.test(bare) || EXTRA_RE.test(bare) || OPEN_RE.test(bare)) return true;
  return /^#{1,3}\s+\S/.test(t) && t.length <= 60;
}

/* Một chương rỗng thực sự: KHÔNG chữ và KHÔNG media. Chương chỉ có hình ảnh
   (truyện tranh/webtoon, bìa nội dung…) PHĨ được tính là có nội dung. */
export function chapterHasMedia(html) {
  return /<(img|video|audio|iframe|embed|object|figure|table|canvas|svg|picture|hr)\b/i.test(String(html || ''));
}

export function chapterTextOf(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function chapterIsEmpty(html) {
  const raw = String(html || '');
  if (chapterTextOf(raw)) return false;
  return !chapterHasMedia(raw);
}
