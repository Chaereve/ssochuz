/* ============================================================================
   ssochuz · HẸN GIỜ CHƯƠNG — bản DÙNG CHUNG cho Worker + trang quản trị
   ----------------------------------------------------------------------------
   Vì sao phải là một file: trước đây ô “Trạng thái chương” trong admin có lựa
   chọn “Hẹn giờ” nhưng KHÔNG có chỗ nhập giờ và Worker cũng không đọc trạng
   thái chương — bấm Hẹn giờ rồi lưu thì chương vẫn hiện ra ngoài web ngay.
   Giờ luật nằm đúng một nơi, cả Worker (lọc chương khi trả /api/book) lẫn
   trang quản trị (hiện nhãn “còn N giờ nữa mới lên sóng”) dùng chung.

   Quy ước dữ liệu (nằm trong chính object chương, không thêm bảng):
     · status: 'draft' | 'scheduled' | 'published' | 'hidden'
     · at    : ISO UTC ('2026-09-25T13:00:00.000Z') — mốc chương lên sóng
   “Chương chưa lên sóng” = status 'hidden', hoặc status 'scheduled' CÓ mốc
   giờ ở TƯƠNG LAI. Chương chọn 'scheduled' mà chưa có giờ (dữ liệu cũ, hoặc
   người sửa chưa kịp nhập) vẫn coi như đang hiện — không im lặng ẩn mất
   chương của người ta.
   ============================================================================ */

export const CHAPTER_STATUSES = [
  { id: 'published', label: 'Xuất bản', hint: 'Độc giả thấy ngay khi lưu.' },
  { id: 'scheduled', label: 'Hẹn giờ', hint: 'Chương chỉ hiện khi tới mốc giờ đã đặt.' },
  { id: 'hidden', label: 'Ẩn', hint: 'Chương nằm trong bộ nhưng độc giả không thấy.' },
  { id: 'draft', label: 'Nháp', hint: 'Chỉ là nhãn ghi chú trong admin — chương vẫn hiện ngoài web.' },
];

export function chapterStatusLabel(status) {
  const hit = CHAPTER_STATUSES.find((s) => s.id === String(status || '').toLowerCase());
  return (hit && hit.label) || 'Xuất bản';
}

/* Date.parse chấp nhận cả ISO UTC lẫn “2026-09-25 20:00” (bản cũ lưu kiểu này) */
export function atMs(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return 0;
  let t = Date.parse(s);
  if (Number.isNaN(t)) t = Date.parse(s.replace(' ', 'T'));
  return Number.isNaN(t) ? 0 : t;
}

export function chapterAtMs(chapter) {
  if (!chapter || typeof chapter !== 'object') return 0;
  return atMs(chapter.at || chapter.scheduleAt || chapter.publishAt || chapter.publishedAt);
}

export function chapterStatusOf(chapter) {
  return String((chapter && chapter.status) || '').trim().toLowerCase();
}

/* Chương có đang bị giữ lại không? (chưa tới giờ, hoặc bị ẩn) */
export function isChapterPending(chapter, now) {
  const st = chapterStatusOf(chapter);
  if (st === 'hidden') return true;
  if (st !== 'scheduled') return false;
  const at = chapterAtMs(chapter);
  return at > 0 && at > (Number(now) || Date.now());
}

/* Vì sao đang bị giữ: '' (đang hiện) | 'hidden' | 'scheduled' */
export function chapterPendingReason(chapter, now) {
  if (!isChapterPending(chapter, now)) return '';
  return chapterStatusOf(chapter) === 'hidden' ? 'hidden' : 'scheduled';
}

export function countVisibleChapters(chapters, now) {
  const list = Array.isArray(chapters) ? chapters : [];
  return list.reduce((sum, c) => sum + (isChapterPending(c, now) ? 0 : 1), 0);
}

export function countPendingChapters(chapters, now) {
  const list = Array.isArray(chapters) ? chapters : [];
  return list.reduce((sum, c) => sum + (isChapterPending(c, now) ? 1 : 0), 0);
}

/* Mốc giờ SỚM NHẤT của các chương đang hẹn giờ (bỏ qua chương đã bị ẩn tay) */
export function nextScheduleMs(chapters, now) {
  const list = Array.isArray(chapters) ? chapters : [];
  const t = Number(now) || Date.now();
  let min = 0;
  list.forEach((c) => {
    if (chapterStatusOf(c) !== 'scheduled') return;
    const at = chapterAtMs(c);
    if (at > t && (!min || at < min)) min = at;
  });
  return min;
}

/* Nhãn cho danh sách chương trong admin: 'Hẹn 25/09 20:00' / 'Đã tới giờ' */
export function scheduleLabelOf(chapter, now) {
  const t = Number(now) || Date.now();
  const st = chapterStatusOf(chapter);
  if (st === 'scheduled') {
    const at = chapterAtMs(chapter);
    if (!at) return 'Chưa đặt giờ';
    if (at <= t) return 'Đã tới giờ · đang hiện';
    const d = new Date(at);
    const pad = (n) => String(n).padStart(2, '0');
    return 'Hẹn ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  if (st === 'hidden') return 'Đang ẩn';
  return '';
}

/* ---------------------------------------------------------------- datetime-local
   Ô <input type="datetime-local"> chỉ làm việc với giờ ĐỊA PHƯƠNG dạng
   'YYYY-MM-DDTHH:mm'. Kho lưu ISO UTC để Worker so giờ không lệ thuộc máy
   người sửa — hai hàm dưới là chỗ đổi qua lại duy nhất. */
export function isoToLocalInput(iso) {
  const t = atMs(iso);
  if (!t) return '';
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function localInputToIso(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '';
  const t = Date.parse(s);
  if (Number.isNaN(t)) return '';
  return new Date(t).toISOString();
}

/* Cảnh báo cho người sửa (trả '' khi không có gì phải nói) */
export function scheduleWarning(chapter, now) {
  const t = Number(now) || Date.now();
  const st = chapterStatusOf(chapter);
  if (st !== 'scheduled') return '';
  const at = chapterAtMs(chapter);
  if (!at) return 'Chưa đặt mốc giờ — chương vẫn hiện ngoài web. Nhập giờ rồi lưu lại.';
  if (at <= t) return 'Mốc giờ đã qua — chương đang hiện ngoài web.';
  return '';
}

/* Số giờ còn lại tới mốc hẹn (làm tròn lên), 0 khi không hẹn/đã tới giờ */
export function hoursUntil(at, now) {
  const t = Number(now) || Date.now();
  const ms = Number(at) - t;
  if (!(ms > 0)) return 0;
  return Math.ceil(ms / 3600000);
}
