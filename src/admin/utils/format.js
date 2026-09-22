export const cz = () => window.CZ || {};
export const esc = (value) => (cz().esc ? cz().esc(value) : String(value == null ? '' : value));
export const num = (value) => (cz().num ? cz().num(value) : (Number(value) || 0).toLocaleString('vi-VN'));
export const icon = (name, cls = 'i-s') => (cz().icon ? cz().icon(name, cls) : '');
export const dateVN = (value) => (cz().dateVN ? cz().dateVN(value) : String(value || '—'));
export const countText = (book) => (cz().countText ? cz().countText(book) : `${Number(book && book.chapters) || 0} chương`);
export const statusCls = (status) => (cz().statusCls ? cz().statusCls(status) : (/sắp/i.test(String(status || '')) ? 'soon' : /hoàn/i.test(String(status || '')) ? 'done' : 'updating'));

export function daysSince(dateLike) {
  if (!dateLike) return 9999;
  const time = Date.parse(String(dateLike) + 'T00:00:00');
  if (Number.isNaN(time)) return 9999;
  return Math.round((Date.now() - time) / 86400000);
}

export function pct(value, total) {
  const t = Math.max(1, Number(total) || 1);
  return Math.max(0, Math.min(100, Math.round((Number(value) || 0) / t * 100)));
}
