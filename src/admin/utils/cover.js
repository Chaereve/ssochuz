/* URL bìa bền: không bao giờ lưu blob: / data: — chỉ đường dẫn Worker hoặc https. */

export function isTempUrl(value) {
  const s = String(value || '').trim();
  return !s || /^blob:/i.test(s) || /^data:/i.test(s);
}

export function resolveCover(src, apiBase) {
  let s = String(src || '').trim();
  if (isTempUrl(s)) return '';
  if (/^\/api\/img\//i.test(s) && apiBase) return String(apiBase).replace(/\/+$/, '') + s;
  return s;
}

export function coverOf(book, apiBase) {
  if (!book) return '';
  const primary = resolveCover(book.thumb || book.cover_image_url || book.cover, apiBase);
  if (primary) return primary;
  return resolveCover(book.slide, apiBase);
}

export function persistableCover(url) {
  const s = String(url || '').trim();
  if (isTempUrl(s)) return '';
  return s;
}
