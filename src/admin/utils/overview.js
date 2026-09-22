import { daysSince, statusCls } from './format.js';

function countMismatch(book) {
  if ((book.chapters || 0) === 0 && statusCls(book.status) === 'soon') return false;
  const match = String(book.countLabel || '').match(/^(\d+)\s*\/\s*(\d+|—)$/);
  if (!match) return false;
  if (match[2] === '—') return parseInt(match[1], 10) !== 0;
  return parseInt(match[1], 10) !== (book.chapters || 0);
}

export function computeOverview(registry, statsItems = {}) {
  const lib = (registry && registry.lib) || [];
  const picked = {};
  const task = (key, title, hint, list) => {
    list.forEach((book) => { if (book && book.slug) picked[book.slug] = 1; });
    return { key, title, hint, count: list.length, items: list.slice(0, 6) };
  };
  const tasks = [
    task('nosyn', 'Thiếu mô tả', 'Trang truyện và thẻ ở thư viện sẽ trống phần giới thiệu', lib.filter((book) => !String(book.syn || '').trim())),
    task('nothumb', 'Thiếu ảnh bìa', 'Thẻ truyện chỉ còn khung giấy có chữ mờ', lib.filter((book) => !String(book.thumb || '').trim())),
    task('noslug', 'Thiếu slug / tác giả', 'Slug là đường dẫn của bộ, thiếu là không mở được trang truyện', lib.filter((book) => !String(book.slug || '').trim() || !String(book.author || '').trim())),
    task('noyear', 'Thiếu năm', 'Dùng cho bộ lọc năm và dòng thông tin trên thẻ', lib.filter((book) => !String(book.year || '').trim())),
    task('count', 'Nhãn số chương lệch', 'Nhãn ghi “x/y” nhưng số chương đã đăng không khớp x (bỏ qua Sắp ra mắt 0 chương)', lib.filter(countMismatch)),
    task('stale', '“Sắp ra mắt” đã lâu', 'Đăng hơn 45 ngày vẫn chưa có chương nào', lib.filter((book) => !(book.chapters || 0) && daysSince(book.updated) > 45)),
  ].filter((row) => row.count > 0);

  const statsKeys = Object.keys(statsItems || {});
  const sum = (field) => statsKeys.reduce((total, key) => total + (Number(statsItems[key] && statsItems[key][field]) || 0), 0);
  const has = lib.filter((book) => (book.chapters || 0) > 0).length;
  const soon = lib.filter((book) => statusCls(book.status) === 'soon').length;
  const chapters = lib.reduce((total, book) => total + (Number(book.chapters) || 0), 0);
  const eighteen = lib.filter((book) => book.is18).length;

  return {
    lib,
    tasks,
    missingInfoCount: Object.keys(picked).length,
    tiles: [
      { value: lib.length, label: 'Bộ truyện' },
      { value: has, label: 'Đã có chương' },
      { value: soon, label: 'Sắp ra mắt' },
      { value: chapters, label: 'Chương đã đăng' },
      { value: eighteen, label: 'Gắn 18+' },
      { value: Object.keys(picked).length, label: 'Thiếu thông tin' },
      { value: statsKeys.length, label: 'Bộ có số liệu' },
      { value: sum('views'), label: 'Lượt đọc (KV)' },
      { value: sum('votes'), label: 'Phiếu thích (KV)' },
    ],
    recent: lib.slice().sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || ''))).slice(0, 6),
  };
}

/* Bình luận nghi spam: có link, lặp ký tự, hoặc IN HOA quá nhiều */
export function spamSuspects(comments) {
  const list = (comments && comments.items) || [];
  return list.filter((comment) => {
    const text = String(comment.text || '');
    const letters = text.replace(/[^A-Za-zÀ-ỹ]/g, '');
    const upper = letters.replace(/[^A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĐ]/g, '');
    return /(https?:\/\/|www\.)/i.test(text)
      || /(.)\1{7,}/.test(text)
      || (letters.length > 20 && upper.length / Math.max(1, letters.length) > 0.75);
  });
}
