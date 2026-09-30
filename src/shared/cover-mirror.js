/* ============================================================================
   cover-mirror.js · G7 — bìa sao lưu thành TỆP TĨNH trên Cloudflare Pages
   ----------------------------------------------------------------------------
   Dùng chung cho trình duyệt (cz-app.js bundle vào) và tools/mirror_covers.mjs
   ⇒ hai bên luôn tính cùng một tên tệp cho cùng một link bìa.

   Vì sao tệp tĩnh mà không phải Supabase Storage: người đọc tải bìa từ Supabase
   bị tính vào 5 GB egress/tháng (vượt là bị chặn, ảnh chương chết theo); tệp
   tĩnh trên Pages không tính băng thông, không có trần để chạm.

   Tên tệp = FNV-1a 32-bit của URL gốc (UTF-8) ⇒ biên tập viên đổi bìa là ra URL
   mới, không trùng khoá cũ ⇒ tự dùng link mới cho tới lần sao lưu sau, không bao
   giờ hiện nhầm bìa cũ. Registry/KV không bị sửa gì.
   ========================================================================== */
export const MIRROR_DIR = '/assets/covers/';

export function coverKey(url) {
  const s = String(url == null ? '' : url);
  const bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(s) : null;
  let h = 0x811c9dc5;
  const n = bytes ? bytes.length : s.length;
  for (let i = 0; i < n; i++) {
    h ^= bytes ? bytes[i] : (s.charCodeAt(i) & 0xff);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* chỉ link http(s) TUYỆT ĐỐI mới được thay — link tương đối/data:/blob: giữ nguyên */
export function mirrorPath(url, keys) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u) || !keys || !keys.length) return '';
  const k = coverKey(u);
  return keys.indexOf(k) >= 0 ? MIRROR_DIR + k + '.webp' : '';
}
