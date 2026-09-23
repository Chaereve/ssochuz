/* Chặn blob:/data: trong HTML chương — không được ghi KV nếu còn ảnh tạm. */

export function tempMediaInHtml(html) {
  const s = String(html || '');
  const found = [];
  const re = /(?:src|href)\s*=\s*["']((?:blob|data):[^"']+)["']/gi;
  let m;
  while ((m = re.exec(s))) found.push(m[1]);
  if (/url\(\s*['"]?(?:blob|data):/i.test(s) && !found.length) found.push('(css url tạm)');
  return found;
}

export function hasTempMedia(html) {
  return tempMediaInHtml(html).length > 0;
}
